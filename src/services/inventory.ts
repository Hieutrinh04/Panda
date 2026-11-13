import type { Id, MovementType, Role } from '../types'
import { mutate } from '../data/store'
import { nowISO, uid } from '../lib/format'
import { fail, log } from './core'

export interface MovementInput { variantId: Id; type: Extract<MovementType, 'import' | 'export' | 'adjust'>; quantity: number; note: string }

/**
 * Nhập/xuất kho có hiệu lực ngay. Điều chỉnh kho do nhân viên tạo phải chờ
 * quản lý duyệt; quản lý tạo thì được duyệt luôn.
 */
export function createMovement(userId: Id, role: Role, input: MovementInput) {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) fail('Số lượng phải là số nguyên khác 0.')
  if (input.type !== 'adjust' && input.quantity < 0) fail('Số lượng nhập/xuất phải lớn hơn 0.')
  if (input.type === 'adjust' && !input.note.trim()) fail('Vui lòng ghi lý do điều chỉnh.')
  mutate((db) => {
    const variant = db.variants.find((v) => v.id === input.variantId)
    if (!variant) return fail('Không tìm thấy biến thể.')
    const delta = input.type === 'export' ? -input.quantity : input.quantity
    const autoApprove = input.type !== 'adjust' || role === 'manager'
    if (autoApprove && variant.stock + delta < 0) fail(`Tồn kho hiện tại (${variant.stock}) không đủ để xuất.`)
    db.movements.unshift({
      id: uid('mv-'), variantId: variant.id, type: input.type, quantity: delta, note: input.note.trim(), userId,
      status: autoApprove ? 'approved' : 'pending', approvedBy: autoApprove ? userId : undefined, createdAt: nowISO(),
    })
    if (autoApprove) variant.stock += delta
    log(db, userId, autoApprove ? 'Cập nhật kho' : 'Đề xuất điều chỉnh kho', `${variant.sku} (${delta > 0 ? '+' : ''}${delta})`)
  })
}

export function reviewMovement(userId: Id, movementId: Id, approve: boolean) {
  mutate((db) => {
    const movement = db.movements.find((m) => m.id === movementId)
    if (!movement || movement.status !== 'pending') return fail('Phiếu không còn chờ duyệt.')
    const variant = db.variants.find((v) => v.id === movement.variantId)!
    if (approve) {
      if (variant.stock + movement.quantity < 0) fail('Tồn kho không đủ để áp dụng điều chỉnh này.')
      variant.stock += movement.quantity
    }
    movement.status = approve ? 'approved' : 'rejected'
    movement.approvedBy = userId
    log(db, userId, approve ? 'Duyệt điều chỉnh kho' : 'Từ chối điều chỉnh kho', variant.sku)
  })
}
