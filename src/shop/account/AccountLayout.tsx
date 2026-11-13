import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CreditCard, Gift, Heart, LifeBuoy, LogOut, MapPin, Package, Star, UserRound } from 'lucide-react'
import { useDb } from '../../data/store'
import { logout, useCustomer } from '../../services/auth'
import { tierOf } from '../../services/promotions'
import { Avatar } from '../../components/ui'

export function AccountLayout() {
  const customer = useCustomer()
  const location = useLocation()
  const navigate = useNavigate()
  const db = useDb()
  if (!customer) return <Navigate to="/dang-nhap" state={{ from: location.pathname }} replace />
  const unread = db.notifications.filter((n) => n.userId === customer.id && !n.read).length

  return (
    <div className="container account">
      <nav className="account-nav">
        <div className="who">
          <Avatar name={customer.fullName} src={customer.avatar} />
          <div><strong>{customer.fullName}</strong><div className="muted small">{tierOf(db, customer.id)} · {customer.points} điểm</div></div>
        </div>
        <NavLink to="/tai-khoan" end><UserRound /> Hồ sơ</NavLink>
        <NavLink to="/tai-khoan/don-hang"><Package /> Đơn hàng</NavLink>
        <NavLink to="/tai-khoan/yeu-thich"><Heart /> Yêu thích</NavLink>
        <NavLink to="/tai-khoan/dia-chi"><MapPin /> Sổ địa chỉ</NavLink>
        <NavLink to="/tai-khoan/uu-dai"><Gift /> Ưu đãi & điểm</NavLink>
        <NavLink to="/tai-khoan/thanh-toan"><CreditCard /> Lịch sử thanh toán</NavLink>
        <NavLink to="/tai-khoan/danh-gia"><Star /> Đánh giá</NavLink>
        <NavLink to="/tai-khoan/thong-bao"><Bell /> Thông báo{unread > 0 && <span className="badge accent plain" style={{ marginLeft: 'auto' }}>{unread}</span>}</NavLink>
        <NavLink to="/tai-khoan/ho-tro"><LifeBuoy /> Hỗ trợ</NavLink>
        <button onClick={() => void logout('shop').then(() => navigate('/'))}><LogOut /> Đăng xuất</button>
      </nav>
      <div className="account-body"><Outlet /></div>
    </div>
  )
}
