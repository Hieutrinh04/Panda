import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CreditCard, Package, Printer, RotateCcw } from 'lucide-react'
import type { Order, RequestType } from '../../types'
import { useDb } from '../../data/store'
import { useCustomer } from '../../services/auth'
import { productImage } from '../../services/catalog'
import { addToCart, awaitingOnlinePayment, createRequest, displayStatus, isOverdue, lateFeeFor, paidAmount, requestEligibility } from '../../services/orders'
import { startVnpayPayment } from '../../services/payments'
import { errorMessage } from '../../services/core'
import { reviewableItems } from '../../services/engagement'
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, STATUS_LABEL } from '../../services/labels'
import { date, dateTime, money } from '../../lib/format'
import { Empty, Field, Modal, StatusBadge, Tabs } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'
import { printInvoice } from '../../lib/invoice'

export function AccountOrders() {
  const db = useDb()
  const customer = useCustomer()!
  const [tab, setTab] = useState<'all' | 'sale' | 'rental' | 'active'>('all')
  const orders = db.orders
    .filter((o) => o.customerId === customer.id)
    .filter((o) => (tab === 'all' ? true : tab === 'active' ? !['completed', 'cancelled', 'returned'].includes(o.status) : o.type === tab))

  return (
    <>
      <h2>Đơn hàng của tôi</h2>
      <section className="card">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: 'Tất cả' }, { value: 'active', label: 'Đang xử lý' }, { value: 'sale', label: 'Đơn mua' }, { value: 'rental', label: 'Đơn thuê' }]} />
        {orders.map((o) => (
          <Link key={o.id} to={`/tai-khoan/don-hang/${o.id}`} className="list-row" style={{ textDecoration: 'none' }}>
            <img className="thumb thumb-lg" src={productImage(db, db.products.find((p) => p.id === o.items[0].productId) ?? db.products[0], o.items[0].color)} alt="" />
            <div className="grow">
              <div className="row"><strong>#{o.code}</strong><span className="muted small">{o.type === 'sale' ? 'Đơn mua' : 'Đơn thuê'} · {dateTime(o.createdAt)}</span></div>
              <div>{o.items.map((i) => `${i.name} (${i.size}/${i.color}) ×${i.quantity}`).join(', ')}</div>
              {o.rental && <div className="muted small">Thuê {date(o.rental.startDate)} → {date(o.rental.endDate)}{o.status === 'renting' && ` · hạn trả ${date(o.rental.endDate)}`}</div>}
            </div>
            <div className="right stack-sm" style={{ alignItems: 'flex-end' }}>
              <StatusBadge value={displayStatus(o)} />
              <strong>{money(o.total)}</strong>
            </div>
          </Link>
        ))}
        {orders.length === 0 && <Empty title="Chưa có đơn hàng" icon={<Package />}><Link to="/san-pham" className="btn">Mua sắm ngay</Link></Empty>}
      </section>
    </>
  )
}

const SALE_STEPS = ['pending', 'confirmed', 'shipping', 'completed'] as const
const RENTAL_STEPS = ['pending', 'confirmed', 'renting', 'returned', 'completed'] as const

function Progress({ order }: { order: Order }) {
  const steps: readonly string[] = order.type === 'sale' ? (order.deliveryMethod === 'pickup' ? ['pending', 'confirmed', 'completed'] : SALE_STEPS) : RENTAL_STEPS
  const index = steps.indexOf(order.status)
  if (index < 0) return null
  return (
    <div className="row" style={{ gap: 0, flexWrap: 'nowrap', overflowX: 'auto' }}>
      {steps.map((s, i) => (
        <div key={s} style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
          <div style={{ height: 4, borderRadius: 2, background: i <= index ? 'var(--accent)' : 'var(--shop-line)', margin: '0 2px 8px' }} />
          <span className={`small ${i <= index ? 'strong' : 'muted'}`}>{STATUS_LABEL[s as keyof typeof STATUS_LABEL][0]}</span>
        </div>
      ))}
    </div>
  )
}

export function AccountOrderDetail() {
  const { id } = useParams()
  const db = useDb()
  const customer = useCustomer()!
  const placed = (useLocation().state as { placed?: string[] } | null)?.placed
  const [requesting, setRequesting] = useState<RequestType>()
  const run = useAction()
  const { toast } = useFeedback()
  const navigate = useNavigate()
  const order = db.orders.find((o) => o.id === id && o.customerId === customer.id)
  if (!order) return <Empty title="Không tìm thấy đơn hàng"><Link to="/tai-khoan/don-hang" className="btn">Về danh sách đơn</Link></Empty>

  const payments = db.payments.filter((p) => p.orderId === order.id)
  const requests = db.requests.filter((r) => r.orderId === order.id)
  const allowed = requestEligibility(db, order)
  const late = isOverdue(order) ? lateFeeFor(db, order) : undefined
  const toReview = reviewableItems(db, customer.id).filter((x) => x.order.id === order.id)
  const unpaid = awaitingOnlinePayment(db, order)

  // Thanh toán lại qua VNPay (lần trước khách hủy hoặc thanh toán lỗi).
  const payNow = async () => {
    try {
      window.location.assign(await startVnpayPayment([order.id]))
    } catch (error) {
      toast(errorMessage(error), true)
    }
  }

  // Thêm lại các sản phẩm của đơn vào giỏ; món nào hết hàng thì báo riêng.
  const reorder = async () => {
    const failed: string[] = []
    for (const item of order.items) {
      try {
        addToCart(customer.id, { variantId: item.variantId, mode: 'sale', quantity: item.quantity })
      } catch {
        failed.push(item.name)
      }
    }
    if (failed.length) toast(`Không thể thêm: ${failed.join(', ')} (hết hàng hoặc ngừng bán)`, true)
    if (failed.length < order.items.length) navigate('/gio-hang')
  }

  return (
    <>
      {placed && <div className="form-note">Đặt hàng thành công! Mã đơn: <strong>{placed.join(', ')}</strong>{placed.length > 1 && ' (hàng mua và hàng thuê được tách thành 2 đơn)'}.</div>}
      <div className="row-between">
        <div><h2>Đơn #{order.code}</h2><p className="muted">{order.type === 'sale' ? 'Đơn mua' : 'Đơn thuê'} · đặt lúc {dateTime(order.createdAt)}</p></div>
        <div className="row">
          <StatusBadge value={displayStatus(order)} />
          <button className="btn btn-sm" onClick={() => void run(() => printInvoice(order, payments, db.settings))}><Printer /> In {order.type === 'sale' ? 'hóa đơn' : 'phiếu thuê'}</button>
          {order.type === 'sale' && ['completed', 'cancelled', 'returned'].includes(order.status) && <button className="btn btn-sm btn-primary" onClick={() => void reorder()}><RotateCcw /> Mua lại</button>}
        </div>
      </div>
      <section className="card card-pad"><Progress order={order} /></section>
      {unpaid && (
        <div className="form-error row-between">
          <span>Đơn chưa được thanh toán. Cửa hàng sẽ xác nhận đơn sau khi bạn thanh toán {money(order.total)} qua VNPay.</span>
          <button className="btn btn-sm btn-primary" onClick={() => void payNow()}><CreditCard /> Thanh toán qua VNPay</button>
        </div>
      )}
      {late && <div className="form-error">Đơn thuê đã quá hạn trả {late.days} ngày. Phí trễ tạm tính {money(late.fee)} sẽ được trừ vào tiền cọc. Vui lòng trả đồ sớm hoặc liên hệ {db.settings.hotline}.</div>}

      {order.rental && (
        <section className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>Thông tin thuê & tiền cọc</h3>
          <dl className="kv">
            <dt>Ngày nhận – trả</dt><dd>{date(order.rental.startDate)} → <strong>{date(order.rental.endDate)}</strong>{order.rental.extendedDays > 0 && <span className="muted"> (đã gia hạn {order.rental.extendedDays} ngày)</span>}</dd>
            <dt>Tiền cọc</dt><dd>{money(order.depositTotal)}</dd>
            <dt>Trạng thái cọc</dt>
            <dd>{order.status === 'completed' ? <span className="success-text">Đã hoàn {money(order.rental.depositRefunded)}</span> : order.status === 'cancelled' ? 'Đã hủy' : order.rental.deliveredAt || payments.some((p) => p.type === 'deposit') ? 'Cửa hàng đang giữ, hoàn khi trả đồ' : 'Thanh toán khi nhận đồ'}</dd>
            {(order.rental.lateFee > 0 || order.rental.damageFee > 0) && <><dt>Phí phát sinh</dt><dd>Trễ hạn {money(order.rental.lateFee)} · bồi thường {money(order.rental.damageFee)}</dd></>}
            {order.rental.conditionIn && <><dt>Tình trạng khi trả</dt><dd>{order.rental.conditionIn}</dd></>}
          </dl>
        </section>
      )}

      <section className="card">
        {order.items.map((i) => {
          const product = db.products.find((p) => p.id === i.productId)
          return (
            <div key={i.variantId} className="list-row">
              {product && <img className="thumb thumb-lg" src={productImage(db, product, i.color)} alt="" />}
              <div className="grow">
                {product ? <Link to={`/san-pham/${product.id}`} className="strong">{i.name}</Link> : <strong>{i.name}</strong>}
                <div className="muted small">{i.size} / {i.color} · SL {i.quantity}{order.type === 'rental' && ` · ${i.days} ngày`}</div>
              </div>
              <div className="right">{money(i.unitPrice * i.quantity * (order.type === 'rental' ? i.days : 1))}{toReview.some((x) => x.item.variantId === i.variantId) && <div><Link to="/tai-khoan/danh-gia" className="btn btn-sm btn-accent" style={{ marginTop: 6 }}>Đánh giá</Link></div>}</div>
            </div>
          )
        })}
        <div className="card-body">
          <div className="summary-row"><span className="muted">Tạm tính</span><span>{money(order.subtotal)}</span></div>
          {order.discount > 0 && <div className="summary-row"><span className="muted">Giảm giá</span><span>−{money(order.discount)}</span></div>}
          <div className="summary-row"><span className="muted">Phí giao hàng</span><span>{money(order.shippingFee)}</span></div>
          {order.depositTotal > 0 && <div className="summary-row"><span className="muted">Tiền cọc</span><span>{money(order.depositTotal)}</span></div>}
          <div className="summary-row total"><span>Tổng</span><span>{money(order.total)}</span></div>
          <div className="summary-row"><span className="muted">Đã thanh toán (ròng)</span><span>{money(paidAmount(db, order.id))}</span></div>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>Giao nhận & thanh toán</h3>
          <dl className="kv">
            <dt>Người nhận</dt><dd>{order.customerName} · {order.phone}</dd>
            <dt>Nhận hàng</dt><dd>{order.address}</dd>
            {order.carrier && <><dt>Vận chuyển</dt><dd>{order.carrier}{order.trackingCode && <> · mã vận đơn <strong>{order.trackingCode}</strong></>}</dd></>}
            <dt>Thanh toán</dt><dd>{PAYMENT_METHOD_LABEL[order.paymentMethod]}</dd>
          </dl>
          {payments.length > 0 && (
            <table className="table" style={{ marginTop: 12 }}>
              <tbody>{payments.map((p) => <tr key={p.id}><td>{PAYMENT_TYPE_LABEL[p.type]}</td><td className="muted small">{date(p.createdAt)}</td><td className={`num ${p.amount < 0 ? 'success-text' : ''}`}>{p.amount < 0 ? `Hoàn ${money(-p.amount)}` : money(p.amount)}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>Lịch sử đơn</h3>
          <ul className="timeline">
            {[...order.timeline].reverse().map((t, i) => (
              <li key={i}><strong>{STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]?.[0] ?? t.status}</strong> <span className="muted small">· {dateTime(t.at)}</span>{t.note && <div className="small muted">{t.note}</div>}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card card-pad stack">
        <h3>Yêu cầu hỗ trợ cho đơn này</h3>
        {requests.map((r) => (
          <div key={r.id} className="row-between">
            <span><strong>{REQUEST_TYPE_LABEL[r.type]}</strong>{r.extendDays && ` ${r.extendDays} ngày`} — {r.reason}{r.staffNote && r.status !== 'pending' && <span className="muted small"> · Phản hồi: {r.staffNote}</span>}</span>
            <StatusBadge value={REQUEST_STATUS_LABEL[r.status]} />
          </div>
        ))}
        {allowed.length > 0 ? (
          <div className="row">{allowed.map((t) => <button key={t} className="btn" onClick={() => setRequesting(t)}>Yêu cầu {REQUEST_TYPE_LABEL[t].toLowerCase()}</button>)}</div>
        ) : requests.length === 0 && <p className="muted small">Đơn hiện không có thao tác hủy, đổi trả, hoàn tiền hoặc gia hạn khả dụng.</p>}
        <Link to="/tai-khoan/ho-tro" className="small">Cần hỗ trợ khác? Gửi khiếu nại / góp ý →</Link>
      </section>
      {requesting && <RequestModal order={order} type={requesting} onClose={() => setRequesting(undefined)} />}
    </>
  )
}

function RequestModal({ order, type, onClose }: { order: Order; type: RequestType; onClose: () => void }) {
  const customer = useCustomer()!
  const run = useAction()
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(1)
  const extra = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * days
  const submit = async () => {
    if (await run(() => createRequest(customer.id, { orderId: order.id, type, reason, extendDays: type === 'extend' ? days : undefined }), 'Đã gửi yêu cầu, cửa hàng sẽ phản hồi sớm')) onClose()
  }
  return (
    <Modal title={`Yêu cầu ${REQUEST_TYPE_LABEL[type].toLowerCase()} · #${order.code}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" onClick={() => void submit()}>Gửi yêu cầu</button></>}>
      <div className="stack">
        {type === 'extend' && (
          <>
            <Field label="Số ngày muốn gia hạn"><input className="input" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} /></Field>
            <div className="form-note">Phí thuê thêm dự kiến: <strong>{money(extra)}</strong>. Yêu cầu được duyệt nếu mẫu chưa có khách khác đặt trong thời gian này.</div>
          </>
        )}
        {type === 'return' && <p className="muted small">Áp dụng trong 7 ngày kể từ khi nhận hàng, sản phẩm còn nguyên tem mác.</p>}
        {type === 'cancel' && <p className="muted small">Nếu đã thanh toán, tiền sẽ được hoàn lại sau khi yêu cầu được chấp thuận.</p>}
        <Field label="Lý do"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mô tả ngắn lý do của bạn" /></Field>
      </div>
    </Modal>
  )
}
