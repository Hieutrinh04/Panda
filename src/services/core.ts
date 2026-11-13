// Các thao tác dùng chung bên trong mutate(): ghi nhật ký và tạo thông báo.
import type { Database, Id } from '../types'
import { nowISO, uid } from '../lib/format'

export class AppError extends Error {}

export const fail = (message: string): never => {
  throw new AppError(message)
}

export function log(db: Database, userId: Id | undefined, action: string, target?: string) {
  db.activity.unshift({ id: uid('act-'), userId, action, target, at: nowISO() })
  if (db.activity.length > 500) db.activity.length = 500
}

export function notify(db: Database, userId: Id | undefined, title: string, body: string, link?: string, key?: string) {
  if (!userId) return
  if (key && db.notifications.some((n) => n.key === key)) return
  db.notifications.unshift({ id: uid('nt-'), userId, title, body, link, key, read: false, createdAt: nowISO() })
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Đã có lỗi xảy ra')
