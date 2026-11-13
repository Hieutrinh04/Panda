import type { Coupon, Database, Id, OrderType, Tier, User } from '../types'
import { mutate } from '../data/store'
import { today, uid } from '../lib/format'
import { fail, log, notify } from './core'

/** Tổng chi tiêu của khách từ các đơn đã hoàn tất (không tính tiền cọc). */
export const totalSpent = (db: Database, customerId: Id) =>
  db.orders
    .filter((o) => o.customerId === customerId && o.status === 'completed')
    .reduce((s, o) => s + o.subtotal - o.discount + (o.rental ? o.rental.lateFee + o.rental.damageFee : 0), 0)

export function tierOf(db: Database, customerId: Id): Tier {
  const spent = totalSpent(db, customerId)
  return [...db.settings.tiers].sort((a, b) => b.minSpent - a.minSpent).find((t) => spent >= t.minSpent)?.name ?? 'Thành viên'
}

export function nextTier(db: Database, customerId: Id) {
  const spent = totalSpent(db, customerId)
  const next = [...db.settings.tiers].sort((a, b) => a.minSpent - b.minSpent).find((t) => t.minSpent > spent)
  return next ? { name: next.name, remaining: next.minSpent - spent } : undefined
}

const tierRank = (db: Database, tier: Tier) => db.settings.tiers.findIndex((t) => t.name === tier)

export const couponIsLive = (c: Coupon) => c.active && c.startAt <= today() && today() <= c.endAt && c.used < c.usageLimit

/**
 * Tính số tiền giảm của mã cho một nhóm hàng. `amounts` là tạm tính theo loại đơn
 * (mua/thuê) để mã chỉ áp dụng cho phần hàng phù hợp.
 */
export function evaluateCoupon(db: Database, code: string, amounts: Record<OrderType, number>, customer?: User) {
  const coupon = db.coupons.find((c) => c.code.toUpperCase() === code.trim().toUpperCase())
  if (!coupon) return fail('Mã giảm giá không tồn tại.')
  if (!couponIsLive(coupon)) return fail('Mã giảm giá đã hết hạn hoặc hết lượt sử dụng.')
  if (coupon.minTier) {
    if (!customer) return fail(`Mã chỉ dành cho thành viên hạng ${coupon.minTier} trở lên.`)
    if (tierRank(db, tierOf(db, customer.id)) < tierRank(db, coupon.minTier)) return fail(`Mã chỉ dành cho thành viên hạng ${coupon.minTier} trở lên.`)
  }
  const base = coupon.appliesTo === 'all' ? amounts.sale + amounts.rental : amounts[coupon.appliesTo]
  if (base <= 0) return fail(coupon.appliesTo === 'rental' ? 'Mã chỉ áp dụng cho đơn thuê.' : 'Mã chỉ áp dụng cho đơn mua.')
  if (base < coupon.minOrder) return fail(`Đơn tối thiểu ${coupon.minOrder.toLocaleString('vi-VN')}đ để dùng mã này.`)
  let discount = coupon.kind === 'percent' ? Math.round((base * coupon.value) / 100) : coupon.value
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount)
  return { coupon, discount: Math.min(discount, base) }
}

export function saveCoupon(userId: Id, input: Omit<Coupon, 'id' | 'used'> & { id?: Id }) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9]{3,20}$/.test(code)) fail('Mã gồm 3–20 ký tự chữ hoặc số, không dấu.')
  if (input.value <= 0) fail('Giá trị giảm phải lớn hơn 0.')
  if (input.kind === 'percent' && input.value > 100) fail('Phần trăm giảm tối đa 100.')
  if (input.startAt > input.endAt) fail('Ngày kết thúc phải sau ngày bắt đầu.')
  mutate((db) => {
    if (db.coupons.some((c) => c.id !== input.id && c.code === code)) fail('Mã giảm giá đã tồn tại.')
    const existing = db.coupons.find((c) => c.id === input.id)
    if (existing) Object.assign(existing, { ...input, code })
    else {
      const coupon = { ...input, code, id: uid('cp-'), used: 0 }
      db.coupons.unshift(coupon)
      // Báo cho khách hàng về chương trình khuyến mãi mới.
      if (couponIsLive(coupon))
        db.users
          .filter((u) => u.role === 'customer' && u.isActive)
          .forEach((u) => notify(db, u.id, `Ưu đãi mới: ${code}`, coupon.description, '/tai-khoan/uu-dai'))
    }
    log(db, userId, existing ? 'Cập nhật mã giảm giá' : 'Tạo mã giảm giá', code)
  })
}

export function deleteCoupon(userId: Id, id: Id) {
  mutate((db) => {
    const coupon = db.coupons.find((c) => c.id === id)!
    if (coupon.used > 0) fail('Mã đã được sử dụng, chỉ có thể tắt thay vì xóa.')
    db.coupons = db.coupons.filter((c) => c.id !== id)
    log(db, userId, 'Xóa mã giảm giá', coupon.code)
  })
}
