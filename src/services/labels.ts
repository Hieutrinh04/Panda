import type {
  MovementType, OrderStatus, OrderType, PaymentMethod, PaymentType, ProductMode, RequestStatus, RequestType, Role,
  TicketStatus, TicketType,
} from '../types'

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent'

export const ROLE_LABEL: Record<Role, string> = { manager: 'Quản lý', staff: 'Nhân viên', customer: 'Khách hàng' }

export const ORDER_TYPE_LABEL: Record<OrderType, string> = { sale: 'Đơn mua', rental: 'Đơn thuê' }

export const MODE_LABEL: Record<ProductMode, string> = { sale: 'Bán', rental: 'Cho thuê', both: 'Bán & thuê' }

export const STATUS_LABEL: Record<OrderStatus | 'overdue', [string, Tone]> = {
  pending: ['Chờ xác nhận', 'warning'],
  confirmed: ['Đã xác nhận', 'info'],
  shipping: ['Đang giao', 'accent'],
  renting: ['Đang thuê', 'accent'],
  returned: ['Đã trả hàng', 'neutral'],
  completed: ['Hoàn tất', 'success'],
  cancelled: ['Đã hủy', 'danger'],
  overdue: ['Quá hạn trả', 'danger'],
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cod: 'Thanh toán khi nhận hàng',
  bank: 'Chuyển khoản ngân hàng',
  cash: 'Tiền mặt tại cửa hàng',
  card: 'Thẻ / ví điện tử',
}

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  sale: 'Tiền mua',
  rental: 'Tiền thuê',
  deposit: 'Tiền cọc',
  deposit_refund: 'Hoàn cọc',
  refund: 'Hoàn tiền',
  late_fee: 'Phí trả trễ',
  damage_fee: 'Phí bồi thường',
  shipping: 'Phí giao hàng',
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  import: 'Nhập kho',
  export: 'Xuất kho',
  adjust: 'Điều chỉnh',
  sale: 'Bán hàng',
  rental_out: 'Giao đồ thuê',
  rental_return: 'Nhận lại đồ thuê',
  cancel_return: 'Hoàn kho do hủy/trả',
}

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  cancel: 'Hủy đơn',
  return: 'Đổi trả',
  refund: 'Hoàn tiền',
  extend: 'Gia hạn thuê',
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, [string, Tone]> = {
  pending: ['Mới gửi', 'warning'],
  forwarded: ['Chờ quản lý duyệt', 'info'],
  approved: ['Đã chấp thuận', 'success'],
  rejected: ['Từ chối', 'danger'],
}

export const TICKET_TYPE_LABEL: Record<TicketType, string> = { feedback: 'Góp ý', complaint: 'Khiếu nại', support: 'Hỗ trợ' }

export const TICKET_STATUS_LABEL: Record<TicketStatus, [string, Tone]> = {
  open: ['Mới', 'warning'],
  in_progress: ['Đang xử lý', 'info'],
  resolved: ['Đã giải quyết', 'success'],
}

export const TASK_STATUS_LABEL = { todo: ['Cần làm', 'warning'], doing: ['Đang làm', 'info'], done: ['Hoàn thành', 'success'] } as const
