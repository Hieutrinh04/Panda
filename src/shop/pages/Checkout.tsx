import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import type { DeliveryMethod, Order, PaymentMethod } from '../../types'
import { useDb } from '../../data/store'
import { useCustomer } from '../../services/auth'
import { cartLines, placeOrders, quote } from '../../services/orders'
import { saveAddress } from '../../services/people'
import { date, money } from '../../lib/format'
import { Field, Modal } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'
import { startVnpayPayment, vnpayAvailable } from '../../services/payments'
import { errorMessage } from '../../services/core'

const COD = { value: 'cod' as const, label: 'Thanh toán khi nhận hàng', hint: 'Trả tiền mặt cho nhân viên giao hàng hoặc tại cửa hàng' }
// Khi kết nối Supabase: thanh toán qua cổng VNPay (sandbox). Chế độ cục bộ: cổng giả lập.
const PAYMENTS: { value: PaymentMethod; label: string; hint: string }[] = vnpayAvailable
  ? [COD, { value: 'vnpay', label: 'Thanh toán qua VNPay', hint: 'Thẻ ATM nội địa, QR ngân hàng, thẻ quốc tế (môi trường thử nghiệm)' }]
  : [
      COD,
      { value: 'bank', label: 'Chuyển khoản ngân hàng', hint: 'Quét mã QR, xác nhận tự động (giả lập)' },
      { value: 'card', label: 'Thẻ / ví điện tử', hint: 'Visa, Mastercard, MoMo, ZaloPay (giả lập)' },
    ]

export function Checkout() {
  const db = useDb()
  const customer = useCustomer()
  const navigate = useNavigate()
  const run = useAction()
  const { toast } = useFeedback()
  const defaultAddress = customer?.addresses.find((a) => a.isDefault) ?? customer?.addresses[0]
  const [addressId, setAddressId] = useState(defaultAddress?.id ?? 'new')
  const [receiver, setReceiver] = useState({ name: customer?.fullName ?? '', phone: customer?.phone ?? '', line: '', save: true })
  const [delivery, setDelivery] = useState<DeliveryMethod>('delivery')
  const [payment, setPayment] = useState<PaymentMethod>('cod')
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState('')
  const [usePoints, setUsePoints] = useState(false)
  const [note, setNote] = useState('')
  const [paying, setPaying] = useState(false)
  // Sau khi đặt hàng giỏ sẽ trống; cờ này ngăn chuyển hướng về giỏ hàng trước khi sang trang đơn.
  const [placing, setPlacing] = useState(false)

  if (!customer) return <Navigate to="/dang-nhap" state={{ from: '/thanh-toan' }} replace />
  const lines = cartLines(db, customer.id)
  if (!lines.length) return placing ? null : <Navigate to="/gio-hang" replace />

  const q = quote(db, { lines, couponCode: coupon, pointsUsed: usePoints ? customer.points : 0, deliveryMethod: delivery, customer })
  const address = customer.addresses.find((a) => a.id === addressId)

  const place = async () => {
    setPaying(false)
    setPlacing(true)
    let created: Order[] = []
    const ok = await run(() => {
      if (delivery === 'delivery' && addressId === 'new' && receiver.save)
        saveAddress(customer.id, { label: 'Địa chỉ mới', receiver: receiver.name, phone: receiver.phone, line: receiver.line, isDefault: customer.addresses.length === 0 })
      created = placeOrders({
        lines, couponCode: coupon, pointsUsed: q.pointsUsed, deliveryMethod: delivery, customer,
        customerName: address && delivery === 'delivery' ? address.receiver : receiver.name,
        phone: address && delivery === 'delivery' ? address.phone : receiver.phone,
        address: address && addressId !== 'new' ? address.line : receiver.line,
        paymentMethod: payment, channel: 'online', note, clearCart: true,
      })
      if (payment !== 'vnpay') navigate(`/tai-khoan/don-hang/${created[0].id}`, { state: { placed: created.map((o) => o.code) } })
    }, payment === 'vnpay' ? undefined : 'Đặt hàng thành công!')
    if (!ok) {
      setPlacing(false)
      return ok
    }
    if (payment === 'vnpay') {
      // Đơn đã lưu trên máy chủ: xin link và chuyển sang trang thanh toán của VNPay.
      try {
        window.location.assign(await startVnpayPayment(created.map((o) => o.id)))
      } catch (error) {
        toast(`Đã đặt hàng nhưng chưa mở được VNPay: ${errorMessage(error)} Bạn có thể thanh toán lại trong trang đơn hàng.`, true)
        navigate(`/tai-khoan/don-hang/${created[0].id}`)
      }
    }
    return ok
  }

  return (
    <div className="container">
      <div className="page-title"><h1>Thanh toán</h1><p className="muted"><Link to="/gio-hang">← Quay lại giỏ hàng</Link></p></div>
      <div className="cart-layout">
        <div className="stack" style={{ gap: 18 }}>
          <section className="card card-pad stack">
            <h3>Hình thức nhận hàng</h3>
            <div className="option-cards">
              <label className={`option-card${delivery === 'delivery' ? ' on' : ''}`}><input type="radio" checked={delivery === 'delivery'} onChange={() => setDelivery('delivery')} /><div><strong>Giao tận nơi</strong><span>Phí {money(db.settings.shippingFee)}, miễn phí từ {money(db.settings.freeShippingFrom)}</span></div></label>
              <label className={`option-card${delivery === 'pickup' ? ' on' : ''}`}><input type="radio" checked={delivery === 'pickup'} onChange={() => setDelivery('pickup')} /><div><strong>Nhận tại cửa hàng</strong><span>{db.settings.address}</span></div></label>
            </div>
          </section>

          <section className="card card-pad stack">
            <h3>{delivery === 'delivery' ? 'Địa chỉ nhận hàng' : 'Thông tin người nhận'}</h3>
            {delivery === 'delivery' && (
              <div className="option-cards">
                {customer.addresses.map((a) => (
                  <label key={a.id} className={`option-card${addressId === a.id ? ' on' : ''}`}>
                    <input type="radio" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                    <div><strong>{a.receiver} · {a.phone}</strong><span>{a.label} — {a.line}</span></div>
                  </label>
                ))}
                <label className={`option-card${addressId === 'new' ? ' on' : ''}`}><input type="radio" checked={addressId === 'new'} onChange={() => setAddressId('new')} /><div><strong>Dùng địa chỉ khác</strong></div></label>
              </div>
            )}
            {(addressId === 'new' || delivery === 'pickup') && (
              <div className="grid-2">
                <Field label="Họ tên người nhận"><input className="input" value={receiver.name} onChange={(e) => setReceiver({ ...receiver, name: e.target.value })} /></Field>
                <Field label="Số điện thoại"><input className="input" value={receiver.phone} onChange={(e) => setReceiver({ ...receiver, phone: e.target.value })} /></Field>
                {delivery === 'delivery' && (
                  <>
                    <Field label="Địa chỉ" className="span-2"><input className="input" value={receiver.line} onChange={(e) => setReceiver({ ...receiver, line: e.target.value })} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" /></Field>
                    <label className="checkbox span-2"><input type="checkbox" checked={receiver.save} onChange={(e) => setReceiver({ ...receiver, save: e.target.checked })} /> Lưu vào sổ địa chỉ</label>
                  </>
                )}
              </div>
            )}
            <Field label="Ghi chú cho cửa hàng"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: gọi trước khi giao, cần sửa lai quần…" /></Field>
          </section>

          <section className="card card-pad stack">
            <h3>Phương thức thanh toán</h3>
            <div className="option-cards">
              {PAYMENTS.map((p) => (
                <label key={p.value} className={`option-card${payment === p.value ? ' on' : ''}`}>
                  <input type="radio" checked={payment === p.value} onChange={() => setPayment(p.value)} />
                  <div><strong>{p.label}</strong><span>{p.hint}</span></div>
                </label>
              ))}
            </div>
            {q.deposit > 0 && <p className="muted small">Tiền cọc {money(q.deposit)} được thanh toán cùng đơn thuê và hoàn lại khi bạn trả đồ.</p>}
          </section>
        </div>

        <aside className="card summary stack">
          <h3>Đơn hàng ({lines.length})</h3>
          {lines.map((l) => (
            <div key={l.key} className="summary-row small">
              <span>{l.product.name} × {l.quantity}<br /><span className="muted">{l.mode === 'rental' ? `Thuê ${date(l.rentalStart)}–${date(l.rentalEnd)}` : 'Mua'} · {l.variant.size}/{l.variant.color}</span></span>
              <span>{money(l.lineTotal)}</span>
            </div>
          ))}
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Mã giảm giá" />
            <button className="btn" onClick={() => setCoupon(couponInput)}>Áp dụng</button>
          </div>
          {coupon && (q.couponError ? <span className="danger-text small">{q.couponError}</span> : <span className="success-text small">Đã áp dụng {coupon}: −{money(q.couponDiscount)}</span>)}
          {customer.points > 0 && (
            <label className="checkbox small"><input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} /> Dùng điểm thưởng (có {customer.points} điểm, 1 điểm = {money(db.settings.pointValue)})</label>
          )}
          <div>
            <div className="summary-row"><span className="muted">Tiền hàng</span><span>{money(q.subtotal.sale + q.subtotal.rental)}</span></div>
            {q.couponDiscount > 0 && <div className="summary-row"><span className="muted">Mã giảm giá</span><span>−{money(q.couponDiscount)}</span></div>}
            {q.pointsDiscount > 0 && <div className="summary-row"><span className="muted">Điểm thưởng</span><span>−{money(q.pointsDiscount)}</span></div>}
            <div className="summary-row"><span className="muted">Phí giao hàng</span><span>{q.shippingFee ? money(q.shippingFee) : 'Miễn phí'}</span></div>
            {q.deposit > 0 && <div className="summary-row"><span className="muted">Tiền cọc</span><span>{money(q.deposit)}</span></div>}
            <div className="summary-row total"><span>Tổng thanh toán</span><span>{money(q.total)}</span></div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => (payment === 'cod' || payment === 'vnpay' ? void place() : setPaying(true))} disabled={placing}>{payment === 'vnpay' ? 'Đặt hàng và thanh toán' : 'Đặt hàng'}</button>
          <p className="muted small">Bạn sẽ nhận được thông báo khi đơn được xác nhận và cập nhật trạng thái.</p>
        </aside>
      </div>
      {paying && (
        <Modal title={payment === 'bank' ? 'Chuyển khoản ngân hàng' : 'Thanh toán thẻ / ví'} onClose={() => setPaying(false)} footer={<><button className="btn" onClick={() => setPaying(false)}>Hủy</button><button className="btn btn-primary" onClick={() => void place()}>Tôi đã thanh toán {money(q.total)}</button></>}>
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 160, height: 160, borderRadius: 12, background: 'repeating-conic-gradient(#17191f 0% 25%, #fff 0% 50%) 50% / 20px 20px', border: '8px solid #fff', boxShadow: 'var(--shadow)' }} aria-label="Mã QR minh họa" />
            <p>Số tiền: <strong>{money(q.total)}</strong></p>
            <p className="muted small">Đây là cổng thanh toán giả lập để minh họa luồng nghiệp vụ. Kết nối cổng thanh toán thật thuộc hướng mở rộng của đề tài.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
