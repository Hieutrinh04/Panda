// Kiểu dữ liệu nghiệp vụ. Tên trường bám theo các bảng sẽ tạo trên Supabase
// (đổi camelCase -> snake_case khi ánh xạ).

export type Id = string
export type ISODate = string

export type Role = 'manager' | 'staff' | 'customer'
export type Gender = 'Nam' | 'Nữ' | 'Unisex'

export interface Address {
  id: Id
  label: string
  receiver: string
  phone: string
  line: string
  isDefault: boolean
}

export type Tier = 'Thành viên' | 'Bạc' | 'Vàng' | 'Kim cương'

export interface User {
  id: Id
  role: Role
  fullName: string
  email: string
  phone: string
  username: string
  passwordHash: string
  avatar?: string
  gender?: 'Nam' | 'Nữ' | 'Khác'
  birthDate?: string
  isActive: boolean
  createdAt: ISODate
  // Khách hàng
  addresses: Address[]
  note?: string
  points: number
  // Nhân viên
  position?: string
}

export interface Category { id: Id; name: string; description?: string }
export interface Supplier { id: Id; name: string; phone?: string; email?: string; address?: string }
export interface Collection { id: Id; name: string; description?: string }

export type ProductMode = 'sale' | 'rental' | 'both'
export type ProductStatus = 'active' | 'hidden'

export interface Product {
  id: Id
  name: string
  categoryId: Id
  supplierId?: Id
  collectionId?: Id
  description: string
  material: string
  gender: Gender
  images: string[]
  mode: ProductMode
  salePrice: number
  rentalPricePerDay: number
  deposit: number
  status: ProductStatus
  featured: boolean
  createdAt: ISODate
}

export interface Variant {
  id: Id
  productId: Id
  sku: string
  size: string
  color: string
  stock: number
}

export type MovementType = 'import' | 'export' | 'adjust' | 'sale' | 'rental_out' | 'rental_return' | 'cancel_return'

export interface StockMovement {
  id: Id
  variantId: Id
  type: MovementType
  quantity: number
  note?: string
  status: 'approved' | 'pending' | 'rejected'
  userId?: Id
  approvedBy?: Id
  createdAt: ISODate
}

export interface CartItem {
  id: Id
  variantId: Id
  mode: 'sale' | 'rental'
  quantity: number
  rentalStart?: string
  rentalEnd?: string
}

export type OrderType = 'sale' | 'rental'
export type SaleStatus = 'pending' | 'confirmed' | 'shipping' | 'completed' | 'cancelled' | 'returned'
export type RentalStatus = 'pending' | 'confirmed' | 'renting' | 'returned' | 'completed' | 'cancelled'
export type OrderStatus = SaleStatus | RentalStatus

export interface OrderItem {
  productId: Id
  variantId: Id
  name: string
  sku: string
  size: string
  color: string
  quantity: number
  unitPrice: number
  deposit: number
  days: number
}

export interface TimelineEntry { status: string; at: ISODate; by?: Id; note?: string }

export interface RentalInfo {
  startDate: string
  endDate: string
  deliveredAt?: ISODate
  returnedAt?: ISODate
  conditionOut?: string
  conditionIn?: string
  lateFee: number
  damageFee: number
  depositRefunded: number
  extendedDays: number
}

export type PaymentMethod = 'cod' | 'bank' | 'cash' | 'card' | 'vnpay'
export type DeliveryMethod = 'delivery' | 'pickup'

export interface Order {
  id: Id
  code: string
  type: OrderType
  channel: 'online' | 'store'
  customerId?: Id
  customerName: string
  phone: string
  address: string
  deliveryMethod: DeliveryMethod
  items: OrderItem[]
  subtotal: number
  discount: number
  pointsUsed: number
  shippingFee: number
  depositTotal: number
  total: number
  couponCode?: string
  paymentMethod: PaymentMethod
  status: OrderStatus
  rental?: RentalInfo
  note?: string
  assignedTo?: Id
  carrier?: string
  trackingCode?: string
  /** Điểm thưởng đã cộng khi hoàn tất, dùng để thu hồi nếu khách trả hàng. */
  pointsEarned?: number
  timeline: TimelineEntry[]
  createdBy?: Id
  createdAt: ISODate
}

export type PaymentType = 'sale' | 'rental' | 'deposit' | 'deposit_refund' | 'refund' | 'late_fee' | 'damage_fee' | 'shipping'

export interface Payment {
  id: Id
  orderId: Id
  type: PaymentType
  // Dương: cửa hàng thu vào; âm: cửa hàng trả ra.
  amount: number
  method: PaymentMethod
  note?: string
  userId?: Id
  createdAt: ISODate
}

export type RequestType = 'cancel' | 'return' | 'refund' | 'extend'
export type RequestStatus = 'pending' | 'forwarded' | 'approved' | 'rejected'

export interface OrderRequest {
  id: Id
  orderId: Id
  customerId?: Id
  type: RequestType
  reason: string
  extendDays?: number
  refundAmount?: number
  status: RequestStatus
  staffNote?: string
  handledBy?: Id
  createdAt: ISODate
  updatedAt: ISODate
}

export interface Coupon {
  id: Id
  code: string
  description: string
  kind: 'percent' | 'fixed'
  value: number
  maxDiscount?: number
  minOrder: number
  appliesTo: 'all' | 'sale' | 'rental'
  minTier?: Tier
  startAt: string
  endAt: string
  usageLimit: number
  used: number
  active: boolean
}

export interface Review {
  id: Id
  productId: Id
  customerId: Id
  orderId: Id
  rating: number
  comment: string
  hidden: boolean
  reply?: string
  createdAt: ISODate
}

export interface Notification {
  id: Id
  userId: Id
  title: string
  body: string
  link?: string
  read: boolean
  key?: string
  createdAt: ISODate
}

export type TicketType = 'feedback' | 'complaint' | 'support'
export type TicketStatus = 'open' | 'in_progress' | 'resolved'

export interface TicketMessage { from: Id; text: string; at: ISODate }

export interface Ticket {
  id: Id
  customerId: Id
  type: TicketType
  subject: string
  orderId?: Id
  status: TicketStatus
  assignedTo?: Id
  messages: TicketMessage[]
  createdAt: ISODate
}

export interface Task {
  id: Id
  title: string
  description?: string
  assigneeId: Id
  dueDate?: string
  status: 'todo' | 'doing' | 'done'
  createdBy: Id
  createdAt: ISODate
}

export interface ActivityLog {
  id: Id
  userId?: Id
  action: string
  target?: string
  at: ISODate
}

export interface AiLog {
  id: Id
  userId?: Id
  scope: 'shop' | 'admin'
  question: string
  answer: string
  at: ISODate
}

export interface StoreSettings {
  storeName: string
  address: string
  hotline: string
  email: string
  openHours: string
  heroTitle: string
  heroSubtitle: string
  announcement: string
  shippingFee: number
  freeShippingFrom: number
  lateFeePercentPerDay: number
  pointsPerAmount: number
  pointValue: number
  tiers: { name: Tier; minSpent: number }[]
}

export interface PasswordReset { email: string; code: string; expiresAt: ISODate }

/**
 * Thống kê tổng hợp cho lọc cộng tác (không chứa thông tin cá nhân):
 * pairs: [sản phẩm a, sản phẩm b, tích vô hướng, số khách chung]; items: [sản phẩm, tổng bình phương trọng số, số khách].
 */
export interface CfStats { pairs: [Id, Id, number, number][]; items: [Id, number, number][] }

export interface Database {
  version: number
  users: User[]
  categories: Category[]
  suppliers: Supplier[]
  collections: Collection[]
  products: Product[]
  variants: Variant[]
  movements: StockMovement[]
  carts: Record<Id, CartItem[]>
  wishlists: Record<Id, Id[]>
  orders: Order[]
  payments: Payment[]
  requests: OrderRequest[]
  coupons: Coupon[]
  reviews: Review[]
  notifications: Notification[]
  tickets: Ticket[]
  tasks: Task[]
  activity: ActivityLog[]
  aiLogs: AiLog[]
  settings: StoreSettings
  resets: PasswordReset[]
  // Trang quản trị và trang khách hàng giữ phiên đăng nhập riêng.
  session: { adminId?: Id; customerId?: Id }
  loginAttempts: Record<string, { count: number; lockUntil: number; level: number }>
  /** Chế độ Supabase: thống kê cộng tác lấy từ recommendation_stats() (khách chỉ đọc được đơn của mình). */
  recoStats?: CfStats
}
