// Đồng bộ dữ liệu với Supabase.
// - loadRemote(): tải các bảng người dùng được phép xem (RLS) và ghép thành Database.
// - pushChanges(): so sánh dữ liệu trước/sau một lần mutate() và ghi đúng những
//   dòng thay đổi (thêm / sửa / xóa) lên các bảng tương ứng.
import type { Database, Order, User } from '../types'
import { supabase } from '../lib/supabase'

type Row = Record<string, unknown>

interface TableSpec {
  table: string
  pk: string[]
  /** Bảng nhật ký chỉ thêm, không xóa (bản cục bộ có cắt bớt danh sách). */
  appendOnly?: boolean
  rows: (db: Database) => Row[]
}

const n = <T,>(v: T | undefined | '') => (v === undefined || v === '' ? null : v)

const orderRow = (o: Order): Row => ({
  id: o.id, code: o.code, type: o.type, channel: o.channel, customer_id: n(o.customerId), customer_name: o.customerName, phone: o.phone,
  address: o.address, delivery_method: o.deliveryMethod, subtotal: o.subtotal, discount: o.discount, points_used: o.pointsUsed,
  points_earned: o.pointsEarned ?? 0, shipping_fee: o.shippingFee, deposit_total: o.depositTotal, total: o.total, coupon_code: n(o.couponCode),
  payment_method: o.paymentMethod, status: o.status, note: n(o.note), assigned_to: n(o.assignedTo), carrier: n(o.carrier),
  tracking_code: n(o.trackingCode), rental_start: n(o.rental?.startDate), rental_end: n(o.rental?.endDate),
  delivered_at: n(o.rental?.deliveredAt), returned_at: n(o.rental?.returnedAt), condition_out: n(o.rental?.conditionOut),
  condition_in: n(o.rental?.conditionIn), late_fee: o.rental?.lateFee ?? 0, damage_fee: o.rental?.damageFee ?? 0,
  deposit_refunded: o.rental?.depositRefunded ?? 0, extended_days: o.rental?.extendedDays ?? 0, created_by: n(o.createdBy), created_at: o.createdAt,
})

const profileRow = (u: User): Row => ({
  id: u.id, role: u.role, full_name: u.fullName, email: n(u.email), phone: n(u.phone), username: n(u.username), avatar_url: n(u.avatar),
  gender: n(u.gender), birth_date: n(u.birthDate), is_active: u.isActive, points: u.points, note: n(u.note), position: n(u.position), created_at: u.createdAt,
})

// Thứ tự theo khóa ngoại: bảng cha trước, bảng con sau.
export const TABLES: TableSpec[] = [
  { table: 'profiles', pk: ['id'], rows: (db) => db.users.map(profileRow) },
  { table: 'addresses', pk: ['id'], rows: (db) => db.users.flatMap((u) => u.addresses.map((a) => ({ id: a.id, user_id: u.id, label: a.label, receiver: a.receiver, phone: a.phone, line: a.line, is_default: a.isDefault }))) },
  { table: 'categories', pk: ['id'], rows: (db) => db.categories.map((c) => ({ id: c.id, name: c.name, description: n(c.description) })) },
  { table: 'suppliers', pk: ['id'], rows: (db) => db.suppliers.map((s) => ({ id: s.id, name: s.name, phone: n(s.phone), email: n(s.email), address: n(s.address) })) },
  { table: 'collections', pk: ['id'], rows: (db) => db.collections.map((c) => ({ id: c.id, name: c.name, description: n(c.description) })) },
  {
    table: 'products', pk: ['id'], rows: (db) => db.products.map((p) => ({
      id: p.id, name: p.name, category_id: p.categoryId, supplier_id: n(p.supplierId), collection_id: n(p.collectionId), description: p.description,
      material: p.material, gender: p.gender, images: p.images, mode: p.mode, sale_price: p.salePrice, rental_price_per_day: p.rentalPricePerDay,
      deposit: p.deposit, status: p.status, featured: p.featured, created_at: p.createdAt,
    })),
  },
  { table: 'variants', pk: ['id'], rows: (db) => db.variants.map((v) => ({ id: v.id, product_id: v.productId, sku: v.sku, size: v.size, color: v.color, stock: v.stock })) },
  {
    table: 'stock_movements', pk: ['id'], rows: (db) => db.movements.map((m) => ({
      id: m.id, variant_id: m.variantId, type: m.type, quantity: m.quantity, note: n(m.note), status: m.status, user_id: n(m.userId), approved_by: n(m.approvedBy), created_at: m.createdAt,
    })),
  },
  {
    table: 'cart_items', pk: ['id'], rows: (db) => Object.entries(db.carts).flatMap(([userId, items]) => items.map((c) => ({
      id: c.id, user_id: userId, variant_id: c.variantId, mode: c.mode, quantity: c.quantity, rental_start: n(c.rentalStart), rental_end: n(c.rentalEnd),
    }))),
  },
  { table: 'wishlists', pk: ['user_id', 'product_id'], rows: (db) => Object.entries(db.wishlists).flatMap(([userId, ids]) => ids.map((id) => ({ user_id: userId, product_id: id }))) },
  {
    table: 'coupons', pk: ['id'], rows: (db) => db.coupons.map((c) => ({
      id: c.id, code: c.code, description: c.description, kind: c.kind, value: c.value, max_discount: n(c.maxDiscount), min_order: c.minOrder, applies_to: c.appliesTo,
      min_tier: n(c.minTier), start_at: c.startAt, end_at: c.endAt, usage_limit: c.usageLimit, used: c.used, active: c.active,
    })),
  },
  { table: 'store_settings', pk: ['id'], rows: (db) => [{ id: 1, settings: db.settings }] },
  { table: 'orders', pk: ['id'], rows: (db) => db.orders.map(orderRow) },
  {
    table: 'order_items', pk: ['id'], rows: (db) => db.orders.flatMap((o) => o.items.map((i, idx) => ({
      id: `${o.id}-i${idx}`, order_id: o.id, product_id: i.productId, variant_id: i.variantId, name: i.name, sku: i.sku, size: i.size, color: i.color,
      quantity: i.quantity, unit_price: i.unitPrice, deposit: i.deposit, days: i.days,
    }))),
  },
  { table: 'order_events', pk: ['id'], rows: (db) => db.orders.flatMap((o) => o.timeline.map((t, idx) => ({ id: `${o.id}-e${idx}`, order_id: o.id, status: t.status, at: t.at, by: n(t.by), note: n(t.note) }))) },
  { table: 'payments', pk: ['id'], rows: (db) => db.payments.map((p) => ({ id: p.id, order_id: p.orderId, type: p.type, amount: p.amount, method: p.method, note: n(p.note), user_id: n(p.userId), created_at: p.createdAt })) },
  {
    table: 'order_requests', pk: ['id'], rows: (db) => db.requests.map((r) => ({
      id: r.id, order_id: r.orderId, customer_id: n(r.customerId), type: r.type, reason: r.reason, extend_days: n(r.extendDays), refund_amount: n(r.refundAmount),
      status: r.status, staff_note: n(r.staffNote), handled_by: n(r.handledBy), created_at: r.createdAt, updated_at: r.updatedAt,
    })),
  },
  {
    table: 'reviews', pk: ['id'], rows: (db) => db.reviews.map((r) => ({
      id: r.id, product_id: r.productId, customer_id: r.customerId, order_id: r.orderId, rating: r.rating, comment: r.comment, hidden: r.hidden, reply: n(r.reply), created_at: r.createdAt,
    })),
  },
  {
    table: 'tickets', pk: ['id'], rows: (db) => db.tickets.map((t) => ({
      id: t.id, customer_id: t.customerId, type: t.type, subject: t.subject, order_id: n(t.orderId), status: t.status, assigned_to: n(t.assignedTo), created_at: t.createdAt,
    })),
  },
  { table: 'ticket_messages', pk: ['id'], rows: (db) => db.tickets.flatMap((t) => t.messages.map((m, idx) => ({ id: `${t.id}-m${idx}`, ticket_id: t.id, from: m.from, text: m.text, at: m.at }))) },
  {
    table: 'tasks', pk: ['id'], rows: (db) => db.tasks.map((t) => ({
      id: t.id, title: t.title, description: n(t.description), assignee_id: t.assigneeId, due_date: n(t.dueDate), status: t.status, created_by: t.createdBy, created_at: t.createdAt,
    })),
  },
  { table: 'notifications', pk: ['id'], rows: (db) => db.notifications.map((x) => ({ id: x.id, user_id: x.userId, title: x.title, body: x.body, link: n(x.link), read: x.read, key: n(x.key), created_at: x.createdAt })) },
  { table: 'activity_logs', pk: ['id'], appendOnly: true, rows: (db) => db.activity.map((a) => ({ id: a.id, user_id: n(a.userId), action: a.action, target: n(a.target), at: a.at })) },
  { table: 'ai_logs', pk: ['id'], appendOnly: true, rows: (db) => db.aiLogs.map((a) => ({ id: a.id, user_id: n(a.userId), scope: a.scope, question: a.question, answer: a.answer, at: a.at })) },
]

// ---------- Tải dữ liệu ----------

const LIMITED: Record<string, string> = { activity_logs: 'at', ai_logs: 'at', notifications: 'created_at' }

const index = (id: string) => Number(id.slice(id.lastIndexOf('-') + 2)) || 0
const und = <T,>(v: T | null) => (v === null ? undefined : v)
const num = (v: unknown) => Number(v ?? 0)

/** Tải toàn bộ dữ liệu người dùng hiện tại được phép xem, trả về các bảng của Database. */
export async function loadRemote(): Promise<Omit<Database, 'version' | 'session' | 'loginAttempts' | 'resets'>> {
  const client = supabase!
  const results = await Promise.all(
    TABLES.map(async ({ table }) => {
      let query = client.from(table).select('*')
      if (LIMITED[table]) query = query.order(LIMITED[table], { ascending: false }).limit(500)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return [table, (data ?? []) as Row[]] as const
    }),
  )
  const t = Object.fromEntries(results) as Record<string, Row[]>
  const byKey = <K extends string>(rows: Row[], key: K) => {
    const map = new Map<string, Row[]>()
    for (const r of rows) map.set(String(r[key]), [...(map.get(String(r[key])) ?? []), r])
    return map
  }
  const addresses = byKey(t.addresses, 'user_id')
  const items = byKey(t.order_items, 'order_id')
  const events = byKey(t.order_events, 'order_id')
  const messages = byKey(t.ticket_messages, 'ticket_id')
  const sortByIndex = (rows: Row[] = []) => [...rows].sort((a, b) => index(String(a.id)) - index(String(b.id)))

  const carts: Database['carts'] = {}
  for (const c of t.cart_items) (carts[String(c.user_id)] ??= []).push({
    id: String(c.id), variantId: String(c.variant_id), mode: c.mode as 'sale', quantity: num(c.quantity), rentalStart: und(c.rental_start as string | null), rentalEnd: und(c.rental_end as string | null),
  })
  const wishlists: Database['wishlists'] = {}
  for (const w of t.wishlists) (wishlists[String(w.user_id)] ??= []).push(String(w.product_id))

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = (row: Row) => row as any
  return {
    users: t.profiles.map((p0) => {
      const p = r(p0)
      return {
        id: p.id, role: p.role, fullName: p.full_name, email: p.email ?? '', phone: p.phone ?? '', username: p.username ?? '', passwordHash: '',
        avatar: und(p.avatar_url), gender: und(p.gender), birthDate: und(p.birth_date), isActive: p.is_active, createdAt: p.created_at,
        addresses: (addresses.get(p.id) ?? []).map((a0) => { const a = r(a0); return { id: a.id, label: a.label, receiver: a.receiver, phone: a.phone, line: a.line, isDefault: a.is_default } }),
        note: und(p.note), points: num(p.points), position: und(p.position),
      }
    }),
    categories: t.categories.map((c0) => { const c = r(c0); return { id: c.id, name: c.name, description: und(c.description) } }),
    suppliers: t.suppliers.map((s0) => { const s = r(s0); return { id: s.id, name: s.name, phone: und(s.phone), email: und(s.email), address: und(s.address) } }),
    collections: t.collections.map((c0) => { const c = r(c0); return { id: c.id, name: c.name, description: und(c.description) } }),
    products: t.products.map((p0) => {
      const p = r(p0)
      return {
        id: p.id, name: p.name, categoryId: p.category_id, supplierId: und(p.supplier_id), collectionId: und(p.collection_id), description: p.description,
        material: p.material, gender: p.gender, images: p.images ?? [], mode: p.mode, salePrice: num(p.sale_price), rentalPricePerDay: num(p.rental_price_per_day),
        deposit: num(p.deposit), status: p.status, featured: p.featured, createdAt: p.created_at,
      }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    variants: t.variants.map((v0) => { const v = r(v0); return { id: v.id, productId: v.product_id, sku: v.sku, size: v.size, color: v.color, stock: num(v.stock) } }),
    movements: t.stock_movements.map((m0) => {
      const m = r(m0)
      return { id: m.id, variantId: m.variant_id, type: m.type, quantity: num(m.quantity), note: und(m.note), status: m.status, userId: und(m.user_id), approvedBy: und(m.approved_by), createdAt: m.created_at }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    carts,
    wishlists,
    orders: t.orders.map((o0) => {
      const o = r(o0)
      const order: Order = {
        id: o.id, code: o.code, type: o.type, channel: o.channel, customerId: und(o.customer_id), customerName: o.customer_name, phone: o.phone, address: o.address,
        deliveryMethod: o.delivery_method, subtotal: num(o.subtotal), discount: num(o.discount), pointsUsed: num(o.points_used), pointsEarned: num(o.points_earned),
        shippingFee: num(o.shipping_fee), depositTotal: num(o.deposit_total), total: num(o.total), couponCode: und(o.coupon_code), paymentMethod: o.payment_method,
        status: o.status, note: und(o.note), assignedTo: und(o.assigned_to), carrier: und(o.carrier), trackingCode: und(o.tracking_code), createdBy: und(o.created_by),
        createdAt: o.created_at,
        items: sortByIndex(items.get(o.id)).map((i0) => {
          const i = r(i0)
          return { productId: i.product_id, variantId: i.variant_id, name: i.name, sku: i.sku, size: i.size, color: i.color, quantity: num(i.quantity), unitPrice: num(i.unit_price), deposit: num(i.deposit), days: num(i.days) }
        }),
        timeline: sortByIndex(events.get(o.id)).map((e0) => { const e = r(e0); return { status: e.status, at: e.at, by: und(e.by), note: und(e.note) } }),
      }
      if (o.type === 'rental')
        order.rental = {
          startDate: o.rental_start, endDate: o.rental_end, deliveredAt: und(o.delivered_at), returnedAt: und(o.returned_at), conditionOut: und(o.condition_out),
          conditionIn: und(o.condition_in), lateFee: num(o.late_fee), damageFee: num(o.damage_fee), depositRefunded: num(o.deposit_refunded), extendedDays: num(o.extended_days),
        }
      return order
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    payments: t.payments.map((p0) => {
      const p = r(p0)
      return { id: p.id, orderId: p.order_id, type: p.type, amount: num(p.amount), method: p.method, note: und(p.note), userId: und(p.user_id), createdAt: p.created_at }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    requests: t.order_requests.map((q0) => {
      const q = r(q0)
      return {
        id: q.id, orderId: q.order_id, customerId: und(q.customer_id), type: q.type, reason: q.reason, extendDays: und(q.extend_days), refundAmount: q.refund_amount === null ? undefined : num(q.refund_amount),
        status: q.status, staffNote: und(q.staff_note), handledBy: und(q.handled_by), createdAt: q.created_at, updatedAt: q.updated_at,
      }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    coupons: t.coupons.map((c0) => {
      const c = r(c0)
      return {
        id: c.id, code: c.code, description: c.description, kind: c.kind, value: num(c.value), maxDiscount: c.max_discount === null ? undefined : num(c.max_discount),
        minOrder: num(c.min_order), appliesTo: c.applies_to, minTier: und(c.min_tier), startAt: c.start_at, endAt: c.end_at, usageLimit: num(c.usage_limit), used: num(c.used), active: c.active,
      }
    }),
    reviews: t.reviews.map((v0) => {
      const v = r(v0)
      return { id: v.id, productId: v.product_id, customerId: v.customer_id, orderId: v.order_id, rating: num(v.rating), comment: v.comment, hidden: v.hidden, reply: und(v.reply), createdAt: v.created_at }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    notifications: t.notifications.map((x0) => {
      const x = r(x0)
      return { id: x.id, userId: x.user_id, title: x.title, body: x.body, link: und(x.link), read: x.read, key: und(x.key), createdAt: x.created_at }
    }),
    tickets: t.tickets.map((k0) => {
      const k = r(k0)
      return {
        id: k.id, customerId: k.customer_id, type: k.type, subject: k.subject, orderId: und(k.order_id), status: k.status, assignedTo: und(k.assigned_to), createdAt: k.created_at,
        messages: sortByIndex(messages.get(k.id)).map((m0) => { const m = r(m0); return { from: m.from, text: m.text, at: m.at } }),
      }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    tasks: t.tasks.map((k0) => {
      const k = r(k0)
      return { id: k.id, title: k.title, description: und(k.description), assigneeId: k.assignee_id, dueDate: und(k.due_date), status: k.status, createdBy: k.created_by, createdAt: k.created_at }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    activity: t.activity_logs.map((a0) => { const a = r(a0); return { id: a.id, userId: und(a.user_id), action: a.action, target: und(a.target), at: a.at } }),
    aiLogs: t.ai_logs.map((a0) => { const a = r(a0); return { id: a.id, userId: und(a.user_id), scope: a.scope, question: a.question, answer: a.answer, at: a.at } }),
    settings: t.store_settings[0] ? r(t.store_settings[0]).settings : undefined,
  } as Omit<Database, 'version' | 'session' | 'loginAttempts' | 'resets'>
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ---------- Ghi thay đổi ----------

export type RemoteTag = 'place_order'

/** Bảng mà khi đặt hàng được hàm place_order trên database ghi thay cho client. */
const ORDER_TABLES = new Set(['orders', 'order_items', 'order_events', 'payments', 'stock_movements'])
/** Khi đặt hàng, các thay đổi này do place_order tự tính trên database (tồn kho, lượt dùng mã, điểm). */
const ORDER_SERVER_SIDE = new Set(['variants', 'coupons', 'profiles'])

const keyOf = (spec: TableSpec, row: Row) => spec.pk.map((k) => String(row[k])).join('|')

interface TableDiff { spec: TableSpec; inserts: Row[]; updates: Row[]; deletes: Row[] }

export function diff(prev: Database, next: Database): TableDiff[] {
  return TABLES.map((spec) => {
    const before = new Map(spec.rows(prev).map((r) => [keyOf(spec, r), r]))
    const after = new Map(spec.rows(next).map((r) => [keyOf(spec, r), r]))
    const inserts: Row[] = []
    const updates: Row[] = []
    const deletes: Row[] = []
    for (const [k, row] of after) {
      const old = before.get(k)
      if (!old) inserts.push(row)
      else if (JSON.stringify(old) !== JSON.stringify(row)) updates.push(row)
    }
    if (!spec.appendOnly) for (const [k, row] of before) if (!after.has(k)) deletes.push(row)
    return { spec, inserts, updates, deletes }
  })
}

const fail = (table: string, message: string): never => {
  throw new Error(`${table}: ${message}`)
}

/** Ghi các thay đổi giữa prev và next lên Supabase. Trả về mã đơn do database cấp (nếu có). */
export async function pushChanges(prev: Database, next: Database, tag?: RemoteTag) {
  const client = supabase!
  const changes = diff(prev, next)

  if (tag === 'place_order') {
    const get = (table: string) => changes.find((c) => c.spec.table === table)!.inserts
    const orders = get('orders')
    const customer = orders.find((o) => o.customer_id)?.customer_id ?? null
    const payload = {
      customer_id: customer,
      coupon_code: orders.find((o) => o.coupon_code)?.coupon_code ?? null,
      points_used: orders.reduce((s, o) => s + Number(o.points_used ?? 0), 0),
      orders, items: get('order_items'), events: get('order_events'), payments: get('payments'), movements: get('stock_movements'),
    }
    const { error } = await client.rpc('place_order', { payload })
    if (error) fail('place_order', error.message)
  }

  const skip = (table: string) => tag === 'place_order' && (ORDER_TABLES.has(table) || ORDER_SERVER_SIDE.has(table))

  for (const { spec, inserts } of changes) {
    if (!inserts.length || (skip(spec.table) && spec.table !== 'profiles')) continue
    // Khi đặt hàng, hồ sơ mới (khách vãng lai) vẫn được thêm; chỉ bỏ qua cập nhật điểm.
    const { error } = await client.from(spec.table).insert(inserts)
    if (error) fail(spec.table, error.message)
  }
  for (const { spec, updates } of changes) {
    if (skip(spec.table)) continue
    for (const row of updates) {
      // Cài đặt cửa hàng có thể chưa có dòng nào trên database: ghi bằng upsert.
      if (spec.table === 'store_settings') {
        const { error } = await client.from(spec.table).upsert(row)
        if (error) fail(spec.table, error.message)
        continue
      }
      let query = client.from(spec.table).update(row)
      for (const k of spec.pk) query = query.eq(k, row[k] as string)
      const { error } = await query
      if (error) fail(spec.table, error.message)
    }
  }
  for (const { spec, deletes } of [...changes].reverse()) {
    if (!deletes.length || skip(spec.table)) continue
    if (spec.pk.length === 1) {
      const { error } = await client.from(spec.table).delete().in(spec.pk[0], deletes.map((r) => r[spec.pk[0]] as string))
      if (error) fail(spec.table, error.message)
    } else
      for (const row of deletes) {
        let query = client.from(spec.table).delete()
        for (const k of spec.pk) query = query.eq(k, row[k] as string)
        const { error } = await query
        if (error) fail(spec.table, error.message)
      }
  }
}
