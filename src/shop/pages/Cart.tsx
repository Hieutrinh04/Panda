import { Link, Navigate } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useDb } from '../../data/store'
import { useCustomer } from '../../services/auth'
import { productImage } from '../../services/catalog'
import { cartLines, quote, removeCartItem, updateCartItem } from '../../services/orders'
import { money, today } from '../../lib/format'
import { Empty } from '../../components/ui'
import { RecommendationSection } from '../Recommendations'
import { recommendForCart } from '../../services/recommend'

export function Cart() {
  const db = useDb()
  const customer = useCustomer()
  if (!customer) return <Navigate to="/dang-nhap" state={{ from: '/gio-hang' }} replace />
  const lines = cartLines(db, customer.id)
  const q = quote(db, { lines, deliveryMethod: 'delivery', customer })
  const pairing = recommendForCart(db, [...new Set(lines.map((l) => l.product.id))], 4)
  const invalid = lines.some((l) => l.product.status !== 'active' || l.quantity > l.available || (l.mode === 'rental' && (!l.rentalStart || l.rentalStart < today())))

  return (
    <div className="container">
      <div className="page-title"><h1>Giỏ hàng</h1><p className="muted">{lines.length} sản phẩm</p></div>
      {lines.length === 0 ? (
        <div className="card"><Empty title="Giỏ hàng đang trống" icon={<ShoppingBag />}><Link to="/san-pham" className="btn btn-primary">Tiếp tục mua sắm</Link></Empty></div>
      ) : (
        <div className="cart-layout">
          <section className="card">
            {lines.map((l) => (
              <div key={l.key} className="cart-item">
                <Link to={`/san-pham/${l.product.id}`}><img src={productImage(db, l.product, l.variant.color)} alt="" /></Link>
                <div className="stack-sm">
                  <Link to={`/san-pham/${l.product.id}`} className="strong" style={{ textDecoration: 'none' }}>{l.product.name}</Link>
                  <span className="muted small">{l.mode === 'sale' ? 'Mua' : 'Thuê'} · {l.variant.size} / {l.variant.color}</span>
                  {l.mode === 'rental' && (
                    <div className="row small">
                      <input className="input input-sm" style={{ width: 150 }} type="date" min={today()} value={l.rentalStart} onChange={(e) => updateCartItem(customer.id, l.key, { rentalStart: e.target.value })} aria-label="Ngày nhận" />
                      →
                      <input className="input input-sm" style={{ width: 150 }} type="date" min={l.rentalStart} value={l.rentalEnd} onChange={(e) => updateCartItem(customer.id, l.key, { rentalEnd: e.target.value })} aria-label="Ngày trả" />
                      <span className="muted">{l.days} ngày</span>
                    </div>
                  )}
                  <div className="row">
                    <div className="qty">
                      <button onClick={() => updateCartItem(customer.id, l.key, { quantity: l.quantity - 1 })} aria-label="Giảm"><Minus size={14} /></button>
                      <span>{l.quantity}</span>
                      <button onClick={() => updateCartItem(customer.id, l.key, { quantity: l.quantity + 1 })} aria-label="Tăng"><Plus size={14} /></button>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeCartItem(customer.id, l.key)}><Trash2 /> Xóa</button>
                  </div>
                  {l.product.status !== 'active' && <span className="danger-text small">Sản phẩm đã ngừng kinh doanh, vui lòng xóa khỏi giỏ</span>}
                  {l.quantity > l.available &&<span className="danger-text small">{l.available ? `Chỉ còn ${l.available} sản phẩm khả dụng` : l.mode === 'rental' ? 'Đã kín lịch thuê trong khoảng ngày này' : 'Đã hết hàng'}</span>}
                  {l.mode === 'rental' && l.rentalStart && l.rentalStart < today() && <span className="danger-text small">Ngày nhận đã qua, vui lòng chọn lại</span>}
                </div>
                <div className="right">
                  <strong>{money(l.lineTotal)}</strong>
                  <div className="muted small">{l.mode === 'rental' ? `${money(l.unitPrice)}/ngày` : `${money(l.unitPrice)} / sp`}</div>
                  {l.deposit > 0 && <div className="muted small">Cọc {money(l.deposit)}</div>}
                </div>
              </div>
            ))}
          </section>
          <aside className="card summary stack">
            <h3>Tóm tắt</h3>
            <div>
              {q.subtotal.sale > 0 && <div className="summary-row"><span className="muted">Tiền hàng mua</span><span>{money(q.subtotal.sale)}</span></div>}
              {q.subtotal.rental > 0 && <div className="summary-row"><span className="muted">Tiền thuê</span><span>{money(q.subtotal.rental)}</span></div>}
              {q.deposit > 0 && <div className="summary-row"><span className="muted">Tiền cọc</span><span>{money(q.deposit)}</span></div>}
              <div className="summary-row"><span className="muted">Phí giao hàng</span><span>{q.shippingFee ? money(q.shippingFee) : 'Miễn phí'}</span></div>
              <div className="summary-row total"><span>Tạm tính</span><span>{money(q.total)}</span></div>
            </div>
            <p className="muted small">Mã giảm giá và điểm thưởng được áp dụng ở bước thanh toán. Đơn có cả hàng mua và hàng thuê sẽ được tách thành 2 đơn.</p>
            <Link to="/thanh-toan" className={`btn btn-primary btn-lg btn-block${invalid ? ' disabled' : ''}`} aria-disabled={invalid} onClick={(e) => invalid && e.preventDefault()} style={invalid ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>Tiến hành đặt hàng</Link>
            <Link to="/san-pham" className="btn btn-block">Tiếp tục mua sắm</Link>
          </aside>
        </div>
      )}
      <RecommendationSection eyebrow="PHỐI ĐỒ" title="Gợi ý mua kèm" items={pairing} />
    </div>
  )
}
