import type { Database, PaymentType } from '../types'
import { addDays, toDateInput } from '../lib/format'

const REVENUE_TYPES: PaymentType[] = ['sale', 'rental', 'late_fee', 'damage_fee', 'shipping', 'refund']

const dayOf = (iso: string) => toDateInput(new Date(iso))
const inRange = (iso: string, from: string, to: string) => {
  const d = dayOf(iso)
  return d >= from && d <= to
}

export function revenueSeries(db: Database, from: string, to: string) {
  const days: { day: string; sale: number; rental: number; fees: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ day: d, sale: 0, rental: 0, fees: 0 })
  const index = new Map(days.map((d, i) => [d.day, i]))
  for (const p of db.payments) {
    const i = index.get(dayOf(p.createdAt))
    if (i === undefined || !REVENUE_TYPES.includes(p.type)) continue
    const order = db.orders.find((o) => o.id === p.orderId)
    if (p.type === 'late_fee' || p.type === 'damage_fee') days[i].fees += p.amount
    else if (order?.type === 'rental') days[i].rental += p.amount
    else days[i].sale += p.amount
  }
  return days
}

export function reportSummary(db: Database, from: string, to: string) {
  const payments = db.payments.filter((p) => inRange(p.createdAt, from, to))
  const sumOf = (...types: PaymentType[]) => payments.filter((p) => types.includes(p.type)).reduce((s, p) => s + p.amount, 0)
  const orders = db.orders.filter((o) => inRange(o.createdAt, from, to))
  const valid = orders.filter((o) => o.status !== 'cancelled')

  const productMap = new Map<string, { name: string; quantity: number; revenue: number; type: string }>()
  for (const o of valid)
    for (const i of o.items) {
      const key = `${i.productId}-${o.type}`
      const row = productMap.get(key) ?? { name: i.name, quantity: 0, revenue: 0, type: o.type }
      row.quantity += i.quantity
      row.revenue += o.type === 'rental' ? i.unitPrice * i.quantity * i.days : i.unitPrice * i.quantity
      productMap.set(key, row)
    }

  const depositIn = db.payments.filter((p) => p.type === 'deposit').reduce((s, p) => s + p.amount, 0)
  const depositOut = db.payments.filter((p) => p.type === 'deposit_refund').reduce((s, p) => s + p.amount, 0)

  return {
    revenue: sumOf(...REVENUE_TYPES),
    saleRevenue: payments.filter((p) => p.type === 'sale' || (p.type === 'refund' && db.orders.find((o) => o.id === p.orderId)?.type === 'sale')).reduce((s, p) => s + p.amount, 0),
    rentalRevenue: sumOf('rental'),
    lateFees: sumOf('late_fee'),
    damageFees: sumOf('damage_fee'),
    shipping: sumOf('shipping'),
    refunds: sumOf('refund'),
    depositCollected: sumOf('deposit'),
    depositRefunded: -sumOf('deposit_refund'),
    depositHeld: depositIn + depositOut,
    orderCount: orders.length,
    saleOrders: orders.filter((o) => o.type === 'sale').length,
    rentalOrders: orders.filter((o) => o.type === 'rental').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    newCustomers: db.users.filter((u) => u.role === 'customer' && inRange(u.createdAt, from, to)).length,
    activeCustomers: new Set(valid.map((o) => o.customerId).filter(Boolean)).size,
    topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 8),
    payments: payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}

export function inventorySummary(db: Database, lowThreshold = 2) {
  const rows = db.variants.map((v) => ({ variant: v, product: db.products.find((p) => p.id === v.productId)! })).filter((r) => r.product)
  return {
    units: rows.reduce((s, r) => s + r.variant.stock, 0),
    value: rows.reduce((s, r) => s + r.variant.stock * (r.product.salePrice || r.product.deposit), 0),
    low: rows.filter((r) => r.product.status === 'active' && r.variant.stock <= lowThreshold).sort((a, b) => a.variant.stock - b.variant.stock),
    skuCount: rows.length,
  }
}
