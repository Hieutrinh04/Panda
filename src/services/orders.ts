import type {
  CartItem, Database, DeliveryMethod, Id, Order, OrderItem, OrderRequest, OrderStatus, OrderType, PaymentMethod,
  PaymentType, Product, RequestType, User, Variant,
} from '../types'
import { getDb, mutate } from '../data/store'
import { addDays, daysBetween, money, nowISO, rentalDays, today, toDateInput, uid } from '../lib/format'
import { rentalAvailable } from './catalog'
import { fail, log, notify } from './core'
import { evaluateCoupon } from './promotions'
import { REQUEST_TYPE_LABEL, STATUS_LABEL } from './labels'

// ---------- Giỏ hàng ----------

export interface CheckoutLine {
  key: string
  product: Product
  variant: Variant
  mode: OrderType
  quantity: number
  rentalStart?: string
  rentalEnd?: string
  days: number
  unitPrice: number
  lineTotal: number
  deposit: number
  available: number
}

export function resolveLine(db: Database, item: Omit<CartItem, 'id'> & { id?: string }): CheckoutLine | undefined {
  const variant = db.variants.find((v) => v.id === item.variantId)
  const product = variant && db.products.find((p) => p.id === variant.productId)
  if (!variant || !product) return undefined
  const rental = item.mode === 'rental'
  const days = rental && item.rentalStart && item.rentalEnd ? rentalDays(item.rentalStart, item.rentalEnd) : 0
  const unitPrice = rental ? product.rentalPricePerDay : product.salePrice
  return {
    key: item.id ?? `${item.variantId}-${item.mode}-${item.rentalStart ?? ''}`,
    product, variant, mode: item.mode, quantity: item.quantity, rentalStart: item.rentalStart, rentalEnd: item.rentalEnd, days, unitPrice,
    lineTotal: rental ? unitPrice * days * item.quantity : unitPrice * item.quantity,
    deposit: rental ? product.deposit * item.quantity : 0,
    available: rental && item.rentalStart && item.rentalEnd ? rentalAvailable(db, variant.id, item.rentalStart, item.rentalEnd) : variant.stock,
  }
}

export const cartLines = (db: Database, customerId?: Id) =>
  (customerId ? db.carts[customerId] ?? [] : []).map((i) => resolveLine(db, i)).filter((l): l is CheckoutLine => Boolean(l))

export function addToCart(customerId: Id, item: Omit<CartItem, 'id'>) {
  mutate((db) => {
    const cart = (db.carts[customerId] ??= [])
    const same = cart.find((c) => c.variantId === item.variantId && c.mode === item.mode && c.rentalStart === item.rentalStart && c.rentalEnd === item.rentalEnd)
    const quantity = (same?.quantity ?? 0) + item.quantity
    const line = resolveLine(db, { ...item, quantity })
    if (!line) return fail('Sản phẩm không còn tồn tại.')
    if (quantity > line.available) fail(item.mode === 'rental' ? `Chỉ còn ${line.available} sản phẩm có thể thuê trong khoảng ngày này.` : `Chỉ còn ${line.available} sản phẩm trong kho.`)
    if (same) same.quantity = quantity
    else cart.push({ ...item, id: uid('ci-') })
  })
}

export function updateCartItem(customerId: Id, itemId: Id, patch: Partial<CartItem>) {
  mutate((db) => {
    const item = db.carts[customerId]?.find((c) => c.id === itemId)
    if (!item) return
    Object.assign(item, patch)
    if (item.mode === 'rental' && item.rentalStart && item.rentalEnd && item.rentalEnd < item.rentalStart) item.rentalEnd = item.rentalStart
    if (item.quantity < 1) item.quantity = 1
  })
}

export function removeCartItem(customerId: Id, itemId: Id) {
  mutate((db) => {
    db.carts[customerId] = (db.carts[customerId] ?? []).filter((c) => c.id !== itemId)
  })
}

// ---------- Báo giá & đặt hàng ----------

export interface QuoteInput {
  lines: CheckoutLine[]
  couponCode?: string
  pointsUsed?: number
  deliveryMethod: DeliveryMethod
  customer?: User
}

export interface Quote {
  subtotal: Record<OrderType, number>
  deposit: number
  shippingFee: number
  couponDiscount: number
  couponError?: string
  pointsUsed: number
  pointsDiscount: number
  total: number
}

export function quote(db: Database, input: QuoteInput): Quote {
  const subtotal = { sale: 0, rental: 0 }
  let deposit = 0
  for (const l of input.lines) {
    subtotal[l.mode] += l.lineTotal
    deposit += l.deposit
  }
  const goods = subtotal.sale + subtotal.rental
  const { shippingFee: fee, freeShippingFrom, pointValue } = db.settings
  const shippingFee = input.deliveryMethod === 'pickup' || goods === 0 || goods >= freeShippingFrom ? 0 : fee
  let couponDiscount = 0
  let couponError: string | undefined
  if (input.couponCode?.trim()) {
    try {
      couponDiscount = evaluateCoupon(db, input.couponCode, subtotal, input.customer).discount
    } catch (error) {
      couponError = error instanceof Error ? error.message : String(error)
    }
  }
  const maxPoints = Math.floor((goods - couponDiscount) / pointValue)
  const pointsUsed = Math.max(0, Math.min(input.pointsUsed ?? 0, input.customer?.points ?? 0, maxPoints))
  const pointsDiscount = pointsUsed * pointValue
  return { subtotal, deposit, shippingFee, couponDiscount, couponError, pointsUsed, pointsDiscount, total: goods - couponDiscount - pointsDiscount + shippingFee + deposit }
}

export interface PlaceOrderInput extends QuoteInput {
  customerName: string
  phone: string
  address: string
  paymentMethod: PaymentMethod
  channel: 'online' | 'store'
  createdBy?: Id
  note?: string
  /** Bán/cho thuê tại quầy: giao đồ cho khách ngay. */
  handOverNow?: boolean
  clearCart?: boolean
}

const orderCode = (db: Database) => {
  const prefix = `PD${toDateInput(new Date()).slice(2).replace(/-/g, '')}`
  const last = Math.max(0, ...db.orders.filter((o) => o.code.startsWith(prefix)).map((o) => Number(o.code.slice(prefix.length)) || 0))
  return `${prefix}${String(last + 1).padStart(3, '0')}`
}

function pay(db: Database, orderId: Id, type: PaymentType, amount: number, method: PaymentMethod, userId?: Id, note?: string) {
  if (amount === 0) return
  db.payments.unshift({ id: uid('pay-'), orderId, type, amount, method, userId, note, createdAt: nowISO() })
}

const staffIds = (db: Database) => db.users.filter((u) => u.role !== 'customer' && u.isActive).map((u) => u.id)

/** Thu các khoản của đơn (tiền hàng, phí giao, tiền cọc) nếu chưa thu. */
function collectOrderPayments(db: Database, order: Order, userId?: Id) {
  if (db.payments.some((p) => p.orderId === order.id && (p.type === 'sale' || p.type === 'rental'))) return
  pay(db, order.id, order.type, order.subtotal - order.discount, order.paymentMethod, userId)
  pay(db, order.id, 'shipping', order.shippingFee, order.paymentMethod, userId)
  pay(db, order.id, 'deposit', order.depositTotal, order.paymentMethod, userId)
}

export function placeOrders(input: PlaceOrderInput): Order[] {
  if (!input.lines.length) fail('Chưa có sản phẩm nào trong đơn.')
  if (input.customerName.trim().length < 2) fail('Vui lòng nhập họ tên người nhận.')
  if (!/^0\d{9,10}$/.test(input.phone.replace(/\s/g, ''))) fail('Số điện thoại không hợp lệ.')
  if (input.deliveryMethod === 'delivery' && input.address.trim().length < 5) fail('Vui lòng nhập địa chỉ giao hàng.')

  return mutate((db) => {
    // Kiểm tra lại tồn kho/lịch thuê với dữ liệu mới nhất.
    const lines = input.lines.map((l) => resolveLine(db, { variantId: l.variant.id, mode: l.mode, quantity: l.quantity, rentalStart: l.rentalStart, rentalEnd: l.rentalEnd })!)
    for (const l of lines) {
      if (l.product.status !== 'active') fail(`${l.product.name} hiện đã ngừng kinh doanh.`)
      if (l.mode === 'rental') {
        if (!l.rentalStart || !l.rentalEnd) fail(`Vui lòng chọn ngày thuê cho ${l.product.name}.`)
        if (input.channel === 'online' && l.rentalStart! < today()) fail(`Ngày bắt đầu thuê ${l.product.name} đã qua.`)
      }
      const sameVariant = lines.filter((x) => x.variant.id === l.variant.id && x.mode === l.mode).reduce((s, x) => s + x.quantity, 0)
      if (sameVariant > l.available) fail(`${l.product.name} (${l.variant.size}/${l.variant.color}) chỉ còn ${l.available} sản phẩm khả dụng.`)
    }

    const customer = db.users.find((u) => u.id === input.customer?.id)
    const q = quote(db, { ...input, lines, customer })
    if (input.couponCode?.trim() && q.couponError) fail(q.couponError)
    const goods = q.subtotal.sale + q.subtotal.rental
    const created: Order[] = []

    for (const type of ['sale', 'rental'] as const) {
      const group = lines.filter((l) => l.mode === type)
      if (!group.length) continue
      // Giảm giá chia theo tỉ lệ tiền hàng; phí giao chỉ tính vào đơn đầu tiên.
      const share = goods ? q.subtotal[type] / goods : 0
      const discount = Math.round((q.couponDiscount + q.pointsDiscount) * share)
      const shippingFee = created.length ? 0 : q.shippingFee
      const items: OrderItem[] = group.map((l) => ({
        productId: l.product.id, variantId: l.variant.id, name: l.product.name, sku: l.variant.sku, size: l.variant.size, color: l.variant.color,
        quantity: l.quantity, unitPrice: l.unitPrice, deposit: l.product.deposit, days: l.days,
      }))
      const depositTotal = group.reduce((s, l) => s + l.deposit, 0)
      const subtotal = q.subtotal[type]
      const now = nowISO()
      const order: Order = {
        id: uid('o-'), code: orderCode(db), type, channel: input.channel, customerId: customer?.id, customerName: input.customerName.trim(),
        phone: input.phone.replace(/\s/g, ''), address: input.deliveryMethod === 'pickup' ? `Nhận tại cửa hàng — ${db.settings.address}` : input.address.trim(),
        deliveryMethod: input.deliveryMethod, items, subtotal, discount, pointsUsed: Math.round(q.pointsUsed * share), shippingFee, depositTotal,
        total: subtotal - discount + shippingFee + depositTotal, couponCode: q.couponDiscount ? input.couponCode?.trim().toUpperCase() : undefined,
        paymentMethod: input.paymentMethod, status: input.channel === 'store' ? 'confirmed' : 'pending', note: input.note, createdBy: input.createdBy, createdAt: now,
        timeline: [{ status: 'pending', at: now, by: input.createdBy, note: input.channel === 'store' ? 'Tạo đơn tại cửa hàng' : 'Khách đặt hàng online' }],
      }
      if (type === 'rental') {
        const start = group.map((l) => l.rentalStart!).sort()[0]
        const end = group.map((l) => l.rentalEnd!).sort().at(-1)!
        order.rental = { startDate: start, endDate: end, lateFee: 0, damageFee: 0, depositRefunded: 0, extendedDays: 0 }
      }
      db.orders.unshift(order)
      created.push(order)

      if (type === 'sale')
        for (const l of group) {
          db.variants.find((v) => v.id === l.variant.id)!.stock -= l.quantity
          db.movements.unshift({ id: uid('mv-'), variantId: l.variant.id, type: 'sale', quantity: -l.quantity, note: `Đơn ${order.code}`, status: 'approved', userId: input.createdBy, createdAt: now })
        }

      // Thanh toán trực tuyến (giả lập cổng) hoặc tại quầy được ghi nhận ngay.
      // VNPay được ghi khi cổng báo thanh toán thành công (Edge Function vnpay).
      if (input.paymentMethod !== 'cod' && input.paymentMethod !== 'vnpay') collectOrderPayments(db, order, input.createdBy)

      if (input.channel === 'store') {
        order.timeline.push({ status: 'confirmed', at: now, by: input.createdBy })
        if (input.handOverNow) {
          if (type === 'sale') {
            order.status = 'completed'
            order.timeline.push({ status: 'completed', at: now, by: input.createdBy, note: 'Khách nhận hàng tại quầy' })
            awardPoints(db, order)
          } else if (order.rental!.startDate <= today()) {
            order.status = 'renting'
            order.rental!.deliveredAt = now
            order.rental!.conditionOut = 'Đã kiểm tra cùng khách tại quầy'
            order.timeline.push({ status: 'renting', at: now, by: input.createdBy, note: 'Giao đồ tại quầy' })
          }
        }
      }
      notify(db, customer?.id, `Đặt ${type === 'sale' ? 'mua' : 'thuê'} thành công #${order.code}`, `Tổng thanh toán ${money(order.total)}. Panda sẽ liên hệ xác nhận sớm.`, `/tai-khoan/don-hang/${order.id}`)
      if (input.channel === 'online')
        staffIds(db).forEach((id) => notify(db, id, `Đơn ${type === 'sale' ? 'mua' : 'thuê'} mới #${order.code}`, `${order.customerName} · ${money(order.total)}`, `/admin/${type === 'sale' ? 'don-mua' : 'don-thue'}?id=${order.id}`))
      log(db, input.createdBy ?? customer?.id, input.channel === 'store' ? 'Tạo đơn tại cửa hàng' : 'Khách đặt hàng', order.code)
    }

    if (customer && q.pointsUsed) customer.points -= q.pointsUsed
    const coupon = q.couponDiscount ? db.coupons.find((c) => c.code === input.couponCode?.trim().toUpperCase()) : undefined
    if (coupon) coupon.used += 1
    if (customer && input.clearCart) db.carts[customer.id] = []
    return created
  }, { remote: 'place_order' })
}

// ---------- Trạng thái đơn ----------

export const isOverdue = (o: Order) => o.type === 'rental' && o.status === 'renting' && !!o.rental && o.rental.endDate < today()

export const displayStatus = (o: Order) => (isOverdue(o) ? STATUS_LABEL.overdue : STATUS_LABEL[o.status])

export const paidAmount = (db: Database, orderId: Id) => db.payments.filter((p) => p.orderId === orderId).reduce((s, p) => s + p.amount, 0)

/** Đơn chọn VNPay nhưng khách chưa thanh toán xong. */
export const awaitingOnlinePayment = (db: Database, o: Order) =>
  o.paymentMethod === 'vnpay' && o.status !== 'cancelled' && !db.payments.some((p) => p.orderId === o.id && (p.type === 'sale' || p.type === 'rental'))

export function lateFeeFor(db: Database, order: Order, returnDate = today()) {
  if (!order.rental) return { days: 0, fee: 0 }
  const days = Math.max(0, daysBetween(order.rental.endDate, returnDate))
  const perDay = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  return { days, fee: Math.round((perDay * db.settings.lateFeePercentPerDay * days) / 100) }
}

/** Các bước tiếp theo hợp lệ cho đơn, dùng để hiển thị nút thao tác. */
export function nextSteps(o: Order): OrderStatus[] {
  if (o.type === 'sale') {
    if (o.status === 'pending') return ['confirmed', 'cancelled']
    if (o.status === 'confirmed') return o.deliveryMethod === 'pickup' ? ['completed', 'cancelled'] : ['shipping', 'cancelled']
    if (o.status === 'shipping') return ['completed']
    return []
  }
  if (o.status === 'pending') return ['confirmed', 'cancelled']
  if (o.status === 'confirmed') return ['renting', 'cancelled']
  if (o.status === 'renting') return ['returned']
  if (o.status === 'returned') return ['completed']
  return []
}

function awardPoints(db: Database, order: Order) {
  const customer = db.users.find((u) => u.id === order.customerId)
  if (!customer) return
  const earned = Math.floor((order.subtotal - order.discount) / db.settings.pointsPerAmount)
  if (earned > 0) {
    customer.points += earned
    order.pointsEarned = earned
    notify(db, customer.id, `Bạn nhận được ${earned} điểm thưởng`, `Từ đơn #${order.code}. Điểm có thể dùng để giảm giá cho đơn sau.`, '/tai-khoan/uu-dai')
  }
}

function restock(db: Database, order: Order, userId?: Id, note = 'Hoàn kho') {
  if (order.type !== 'sale') return
  for (const item of order.items) {
    const variant = db.variants.find((v) => v.id === item.variantId)
    if (!variant) continue
    variant.stock += item.quantity
    db.movements.unshift({ id: uid('mv-'), variantId: variant.id, type: 'cancel_return', quantity: item.quantity, note: `${note} ${order.code}`, status: 'approved', userId, createdAt: nowISO() })
  }
}

function cancelOrder(db: Database, order: Order, userId: Id | undefined, reason: string) {
  if (!['pending', 'confirmed'].includes(order.status)) fail('Chỉ hủy được đơn chưa giao.')
  restock(db, order, userId, 'Hủy đơn')
  const paid = paidAmount(db, order.id)
  // Tiền cọc hoàn riêng để báo cáo doanh thu không bị trừ nhầm phần cọc.
  const depositHeld = db.payments.filter((p) => p.orderId === order.id && (p.type === 'deposit' || p.type === 'deposit_refund')).reduce((s, p) => s + p.amount, 0)
  const method = order.paymentMethod === 'cod' ? 'cash' : order.paymentMethod
  if (depositHeld > 0) pay(db, order.id, 'deposit_refund', -depositHeld, method, userId, 'Hoàn cọc do hủy đơn')
  if (paid - depositHeld > 0) pay(db, order.id, 'refund', -(paid - depositHeld), method, userId, 'Hoàn tiền do hủy đơn')
  const customer = db.users.find((u) => u.id === order.customerId)
  if (customer && order.pointsUsed) customer.points += order.pointsUsed
  // Trả lại lượt dùng mã giảm giá khi mọi đơn của cùng lần đặt đều bị hủy.
  const siblings = db.orders.filter((o) => o.id !== order.id && o.couponCode && o.couponCode === order.couponCode && o.createdAt === order.createdAt && o.status !== 'cancelled')
  const coupon = order.couponCode && !siblings.length ? db.coupons.find((c) => c.code === order.couponCode) : undefined
  if (coupon) coupon.used = Math.max(0, coupon.used - 1)
  order.status = 'cancelled'
  order.timeline.push({ status: 'cancelled', at: nowISO(), by: userId, note: reason })
  notify(db, order.customerId, `Đơn #${order.code} đã được hủy`, paid > 0 ? `Panda sẽ hoàn ${money(paid)} cho bạn.` : reason, `/tai-khoan/don-hang/${order.id}`)
}

export interface AdvanceOptions { note?: string; condition?: string; damageFee?: number; returnDate?: string; carrier?: string; trackingCode?: string }

export function advanceOrder(userId: Id, orderId: Id, next: OrderStatus, options: AdvanceOptions = {}) {
  mutate((db) => {
    const order = db.orders.find((o) => o.id === orderId)
    if (!order) return fail('Không tìm thấy đơn.')
    if (!nextSteps(order).includes(next)) return fail('Thao tác không hợp lệ với trạng thái hiện tại.')
    const now = nowISO()

    if (next === 'cancelled') {
      cancelOrder(db, order, userId, options.note || 'Cửa hàng hủy đơn')
      log(db, userId, 'Hủy đơn', order.code)
      return
    }

    if (next === 'confirmed' && awaitingOnlinePayment(db, order)) fail('Khách chưa thanh toán đơn này qua VNPay.')

    if (next === 'shipping') {
      order.carrier = options.carrier?.trim() || undefined
      order.trackingCode = options.trackingCode?.trim() || undefined
    }

    if (next === 'renting') {
      if (order.rental!.startDate > addDays(today(), 1)) fail(`Đơn thuê bắt đầu từ ${order.rental!.startDate}, chưa đến ngày giao.`)
      order.rental!.deliveredAt = now
      order.rental!.conditionOut = options.condition || 'Nguyên vẹn'
      collectOrderPayments(db, order, userId)
      order.items.forEach((i) => db.movements.unshift({ id: uid('mv-'), variantId: i.variantId, type: 'rental_out', quantity: 0, note: `Giao đồ thuê ${order.code} (x${i.quantity})`, status: 'approved', userId, createdAt: now }))
    }

    if (next === 'returned') {
      const returnDate = options.returnDate || today()
      const late = lateFeeFor(db, order, returnDate)
      order.rental!.returnedAt = new Date(`${returnDate}T${new Date().toTimeString().slice(0, 8)}`).toISOString()
      order.rental!.conditionIn = options.condition || 'Nguyên vẹn'
      order.rental!.lateFee = late.fee
      order.rental!.damageFee = Math.max(0, options.damageFee ?? 0)
      pay(db, order.id, 'late_fee', late.fee, 'cash', userId, late.days ? `Trả trễ ${late.days} ngày` : undefined)
      pay(db, order.id, 'damage_fee', order.rental!.damageFee, 'cash', userId, options.condition)
      order.items.forEach((i) => db.movements.unshift({ id: uid('mv-'), variantId: i.variantId, type: 'rental_return', quantity: 0, note: `Nhận lại ${order.code} (x${i.quantity})`, status: 'approved', userId, createdAt: now }))
    }

    if (next === 'completed') {
      if (order.type === 'sale') collectOrderPayments(db, order, userId)
      else {
        // Hoàn cọc: trả lại tiền cọc, phí phát sinh đã được ghi thành khoản thu riêng.
        const deducted = order.rental!.lateFee + order.rental!.damageFee
        order.rental!.depositRefunded = Math.max(0, order.depositTotal - deducted)
        pay(db, order.id, 'deposit_refund', -order.depositTotal, 'cash', userId, deducted ? `Khấu trừ phí ${money(deducted)}, thực trả ${money(order.rental!.depositRefunded)}` : undefined)
      }
      awardPoints(db, order)
    }

    order.status = next
    order.timeline.push({ status: next, at: now, by: userId, note: options.note || options.condition })
    const [label] = STATUS_LABEL[next]
    const body =
      next === 'shipping' && order.carrier ? `Đơn đang được giao bởi ${order.carrier}${order.trackingCode ? `, mã vận đơn ${order.trackingCode}` : ''}.` :
      next === 'renting' ? `Hạn trả đồ: ${new Date(order.rental!.endDate).toLocaleDateString('vi-VN')}.` :
      next === 'completed' && order.type === 'rental' ? `Đã hoàn cọc ${money(order.rental!.depositRefunded)}.` : `Trạng thái mới: ${label}.`
    notify(db, order.customerId, `Đơn #${order.code}: ${label}`, body, `/tai-khoan/don-hang/${order.id}`)
    log(db, userId, `Cập nhật đơn → ${label}`, order.code)
  })
}

export function assignOrder(userId: Id, orderId: Id, staffId?: Id) {
  mutate((db) => {
    const order = db.orders.find((o) => o.id === orderId)!
    order.assignedTo = staffId
    if (staffId && staffId !== userId) notify(db, staffId, `Bạn được giao xử lý đơn #${order.code}`, order.customerName, `/admin/${order.type === 'sale' ? 'don-mua' : 'don-thue'}?id=${order.id}`)
    log(db, userId, 'Phân công xử lý đơn', order.code)
  })
}

export function recordPayment(userId: Id, orderId: Id, type: PaymentType, amount: number, method: PaymentMethod, note?: string) {
  if (!amount) fail('Số tiền phải khác 0.')
  mutate((db) => {
    const order = db.orders.find((o) => o.id === orderId)!
    pay(db, orderId, type, amount, method, userId, note)
    log(db, userId, 'Ghi nhận thanh toán', `${order.code} ${money(amount)}`)
  })
}

// ---------- Yêu cầu hủy / đổi trả / hoàn tiền / gia hạn ----------

export function requestEligibility(db: Database, order: Order): RequestType[] {
  const open = db.requests.some((r) => r.orderId === order.id && ['pending', 'forwarded'].includes(r.status))
  if (open) return []
  const types: RequestType[] = []
  if (['pending', 'confirmed'].includes(order.status)) types.push('cancel')
  const completedAt = order.timeline.findLast((t) => t.status === 'completed')?.at
  if (order.type === 'sale' && order.status === 'completed' && completedAt && Date.now() - new Date(completedAt).getTime() < 7 * 86_400_000) types.push('return')
  if (order.type === 'rental' && ['confirmed', 'renting'].includes(order.status)) types.push('extend')
  if (['cancelled', 'returned', 'completed'].includes(order.status) && paidAmount(db, order.id) > 0 && order.type === 'sale') types.push('refund')
  return types
}

export interface RequestInput { orderId: Id; type: RequestType; reason: string; extendDays?: number; refundAmount?: number }

export function createRequest(userId: Id, input: RequestInput) {
  if (input.reason.trim().length < 5) fail('Vui lòng mô tả lý do (ít nhất 5 ký tự).')
  if (input.type === 'extend' && (!input.extendDays || input.extendDays < 1)) fail('Số ngày gia hạn phải từ 1 trở lên.')
  mutate((db) => {
    const order = db.orders.find((o) => o.id === input.orderId)
    if (!order) return fail('Không tìm thấy đơn.')
    if (!requestEligibility(db, order).includes(input.type)) fail(`Đơn này không thể gửi yêu cầu ${REQUEST_TYPE_LABEL[input.type].toLowerCase()} lúc này.`)
    if (input.type === 'extend') {
      const end = order.rental!.endDate
      const blocked = order.items.find((i) => rentalAvailable(db, i.variantId, addDays(end, 1), addDays(end, input.extendDays!), order.id) < i.quantity)
      if (blocked) fail(`${blocked.name} đã có khách đặt thuê trong thời gian gia hạn.`)
    }
    // Nhân viên tạo yêu cầu thay khách tại quầy thì yêu cầu chuyển thẳng cho quản lý duyệt.
    const actor = db.users.find((u) => u.id === userId)
    const byStaff = actor?.role === 'staff'
    const request: OrderRequest = {
      id: uid('rq-'), orderId: order.id, customerId: order.customerId, type: input.type, reason: input.reason.trim(), extendDays: input.extendDays,
      refundAmount: input.refundAmount, status: byStaff ? 'forwarded' : 'pending', handledBy: byStaff ? userId : undefined,
      staffNote: byStaff ? 'Tiếp nhận tại cửa hàng' : undefined, createdAt: nowISO(), updatedAt: nowISO(),
    }
    db.requests.unshift(request)
    staffIds(db).forEach((id) => notify(db, id, `Yêu cầu ${REQUEST_TYPE_LABEL[input.type].toLowerCase()} #${order.code}`, request.reason, '/admin/yeu-cau'))
    log(db, userId, `Gửi yêu cầu ${REQUEST_TYPE_LABEL[input.type].toLowerCase()}`, order.code)
  })
}

/** Nhân viên tiếp nhận và chuyển yêu cầu cho quản lý phê duyệt. */
export function forwardRequest(userId: Id, requestId: Id, note: string) {
  mutate((db) => {
    const request = db.requests.find((r) => r.id === requestId)!
    if (request.status !== 'pending') fail('Yêu cầu đã được xử lý.')
    request.status = 'forwarded'
    request.staffNote = note.trim() || undefined
    request.handledBy = userId
    request.updatedAt = nowISO()
    db.users.filter((u) => u.role === 'manager').forEach((m) => notify(db, m.id, 'Có yêu cầu chờ duyệt', REQUEST_TYPE_LABEL[request.type], '/admin/yeu-cau'))
    log(db, userId, 'Chuyển yêu cầu cho quản lý', REQUEST_TYPE_LABEL[request.type])
  })
}

export function resolveRequest(userId: Id, requestId: Id, approve: boolean, note: string, refundAmount?: number) {
  mutate((db) => {
    const request = db.requests.find((r) => r.id === requestId)!
    if (!['pending', 'forwarded'].includes(request.status)) fail('Yêu cầu đã được xử lý.')
    const order = db.orders.find((o) => o.id === request.orderId)!
    const now = nowISO()
    if (approve) {
      if (request.type === 'cancel') cancelOrder(db, order, userId, `Chấp thuận yêu cầu hủy: ${request.reason}`)
      if (request.type === 'return') {
        restock(db, order, userId, 'Khách trả hàng')
        const amount = Math.min(refundAmount ?? order.subtotal - order.discount, paidAmount(db, order.id))
        pay(db, order.id, 'refund', -amount, order.paymentMethod === 'cod' ? 'cash' : order.paymentMethod, userId, 'Hoàn tiền đổi trả')
        // Thu hồi điểm thưởng đã cộng cho đơn bị trả lại.
        const buyer = db.users.find((u) => u.id === order.customerId)
        if (buyer && order.pointsEarned) {
          buyer.points = Math.max(0, buyer.points - order.pointsEarned)
          order.pointsEarned = 0
        }
        order.status = 'returned'
        order.timeline.push({ status: 'returned', at: now, by: userId, note: request.reason })
      }
      if (request.type === 'refund') {
        const amount = Math.min(refundAmount ?? request.refundAmount ?? 0, paidAmount(db, order.id))
        if (amount <= 0) fail('Số tiền hoàn không hợp lệ.')
        pay(db, order.id, 'refund', -amount, order.paymentMethod === 'cod' ? 'cash' : order.paymentMethod, userId, request.reason)
      }
      if (request.type === 'extend') {
        if (!['confirmed', 'renting'].includes(order.status)) fail('Đơn thuê đã kết thúc, không thể gia hạn. Hãy từ chối yêu cầu này.')
        const days = request.extendDays!
        const end = order.rental!.endDate
        const blocked = order.items.find((i) => rentalAvailable(db, i.variantId, addDays(end, 1), addDays(end, days), order.id) < i.quantity)
        if (blocked) fail(`${blocked.name} đã có khách khác đặt trong thời gian gia hạn.`)
        const extra = order.items.reduce((s, i) => s + i.unitPrice * i.quantity * days, 0)
        order.rental!.endDate = addDays(end, days)
        order.rental!.extendedDays += days
        order.items.forEach((i) => (i.days += days))
        order.subtotal += extra
        order.total += extra
        // Nếu tiền thuê chưa thu (COD, chưa giao) thì phần gia hạn được thu chung khi giao đồ.
        const collected = db.payments.some((p) => p.orderId === order.id && p.type === 'rental')
        if (collected) pay(db, order.id, 'rental', extra, order.paymentMethod === 'cod' ? 'cash' : order.paymentMethod, userId, `Gia hạn ${days} ngày`)
        order.timeline.push({ status: order.status, at: now, by: userId, note: `Gia hạn thêm ${days} ngày, hạn trả mới ${order.rental!.endDate}` })
      }
    }
    request.status = approve ? 'approved' : 'rejected'
    request.handledBy = userId
    request.staffNote = [request.staffNote, note.trim()].filter(Boolean).join(' · ') || undefined
    request.updatedAt = now
    notify(db, request.customerId, `Yêu cầu ${REQUEST_TYPE_LABEL[request.type].toLowerCase()} #${order.code} ${approve ? 'được chấp thuận' : 'bị từ chối'}`, note || request.reason, `/tai-khoan/don-hang/${order.id}`)
    log(db, userId, `${approve ? 'Duyệt' : 'Từ chối'} yêu cầu ${REQUEST_TYPE_LABEL[request.type].toLowerCase()}`, order.code)
  })
}

// ---------- Nhắc hạn trả đồ ----------

/** Tạo thông báo nhắc hạn trả (mỗi mốc chỉ tạo một lần). Gọi khi khách mở trang. */
export function syncRentalReminders(customerId: Id) {
  const due = getDb().orders.filter((o) => o.customerId === customerId && o.status === 'renting' && o.rental && o.rental.endDate <= addDays(today(), 1))
  if (!due.length) return
  const keys = new Set(getDb().notifications.map((n) => n.key))
  const pending = due.filter((o) => !keys.has(`${isOverdue(o) ? 'overdue' : 'due'}-${o.id}-${o.rental!.endDate}`))
  if (!pending.length) return
  mutate((db) => {
    for (const o of pending) {
      const overdue = isOverdue(o)
      const fee = lateFeeFor(db, o).fee
      notify(
        db, customerId,
        overdue ? `Đơn thuê #${o.code} đã quá hạn trả` : `Nhắc hạn trả đồ đơn #${o.code}`,
        overdue ? `Hạn trả là ${new Date(o.rental!.endDate).toLocaleDateString('vi-VN')}. Phí trễ tạm tính ${money(fee)}.` : `Vui lòng trả đồ trước ngày ${new Date(o.rental!.endDate).toLocaleDateString('vi-VN')} để được hoàn cọc đầy đủ.`,
        `/tai-khoan/don-hang/${o.id}`, `${overdue ? 'overdue' : 'due'}-${o.id}-${o.rental!.endDate}`,
      )
    }
  })
}
