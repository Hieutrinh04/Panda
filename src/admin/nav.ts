import {
  Bot, Boxes, CalendarRange, FileClock, FolderTree, Gauge, Headset, LayoutTemplate, ListChecks,
  MessageSquareText, Package, ReceiptText, Repeat, ShoppingCart, Shirt, TicketPercent, UserCog, Users, ChartColumn,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../types'

export interface NavItem { to: string; label: string; icon: LucideIcon; roles: Role[]; badge?: 'pendingSale' | 'pendingRental' | 'requests' | 'tickets' | 'stock' }

const both: Role[] = ['manager', 'staff']
const manager: Role[] = ['manager']

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Tổng quan',
    items: [
      { to: '/admin', label: 'Bảng điều khiển', icon: Gauge, roles: both },
      { to: '/admin/tro-ly', label: 'Trợ lý AI', icon: Bot, roles: both },
    ],
  },
  {
    group: 'Bán hàng',
    items: [
      { to: '/admin/ban-hang', label: 'Tạo đơn tại quầy', icon: ShoppingCart, roles: both },
      { to: '/admin/don-mua', label: 'Đơn mua', icon: ReceiptText, roles: both, badge: 'pendingSale' },
      { to: '/admin/don-thue', label: 'Đơn thuê', icon: Shirt, roles: both, badge: 'pendingRental' },
      { to: '/admin/lich-thue', label: 'Lịch thuê', icon: CalendarRange, roles: both },
      { to: '/admin/yeu-cau', label: 'Hủy · đổi trả · gia hạn', icon: Repeat, roles: both, badge: 'requests' },
    ],
  },
  {
    group: 'Hàng hóa',
    items: [
      { to: '/admin/san-pham', label: 'Sản phẩm', icon: Package, roles: both },
      { to: '/admin/danh-muc', label: 'Danh mục & NCC', icon: FolderTree, roles: manager },
      { to: '/admin/kho', label: 'Kho hàng', icon: Boxes, roles: both, badge: 'stock' },
    ],
  },
  {
    group: 'Khách hàng',
    items: [
      { to: '/admin/khach-hang', label: 'Khách hàng', icon: Users, roles: both },
      { to: '/admin/ho-tro', label: 'Hỗ trợ & khiếu nại', icon: Headset, roles: both, badge: 'tickets' },
      { to: '/admin/danh-gia', label: 'Đánh giá', icon: MessageSquareText, roles: manager },
      { to: '/admin/khuyen-mai', label: 'Khuyến mãi', icon: TicketPercent, roles: manager },
    ],
  },
  {
    group: 'Quản trị',
    items: [
      { to: '/admin/cong-viec', label: 'Công việc', icon: ListChecks, roles: both },
      { to: '/admin/nhan-vien', label: 'Nhân viên', icon: UserCog, roles: manager },
      { to: '/admin/bao-cao', label: 'Báo cáo', icon: ChartColumn, roles: manager },
      { to: '/admin/noi-dung', label: 'Nội dung & cài đặt', icon: LayoutTemplate, roles: manager },
      { to: '/admin/nhat-ky', label: 'Nhật ký hoạt động', icon: FileClock, roles: manager },
    ],
  },
]

export const ALL_NAV = NAV.flatMap((g) => g.items)

export const canAccess = (role: Role, path: string) => {
  const item = [...ALL_NAV].sort((a, b) => b.to.length - a.to.length).find((i) => path === i.to || path.startsWith(`${i.to}/`))
  return !item || item.roles.includes(role)
}
