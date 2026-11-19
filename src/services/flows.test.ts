// Kiểm thử các luồng nghiệp vụ chính trên kho dữ liệu cục bộ.
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDb } from '../data/store'
import { addDays, today } from '../lib/format'
import { login, registerCustomer } from './auth'
import { createMovement, reviewMovement } from './inventory'
import {
  advanceOrder, awaitingOnlinePayment, createRequest, forwardRequest, paidAmount, placeOrders, resolveLine, resolveRequest, type CheckoutLine, type PlaceOrderInput,
} from './orders'
import { reportSummary } from './reports'

const MANAGER = 'u-admin'
const STAFF = 'u-staff1'

const customer = () => getDb().users.find((u) => u.id === 'u-cus1')!
const variant = (id: string) => getDb().variants.find((v) => v.id === id)!
const order = (id: string) => getDb().orders.find((o) => o.id === id)!
const payments = (orderId: string) => getDb().payments.filter((p) => p.orderId === orderId)

// v-1-0-0: Áo dài lụa Sen (chỉ bán, 1.290.000đ) · v-11-0-1: Đầm dạ hội Ruby (thuê 300.000đ/ngày, cọc 1.000.000đ)
const SALE_VARIANT = 'v-3-0-0'
const RENTAL_VARIANT = 'v-11-0-1'

function line(variantId: string, mode: 'sale' | 'rental', quantity = 1, start?: string, end?: string): CheckoutLine {
  return resolveLine(getDb(), { variantId, mode, quantity, rentalStart: start, rentalEnd: end })!
}

function place(lines: CheckoutLine[], patch: Partial<PlaceOrderInput> = {}) {
  const c = customer()
  return placeOrders({
    lines, customer: c, customerName: c.fullName, phone: c.phone, address: c.addresses[0].line, deliveryMethod: 'delivery',
    paymentMethod: 'cod', channel: 'online', ...patch,
  })
}

beforeEach(() => resetDb())

describe('Đơn mua', () => {
  it('COD: trừ kho khi đặt, thu tiền và cộng điểm khi hoàn tất', () => {
    const before = variant(SALE_VARIANT).stock
    const points = customer().points
    const [o] = place([line(SALE_VARIANT, 'sale')])
    expect(o.status).toBe('pending')
    expect(variant(SALE_VARIANT).stock).toBe(before - 1)
    expect(paidAmount(getDb(), o.id)).toBe(0)

    advanceOrder(STAFF, o.id, 'confirmed')
    advanceOrder(STAFF, o.id, 'shipping', { trackingCode: 'GHN123' })
    advanceOrder(STAFF, o.id, 'completed')
    expect(order(o.id).status).toBe('completed')
    expect(paidAmount(getDb(), o.id)).toBe(o.total)
    expect(customer().points).toBe(points + Math.floor(o.subtotal / getDb().settings.pointsPerAmount))
  })

  it('VNPay: chưa ghi khoản thu khi đặt, chặn xác nhận khi khách chưa thanh toán', () => {
    const [o] = place([line(SALE_VARIANT, 'sale')], { paymentMethod: 'vnpay' })
    expect(paidAmount(getDb(), o.id)).toBe(0)
    expect(awaitingOnlinePayment(getDb(), order(o.id))).toBe(true)
    expect(() => advanceOrder(STAFF, o.id, 'confirmed')).toThrow(/chưa thanh toán/)
    // Khách không thanh toán: cửa hàng hủy đơn, không phát sinh hoàn tiền.
    advanceOrder(MANAGER, o.id, 'cancelled', { note: 'Quá hạn thanh toán' })
    expect(payments(o.id)).toHaveLength(0)
    expect(awaitingOnlinePayment(getDb(), order(o.id))).toBe(false)
  })

  it('Chuyển khoản rồi hủy: hoàn kho và hoàn đủ tiền', () => {
    const before = variant(SALE_VARIANT).stock
    const [o] = place([line(SALE_VARIANT, 'sale')], { paymentMethod: 'bank' })
    expect(paidAmount(getDb(), o.id)).toBe(o.total)
    advanceOrder(MANAGER, o.id, 'cancelled', { note: 'Khách đổi ý' })
    expect(variant(SALE_VARIANT).stock).toBe(before)
    expect(paidAmount(getDb(), o.id)).toBe(0)
  })

  it('Không cho đặt vượt tồn kho', () => {
    const stock = variant(SALE_VARIANT).stock
    expect(() => place([line(SALE_VARIANT, 'sale', stock + 1)])).toThrow(/chỉ còn/)
  })

  it('Áp mã giảm giá và kiểm tra đơn tối thiểu', () => {
    const [o] = place([line(SALE_VARIANT, 'sale')], { couponCode: 'PANDA10' })
    expect(o.discount).toBe(Math.min(Math.round(o.subtotal * 0.1), 200000))
    expect(() => place([line('v-10-0-0', 'sale')], { couponCode: 'THUE50K' })).toThrow(/đơn thuê/)
  })

  it('Hủy đơn trả lại lượt dùng mã giảm giá và điểm đã dùng', () => {
    const used = getDb().coupons.find((c) => c.code === 'PANDA10')!.used
    const points = customer().points
    const [o] = place([line(SALE_VARIANT, 'sale')], { couponCode: 'PANDA10', pointsUsed: 100 })
    expect(getDb().coupons.find((c) => c.code === 'PANDA10')!.used).toBe(used + 1)
    expect(customer().points).toBe(points - 100)
    advanceOrder(MANAGER, o.id, 'cancelled')
    expect(getDb().coupons.find((c) => c.code === 'PANDA10')!.used).toBe(used)
    expect(customer().points).toBe(points)
  })

  it('Đổi trả được duyệt: nhập lại kho, hoàn tiền và trừ điểm đã cộng', () => {
    const [o] = place([line(SALE_VARIANT, 'sale')])
    advanceOrder(STAFF, o.id, 'confirmed')
    advanceOrder(STAFF, o.id, 'shipping')
    advanceOrder(STAFF, o.id, 'completed')
    const stock = variant(SALE_VARIANT).stock
    const points = customer().points
    const earned = Math.floor(o.subtotal / getDb().settings.pointsPerAmount)

    createRequest('u-cus1', { orderId: o.id, type: 'return', reason: 'Size không vừa' })
    const request = getDb().requests[0]
    forwardRequest(STAFF, request.id, 'Hàng còn tem')
    resolveRequest(MANAGER, request.id, true, 'Đồng ý')

    expect(order(o.id).status).toBe('returned')
    expect(variant(SALE_VARIANT).stock).toBe(stock + 1)
    expect(paidAmount(getDb(), o.id)).toBe(o.shippingFee)
    expect(customer().points).toBe(points - earned)
  })

  it('Nhân viên chỉ chuyển yêu cầu, quản lý mới duyệt', () => {
    const [o] = place([line(SALE_VARIANT, 'sale')])
    createRequest('u-cus1', { orderId: o.id, type: 'cancel', reason: 'Đặt nhầm mẫu' })
    const request = getDb().requests[0]
    forwardRequest(STAFF, request.id, '')
    expect(getDb().requests[0].status).toBe('forwarded')
    resolveRequest(MANAGER, request.id, true, '')
    expect(order(o.id).status).toBe('cancelled')
  })
})

describe('Đơn thuê', () => {
  const start = () => today()
  const end = () => addDays(today(), 1)

  it('COD: thu khi giao, tính phí trễ khi trả muộn và hoàn cọc phần còn lại', () => {
    const [o] = place([line(RENTAL_VARIANT, 'rental', 1, start(), end())])
    expect(o.depositTotal).toBe(1000000)
    advanceOrder(STAFF, o.id, 'confirmed')
    advanceOrder(STAFF, o.id, 'renting', { condition: 'Nguyên vẹn' })
    expect(paidAmount(getDb(), o.id)).toBe(o.total)

    advanceOrder(STAFF, o.id, 'returned', { returnDate: addDays(end(), 2), condition: 'Nguyên vẹn', damageFee: 100000 })
    const rental = order(o.id).rental!
    expect(rental.lateFee).toBe(2 * 300000 * 0.5)
    advanceOrder(STAFF, o.id, 'completed')
    expect(order(o.id).rental!.depositRefunded).toBe(1000000 - 300000 - 100000)
    // Cửa hàng giữ lại tiền thuê + phí giao + phí trễ + bồi thường.
    expect(paidAmount(getDb(), o.id)).toBe(o.subtotal + o.shippingFee + 300000 + 100000)
  })

  it('Không cho thuê trùng lịch quá số lượng sẵn có', () => {
    const stock = variant(RENTAL_VARIANT).stock
    const s = addDays(today(), 10)
    const e = addDays(today(), 12)
    place([line(RENTAL_VARIANT, 'rental', stock, s, e)])
    expect(() => place([line(RENTAL_VARIANT, 'rental', 1, addDays(s, 1), addDays(e, 3))])).toThrow(/khả dụng/)
    // Khoảng ngày không trùng vẫn đặt được.
    expect(() => place([line(RENTAL_VARIANT, 'rental', 1, addDays(e, 1), addDays(e, 2))])).not.toThrow()
  })

  it('Chuyển khoản rồi hủy: hoàn cọc tách riêng, doanh thu không bị âm', () => {
    const revenueBefore = reportSummary(getDb(), today(), today()).revenue
    const [o] = place([line(RENTAL_VARIANT, 'rental', 1, addDays(today(), 3), addDays(today(), 4))], { paymentMethod: 'bank' })
    advanceOrder(MANAGER, o.id, 'cancelled')
    expect(paidAmount(getDb(), o.id)).toBe(0)
    expect(payments(o.id).some((p) => p.type === 'deposit_refund' && p.amount === -1000000)).toBe(true)
    expect(reportSummary(getDb(), today(), today()).revenue).toBe(revenueBefore)
  })

  it('Gia hạn trước khi giao (COD): tiền thuê mới được thu đủ một lần khi giao', () => {
    const [o] = place([line(RENTAL_VARIANT, 'rental', 1, start(), end())])
    advanceOrder(STAFF, o.id, 'confirmed')
    createRequest('u-cus1', { orderId: o.id, type: 'extend', reason: 'Tiệc kéo dài thêm', extendDays: 2 })
    resolveRequest(MANAGER, getDb().requests[0].id, true, '')
    const extended = order(o.id)
    expect(extended.rental!.endDate).toBe(addDays(end(), 2))
    expect(extended.subtotal).toBe(o.subtotal + 2 * 300000)

    advanceOrder(STAFF, o.id, 'renting')
    const rent = payments(o.id).filter((p) => p.type === 'rental').reduce((s, p) => s + p.amount, 0)
    expect(rent).toBe(extended.subtotal - extended.discount)
    expect(paidAmount(getDb(), o.id)).toBe(extended.total)
  })

  it('Gia hạn khi đang thuê: thu thêm tiền các ngày gia hạn', () => {
    const [o] = place([line(RENTAL_VARIANT, 'rental', 1, start(), end())], { paymentMethod: 'bank' })
    advanceOrder(STAFF, o.id, 'confirmed')
    advanceOrder(STAFF, o.id, 'renting')
    createRequest('u-cus1', { orderId: o.id, type: 'extend', reason: 'Tiệc kéo dài thêm', extendDays: 1 })
    resolveRequest(MANAGER, getDb().requests[0].id, true, '')
    expect(paidAmount(getDb(), o.id)).toBe(o.total + 300000)
  })
})

describe('Tài khoản & kho', () => {
  it('Khóa tạm sau 5 lần đăng nhập sai', async () => {
    for (let i = 0; i < 4; i++) await expect(login('admin', 'sai', 'admin')).rejects.toThrow(/Còn/)
    await expect(login('admin', 'sai', 'admin')).rejects.toThrow(/bị khóa/)
    await expect(login('admin', 'admin123', 'admin')).rejects.toThrow(/tạm khóa/)
  })

  it('Khách hàng không đăng nhập được trang quản trị', async () => {
    await expect(login('khachhang@panda.vn', '123456', 'admin')).rejects.toThrow()
    expect((await login('khachhang@panda.vn', '123456', 'shop')).role).toBe('customer')
  })

  it('Không đăng ký trùng email', async () => {
    await expect(registerCustomer({ fullName: 'Người mới', email: 'khachhang@panda.vn', phone: '0912000111', password: '123456' })).rejects.toThrow(/Email/)
  })

  it('Điều chỉnh kho của nhân viên phải chờ quản lý duyệt', () => {
    const before = variant(SALE_VARIANT).stock
    createMovement(STAFF, 'staff', { variantId: SALE_VARIANT, type: 'adjust', quantity: -1, note: 'Hàng lỗi' })
    expect(variant(SALE_VARIANT).stock).toBe(before)
    const pending = getDb().movements.find((m) => m.status === 'pending' && m.variantId === SALE_VARIANT)!
    reviewMovement(MANAGER, pending.id, true)
    expect(variant(SALE_VARIANT).stock).toBe(before - 1)
  })
})
