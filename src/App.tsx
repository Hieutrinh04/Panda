import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { reloadRemote, useStatus } from './data/store'
import { FeedbackProvider } from './components/FeedbackProvider'
import { AdminLayout } from './admin/AdminLayout'
import { AdminLogin } from './admin/pages/AdminLogin'
import { Dashboard } from './admin/pages/Dashboard'
import { Orders } from './admin/pages/Orders'
import { Pos } from './admin/pages/Pos'
import { RentalCalendar } from './admin/pages/RentalCalendar'
import { Requests } from './admin/pages/Requests'
import { Products } from './admin/pages/Products'
import { Taxonomy } from './admin/pages/Taxonomy'
import { Inventory } from './admin/pages/Inventory'
import { Customers } from './admin/pages/Customers'
import { Staff } from './admin/pages/Staff'
import { Tasks } from './admin/pages/Tasks'
import { Promotions } from './admin/pages/Promotions'
import { Reviews } from './admin/pages/Reviews'
import { Support } from './admin/pages/Support'
import { Reports } from './admin/pages/Reports'
import { Content } from './admin/pages/Content'
import { Activity } from './admin/pages/Activity'
import { Assistant } from './admin/pages/Assistant'
import { Profile } from './admin/pages/Profile'
import { ShopRoutes } from './shop/ShopRoutes'

/** Ở chế độ Supabase, chờ tải dữ liệu lần đầu trước khi hiện giao diện. */
function DataGate({ children }: { children: ReactNode }) {
  const { ready, error } = useStatus()
  if (ready) return children
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}>
      {error ? (
        <div className="stack" style={{ maxWidth: 460 }}>
          <h2>Không tải được dữ liệu</h2>
          <p className="muted">{error}</p>
          <div><button className="btn btn-primary" onClick={() => void reloadRemote().catch(() => undefined)}>Thử lại</button></div>
        </div>
      ) : (
        <p className="muted">Đang tải dữ liệu…</p>
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <DataGate>
        <Routes>
          <Route path="/admin/dang-nhap" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="tro-ly" element={<Assistant />} />
            <Route path="ban-hang" element={<Pos />} />
            <Route path="don-mua" element={<Orders type="sale" />} />
            <Route path="don-thue" element={<Orders type="rental" />} />
            <Route path="lich-thue" element={<RentalCalendar />} />
            <Route path="yeu-cau" element={<Requests />} />
            <Route path="san-pham" element={<Products />} />
            <Route path="danh-muc" element={<Taxonomy />} />
            <Route path="kho" element={<Inventory />} />
            <Route path="khach-hang" element={<Customers />} />
            <Route path="nhan-vien" element={<Staff />} />
            <Route path="cong-viec" element={<Tasks />} />
            <Route path="khuyen-mai" element={<Promotions />} />
            <Route path="danh-gia" element={<Reviews />} />
            <Route path="ho-tro" element={<Support />} />
            <Route path="bao-cao" element={<Reports />} />
            <Route path="noi-dung" element={<Content />} />
            <Route path="nhat-ky" element={<Activity />} />
            <Route path="ho-so" element={<Profile />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
          <Route path="/*" element={<ShopRoutes />} />
        </Routes>
        </DataGate>
      </FeedbackProvider>
    </BrowserRouter>
  )
}
