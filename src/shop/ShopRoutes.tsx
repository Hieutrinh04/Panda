import { Navigate, Route, Routes } from 'react-router-dom'
import { ShopLayout } from './ShopLayout'
import { Home } from './pages/Home'
import { Catalog } from './pages/Catalog'
import { ProductDetail } from './pages/ProductDetail'
import { Cart } from './pages/Cart'
import { Checkout } from './pages/Checkout'
import { PaymentResult } from './pages/PaymentResult'
import { Login, Register, ForgotPassword, ResetPassword } from './pages/Auth'
import { About } from './pages/About'
import { AccountLayout } from './account/AccountLayout'
import { AccountProfile } from './account/AccountProfile'
import { AccountOrders, AccountOrderDetail } from './account/AccountOrders'
import { AccountAddresses, AccountNotifications, AccountPayments, AccountReviews, AccountRewards, AccountSupport, AccountWishlist } from './account/AccountMisc'
import '../styles/shop.css'

export function ShopRoutes() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<Home />} />
        <Route path="san-pham" element={<Catalog />} />
        <Route path="san-pham/:id" element={<ProductDetail />} />
        <Route path="gio-hang" element={<Cart />} />
        <Route path="thanh-toan" element={<Checkout />} />
        <Route path="thanh-toan/ket-qua" element={<PaymentResult />} />
        <Route path="dang-nhap" element={<Login />} />
        <Route path="dang-ky" element={<Register />} />
        <Route path="quen-mat-khau" element={<ForgotPassword />} />
        <Route path="dat-lai-mat-khau" element={<ResetPassword />} />
        <Route path="gioi-thieu" element={<About />} />
        <Route path="tai-khoan" element={<AccountLayout />}>
          <Route index element={<AccountProfile />} />
          <Route path="don-hang" element={<AccountOrders />} />
          <Route path="don-hang/:id" element={<AccountOrderDetail />} />
          <Route path="yeu-thich" element={<AccountWishlist />} />
          <Route path="dia-chi" element={<AccountAddresses />} />
          <Route path="uu-dai" element={<AccountRewards />} />
          <Route path="thong-bao" element={<AccountNotifications />} />
          <Route path="ho-tro" element={<AccountSupport />} />
          <Route path="danh-gia" element={<AccountReviews />} />
          <Route path="thanh-toan" element={<AccountPayments />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
