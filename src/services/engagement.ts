// Đánh giá sản phẩm, thông báo và yêu cầu hỗ trợ (góp ý / khiếu nại).
import type { Database, Id, TicketStatus, TicketType } from '../types'
import { mutate } from '../data/store'
import { nowISO, uid } from '../lib/format'
import { fail, log, notify } from './core'

// ---------- Đánh giá ----------

/** Sản phẩm khách có thể đánh giá: đã mua/thuê ở đơn hoàn tất và chưa đánh giá trong đơn đó. */
export function reviewableItems(db: Database, customerId: Id) {
  return db.orders
    .filter((o) => o.customerId === customerId && o.status === 'completed')
    .flatMap((o) => o.items.map((i) => ({ order: o, item: i })))
    .filter(({ order, item }) => !db.reviews.some((r) => r.orderId === order.id && r.productId === item.productId))
}

export function createReview(customerId: Id, orderId: Id, productId: Id, rating: number, comment: string) {
  if (rating < 1 || rating > 5) fail('Vui lòng chọn số sao từ 1 đến 5.')
  if (comment.trim().length < 5) fail('Nội dung đánh giá tối thiểu 5 ký tự.')
  mutate((db) => {
    if (!reviewableItems(db, customerId).some((x) => x.order.id === orderId && x.item.productId === productId))
      fail('Bạn chỉ có thể đánh giá sản phẩm sau khi hoàn thành giao dịch.')
    db.reviews.unshift({ id: uid('rv-'), productId, customerId, orderId, rating, comment: comment.trim(), hidden: false, createdAt: nowISO() })
  })
}

export function moderateReview(actorId: Id, reviewId: Id, patch: { hidden?: boolean; reply?: string }) {
  mutate((db) => {
    const review = db.reviews.find((r) => r.id === reviewId)!
    Object.assign(review, patch)
    if (patch.reply) notify(db, review.customerId, 'Panda đã phản hồi đánh giá của bạn', patch.reply, `/san-pham/${review.productId}`)
    log(db, actorId, patch.hidden !== undefined ? (patch.hidden ? 'Ẩn đánh giá' : 'Hiện đánh giá') : 'Phản hồi đánh giá')
  })
}

export function deleteReview(actorId: Id, reviewId: Id) {
  mutate((db) => {
    db.reviews = db.reviews.filter((r) => r.id !== reviewId)
    log(db, actorId, 'Xóa đánh giá')
  })
}

// ---------- Thông báo ----------

export function markNotificationsRead(userId: Id, ids?: Id[]) {
  mutate((db) => {
    db.notifications.filter((n) => n.userId === userId && (!ids || ids.includes(n.id))).forEach((n) => (n.read = true))
  })
}

// ---------- Hỗ trợ khách hàng ----------

export function createTicket(customerId: Id, type: TicketType, subject: string, message: string, orderId?: Id) {
  if (subject.trim().length < 3) fail('Tiêu đề quá ngắn.')
  if (message.trim().length < 10) fail('Nội dung tối thiểu 10 ký tự.')
  mutate((db) => {
    const now = nowISO()
    db.tickets.unshift({ id: uid('tk-'), customerId, type, subject: subject.trim(), orderId, status: 'open', messages: [{ from: customerId, text: message.trim(), at: now }], createdAt: now })
    db.users.filter((u) => u.role !== 'customer' && u.isActive).forEach((u) => notify(db, u.id, 'Yêu cầu hỗ trợ mới', subject.trim(), '/admin/ho-tro'))
  })
}

export function replyTicket(userId: Id, ticketId: Id, text: string, status?: TicketStatus) {
  if (!text.trim() && !status) fail('Vui lòng nhập nội dung.')
  mutate((db) => {
    const ticket = db.tickets.find((t) => t.id === ticketId)!
    const fromCustomer = ticket.customerId === userId
    if (text.trim()) ticket.messages.push({ from: userId, text: text.trim(), at: nowISO() })
    if (status) ticket.status = status
    else if (!fromCustomer && ticket.status === 'open') ticket.status = 'in_progress'
    else if (fromCustomer && ticket.status === 'resolved') ticket.status = 'open'
    if (!fromCustomer) {
      ticket.assignedTo ??= userId
      notify(db, ticket.customerId, `Phản hồi: ${ticket.subject}`, text.trim() || 'Yêu cầu của bạn đã được cập nhật.', '/tai-khoan/ho-tro')
      log(db, userId, 'Phản hồi hỗ trợ khách hàng', ticket.subject)
    } else if (ticket.assignedTo) notify(db, ticket.assignedTo, `Khách phản hồi: ${ticket.subject}`, text.trim(), '/admin/ho-tro')
  })
}

export function assignTicket(actorId: Id, ticketId: Id, staffId?: Id) {
  mutate((db) => {
    const ticket = db.tickets.find((t) => t.id === ticketId)!
    ticket.assignedTo = staffId
    if (staffId && staffId !== actorId) notify(db, staffId, 'Bạn được giao xử lý yêu cầu hỗ trợ', ticket.subject, '/admin/ho-tro')
    log(db, actorId, 'Phân công hỗ trợ', ticket.subject)
  })
}
