import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Heart, Menu, MessageCircle, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { useDb } from '../data/store'
import { useCustomer } from '../services/auth'
import { syncRentalReminders } from '../services/orders'
import { NotificationBell } from '../components/NotificationBell'
import { ChatPanel } from '../components/ChatPanel'

export function ShopLayout() {
  const settings = useDb((db) => db.settings)
  const customer = useCustomer()
  const db = useDb()
  const cart = customer ? db.carts[customer.id] ?? [] : []
  const cartCount = cart.length
  const cartProductIds = cart.map((c) => db.variants.find((v) => v.id === c.variantId)?.productId).filter((id): id is string => Boolean(id))
  const wishCount = useDb((db) => (customer ? db.wishlists[customer.id]?.length ?? 0 : 0))
  const location = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [chat, setChat] = useState(false)
  const [search, setSearch] = useState('')
  const catalogMode = location.pathname === '/san-pham' ? new URLSearchParams(location.search).get('mode') : undefined

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (customer) syncRentalReminders(customer.id)
  }, [customer])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(`/san-pham?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <div className="shop">
      {settings.announcement && <div className="announce">{settings.announcement}</div>}
      <header className="shop-header">
        <div className="container">
          <button className="icon-btn shop-menu-toggle" onClick={() => setMenu((v) => !v)} aria-label="Menu">{menu ? <X /> : <Menu />}</button>
          <Link to="/" className="shop-logo"><strong>PANDA</strong><small>FASHION</small></Link>
          <nav className={`shop-nav${menu ? ' open' : ''}`} onClick={() => setMenu(false)}>
            <NavLink to="/" end>Trang chủ</NavLink>
            <Link to="/san-pham?mode=sale" className={catalogMode === 'sale' ? 'active' : ''}>Mua sắm</Link>
            <Link to="/san-pham?mode=rental" className={catalogMode === 'rental' ? 'active' : ''}>Thuê đồ</Link>
            <NavLink to="/gioi-thieu">Về chúng tôi</NavLink>
          </nav>
          <form className="shop-search" onSubmit={submitSearch} role="search">
            <Search />
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm áo dài, vest, đầm…" aria-label="Tìm sản phẩm" />
          </form>
          <div className="shop-actions">
            {customer && <NotificationBell userId={customer.id} allLink="/tai-khoan/thong-bao" />}
            <Link to={customer ? '/tai-khoan/yeu-thich' : '/dang-nhap'} className="icon-btn" aria-label="Yêu thích">
              <Heart />{wishCount > 0 && <span className="dot-count">{wishCount}</span>}
            </Link>
            <Link to="/gio-hang" className="icon-btn" aria-label="Giỏ hàng">
              <ShoppingBag />{cartCount > 0 && <span className="dot-count">{cartCount}</span>}
            </Link>
            <Link to={customer ? '/tai-khoan' : '/dang-nhap'} className="btn btn-ghost btn-sm" aria-label="Tài khoản">
              <UserRound /> <span className="hide-sm">{customer ? customer.fullName.split(' ').at(-1) : 'Đăng nhập'}</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="shop-footer">
        <div className="container">
          <div className="grid">
            <div>
              <div className="shop-logo" style={{ color: '#fff' }}><strong>PANDA</strong><small>FASHION</small></div>
              <p style={{ marginTop: 12 }}>Mua và thuê trang phục cho những khoảnh khắc đáng nhớ.</p>
            </div>
            <div>
              <h4>Mua sắm</h4>
              <Link to="/san-pham?mode=sale">Bộ sưu tập</Link>
              <Link to="/san-pham?mode=rental">Thuê trang phục</Link>
              <Link to="/tai-khoan/uu-dai">Ưu đãi thành viên</Link>
            </div>
            <div>
              <h4>Hỗ trợ</h4>
              <Link to="/tai-khoan/don-hang">Theo dõi đơn hàng</Link>
              <Link to="/tai-khoan/ho-tro">Góp ý & khiếu nại</Link>
              <Link to="/gioi-thieu">Chính sách thuê & đổi trả</Link>
            </div>
            <div>
              <h4>Liên hệ</h4>
              <span>{settings.address}</span><br />
              <span>Hotline: {settings.hotline}</span><br />
              <span>{settings.openHours}</span>
            </div>
          </div>
          <div className="copy row-between">
            <span>© {new Date().getFullYear()} {settings.storeName}</span>
            <Link to="/admin" style={{ display: 'inline' }}>Trang quản trị</Link>
          </div>
        </div>
      </footer>

      {chat && (
        <div className="chat-window" role="dialog" aria-label="Trợ lý mua sắm">
          <header>
            <MessageCircle />
            <div className="grow"><strong>Panda Style Advisor</strong><span>Trợ lý AI tư vấn trang phục</span></div>
            <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setChat(false)} aria-label="Đóng"><X /></button>
          </header>
          <ChatPanel
            context={{ scope: 'shop', user: customer, cartProductIds }}
            greeting="Chào bạn! Mình có thể gợi ý trang phục theo dịp, ngân sách, màu sắc, size hoặc hình thức mua/thuê, và giải đáp về cọc, đổi trả, giao hàng."
            suggestions={['Váy dự tiệc để thuê dưới 400k', 'Áo dài cưới cho cô dâu', 'Vest nam màu đen size L', 'Phí trả trễ tính thế nào?', 'Có mã giảm giá nào không?']}
            onNavigate={() => setChat(false)}
          />
        </div>
      )}
      <button className="chat-fab" onClick={() => setChat((v) => !v)} aria-label="Mở trợ lý AI">{chat ? <X /> : <MessageCircle />}</button>
    </div>
  )
}
