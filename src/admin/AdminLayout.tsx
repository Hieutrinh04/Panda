import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ExternalLink, LogOut, Menu, ShieldAlert } from 'lucide-react'
import { isRemote, useDb, useStatus } from '../data/store'
import { syncKnowledgeBase } from '../services/knowledge'
import { logout, useAdminUser } from '../services/auth'
import { ROLE_LABEL } from '../services/labels'
import { inventorySummary } from '../services/reports'
import { NotificationBell } from '../components/NotificationBell'
import { Avatar, Empty } from '../components/ui'
import { ALL_NAV, canAccess, NAV } from './nav'
import '../styles/admin.css'

export function AdminLayout() {
  const user = useAdminUser()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const db = useDb()

  const ready = useStatus().ready && db.products.length > 0
  // Mỗi phiên quản trị đồng bộ kho tri thức RAG một lần (chỉ nhúng lại tài liệu đã thay đổi).
  useEffect(() => {
    if (!isRemote || !user || !ready) return
    try {
      if (sessionStorage.getItem('panda-kb-synced')) return
      sessionStorage.setItem('panda-kb-synced', '1')
    } catch {
      // sessionStorage bị chặn: vẫn đồng bộ.
    }
    syncKnowledgeBase(db).catch((error) => console.warn('Chưa cập nhật được kho tri thức AI:', error))
    // Chỉ chạy khi dữ liệu vừa sẵn sàng; db thay đổi sau đó không cần đồng bộ lại ngay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id])

  if (!user) return <Navigate to="/admin/dang-nhap" replace state={{ from: location.pathname }} />

  const counts = {
    pendingSale: db.orders.filter((o) => o.type === 'sale' && o.status === 'pending').length,
    pendingRental: db.orders.filter((o) => o.type === 'rental' && o.status === 'pending').length,
    requests: db.requests.filter((r) => (user.role === 'manager' ? ['pending', 'forwarded'] : ['pending']).includes(r.status)).length,
    tickets: db.tickets.filter((t) => t.status === 'open').length,
    stock: inventorySummary(db).low.length + (user.role === 'manager' ? db.movements.filter((m) => m.status === 'pending').length : 0),
  }
  const current = [...ALL_NAV].sort((a, b) => b.to.length - a.to.length).find((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`))
  const title = location.pathname === '/admin/ho-so' ? 'Hồ sơ cá nhân' : current?.label ?? 'Quản trị'

  return (
    <div className="admin">
      <aside className={`admin-side${menuOpen ? ' open' : ''}`}>
        <Link to="/admin" className="admin-brand">
          <span className="logo-mark">P</span>
          <span>
            <strong>PANDA</strong>
            <small>FASHION · QUẢN TRỊ</small>
          </span>
        </Link>
        <nav className="admin-nav" onClick={() => setMenuOpen(false)}>
          {NAV.map((group) => {
            const items = group.items.filter((i) => i.roles.includes(user.role))
            if (!items.length) return null
            return (
              <div key={group.group}>
                <h6>{group.group}</h6>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/admin'}>
                    <item.icon />
                    {item.label}
                    {item.badge && counts[item.badge] > 0 && <span className="nav-count">{counts[item.badge]}</span>}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="admin-side-foot">
          <a href="/" target="_blank" rel="noreferrer" className="row"><ExternalLink size={14} /> Xem trang cửa hàng</a>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <button className="icon-btn menu-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="Mở menu"><Menu /></button>
          <h1 className="grow">{title}</h1>
          <NotificationBell userId={user.id} />
          <Link to="/admin/ho-so" className="admin-user">
            <Avatar name={user.fullName} src={user.avatar} />
            <div>
              <strong>{user.fullName}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
          </Link>
          <button className="icon-btn" onClick={() => void logout('admin')} aria-label="Đăng xuất" title="Đăng xuất"><LogOut /></button>
        </header>
        <main className="admin-content">
          {canAccess(user.role, location.pathname) ? (
            <Outlet />
          ) : (
            <div className="card">
              <Empty title="Bạn không có quyền truy cập trang này" icon={<ShieldAlert />}>
                <span>Chức năng này dành cho quản lý cửa hàng.</span>
              </Empty>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
