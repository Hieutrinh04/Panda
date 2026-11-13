import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Address, TicketType } from '../../types'
import { useDb } from '../../data/store'
import { useCustomer } from '../../services/auth'
import { productImage } from '../../services/catalog'
import { deleteAddress, saveAddress } from '../../services/people'
import { couponIsLive, nextTier, tierOf, totalSpent } from '../../services/promotions'
import { createReview, createTicket, markNotificationsRead, replyTicket, reviewableItems } from '../../services/engagement'
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from '../../services/labels'
import { date, dateTime, money } from '../../lib/format'
import { Badge, Empty, Field, Modal, StarInput, Stars, StatusBadge } from '../../components/ui'
import { useAction } from '../../components/feedback'
import { ProductCard } from '../ProductCard'

export function AccountWishlist() {
  const db = useDb()
  const customer = useCustomer()!
  const products = (db.wishlists[customer.id] ?? []).map((id) => db.products.find((p) => p.id === id)).filter((p) => p && p.status === 'active')
  return (
    <>
      <h2>Sản phẩm yêu thích</h2>
      {products.length ? (
        <div className="product-grid">{products.map((p) => <ProductCard key={p!.id} product={p!} />)}</div>
      ) : <div className="card"><Empty title="Chưa có sản phẩm yêu thích" icon={<Heart />}><Link to="/san-pham" className="btn">Khám phá sản phẩm</Link></Empty></div>}
    </>
  )
}

type AddressDraft = Omit<Address, 'id'> & { id?: string }

export function AccountAddresses() {
  const customer = useCustomer()!
  const run = useAction()
  const [editing, setEditing] = useState<AddressDraft>()
  return (
    <>
      <div className="row-between">
        <h2>Sổ địa chỉ</h2>
        <button className="btn btn-primary" onClick={() => setEditing({ label: 'Nhà riêng', receiver: customer.fullName, phone: customer.phone, line: '', isDefault: customer.addresses.length === 0 })}><Plus /> Thêm địa chỉ</button>
      </div>
      <div className="grid-2">
        {customer.addresses.map((a) => (
          <section key={a.id} className="card card-pad stack-sm">
            <div className="row-between"><strong>{a.label}</strong>{a.isDefault && <Badge tone="accent" plain>Mặc định</Badge>}</div>
            <div>{a.receiver} · {a.phone}</div>
            <div className="muted">{a.line}</div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEditing(a)}><Pencil /> Sửa</button>
              {!a.isDefault && <button className="btn btn-sm" onClick={() => void run(() => saveAddress(customer.id, { ...a, isDefault: true }), 'Đã đặt làm mặc định')}>Đặt mặc định</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => void run(() => deleteAddress(customer.id, a.id), 'Đã xóa địa chỉ')}><Trash2 /></button>
            </div>
          </section>
        ))}
      </div>
      {customer.addresses.length === 0 && <div className="card"><Empty title="Chưa có địa chỉ nào" /></div>}
      {editing && (
        <Modal title={editing.id ? 'Sửa địa chỉ' : 'Thêm địa chỉ'} onClose={() => setEditing(undefined)} footer={<><button className="btn" onClick={() => setEditing(undefined)}>Hủy</button><button className="btn btn-primary" onClick={() => void run(() => saveAddress(customer.id, editing), 'Đã lưu địa chỉ').then((ok) => ok && setEditing(undefined))}>Lưu</button></>}>
          <div className="grid-2">
            <Field label="Tên gợi nhớ"><input className="input" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></Field>
            <Field label="Người nhận"><input className="input" value={editing.receiver} onChange={(e) => setEditing({ ...editing, receiver: e.target.value })} /></Field>
            <Field label="Số điện thoại"><input className="input" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label="Địa chỉ" className="span-2"><input className="input" value={editing.line} onChange={(e) => setEditing({ ...editing, line: e.target.value })} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" /></Field>
            <label className="checkbox span-2"><input type="checkbox" checked={editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} /> Đặt làm địa chỉ mặc định</label>
          </div>
        </Modal>
      )}
    </>
  )
}

export function AccountRewards() {
  const db = useDb()
  const customer = useCustomer()!
  const tier = tierOf(db, customer.id)
  const spent = totalSpent(db, customer.id)
  const next = nextTier(db, customer.id)
  const coupons = db.coupons.filter(couponIsLive)
  return (
    <>
      <h2>Ưu đãi & điểm thưởng</h2>
      <section className="tier-card">
        <div className="row-between">
          <div><span style={{ opacity: 0.7 }}>Hạng thành viên</span><div className="big">{tier}</div></div>
          <div className="right"><span style={{ opacity: 0.7 }}>Điểm hiện có</span><div className="big">{customer.points}</div><span style={{ opacity: 0.7 }}>≈ {money(customer.points * db.settings.pointValue)}</span></div>
        </div>
        <p style={{ marginTop: 14, opacity: 0.85 }}>Tổng chi tiêu: {money(spent)}{next && ` · cần thêm ${money(next.remaining)} để lên hạng ${next.name}`}</p>
        {next && <div className="progress"><b style={{ width: `${Math.min(100, (spent / (spent + next.remaining)) * 100)}%` }} /></div>}
      </section>
      <p className="muted small">Mỗi {money(db.settings.pointsPerAmount)} chi tiêu ở đơn hoàn tất được 1 điểm. Dùng điểm để giảm giá ở bước thanh toán.</p>
      <h3>Mã giảm giá đang áp dụng</h3>
      <div className="grid-2">
        {coupons.map((c) => (
          <div key={c.id} className="coupon-card">
            <div className="grow">
              <strong>{c.code}</strong>
              <div className="small">{c.description}</div>
              <div className="muted small">HSD {date(c.endAt)}{c.minTier && ` · hạng ${c.minTier}+`}</div>
            </div>
            <button className="btn btn-sm" onClick={() => void navigator.clipboard?.writeText(c.code)}>Sao chép</button>
          </div>
        ))}
      </div>
      {coupons.length === 0 && <div className="card"><Empty title="Hiện chưa có mã giảm giá" /></div>}
    </>
  )
}

export function AccountPayments() {
  const db = useDb()
  const customer = useCustomer()!
  const orders = new Map(db.orders.filter((o) => o.customerId === customer.id).map((o) => [o.id, o]))
  const payments = db.payments.filter((p) => orders.has(p.orderId))
  const sum = (types: string[]) => payments.filter((p) => types.includes(p.type)).reduce((s, p) => s + p.amount, 0)
  return (
    <>
      <h2>Lịch sử thanh toán</h2>
      <div className="grid-3">
        <section className="card card-pad"><span className="muted small">Đã thanh toán</span><div className="strong" style={{ fontSize: 20 }}>{money(sum(['sale', 'rental', 'shipping', 'late_fee', 'damage_fee']))}</div></section>
        <section className="card card-pad"><span className="muted small">Tiền cọc đang giữ</span><div className="strong" style={{ fontSize: 20 }}>{money(sum(['deposit', 'deposit_refund']))}</div></section>
        <section className="card card-pad"><span className="muted small">Đã được hoàn</span><div className="strong" style={{ fontSize: 20 }}>{money(-sum(['refund', 'deposit_refund']))}</div></section>
      </div>
      <section className="card table-wrap">
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Đơn</th><th>Khoản</th><th>Hình thức</th><th className="num">Số tiền</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="muted nowrap">{dateTime(p.createdAt)}</td>
                <td><Link to={`/tai-khoan/don-hang/${p.orderId}`}>#{orders.get(p.orderId)?.code}</Link></td>
                <td>{PAYMENT_TYPE_LABEL[p.type]}{p.note && <div className="muted small">{p.note}</div>}</td>
                <td className="muted small">{PAYMENT_METHOD_LABEL[p.method]}</td>
                <td className={`num ${p.amount < 0 ? 'success-text' : ''}`}>{p.amount < 0 ? `+${money(-p.amount)} (hoàn)` : money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <Empty title="Chưa có giao dịch" />}
      </section>
    </>
  )
}

export function AccountNotifications() {
  const db = useDb()
  const customer = useCustomer()!
  const list = db.notifications.filter((n) => n.userId === customer.id)
  return (
    <>
      <div className="row-between">
        <h2>Thông báo</h2>
        {list.some((n) => !n.read) && <button className="btn btn-sm" onClick={() => markNotificationsRead(customer.id)}>Đánh dấu tất cả đã đọc</button>}
      </div>
      <section className="card">
        {list.map((n) => (
          <Link key={n.id} to={n.link ?? '#'} className={`notice${n.read ? '' : ' unread'}`} style={{ textDecoration: 'none' }} onClick={() => markNotificationsRead(customer.id, [n.id])}>
            <strong>{n.title}</strong>
            <span>{n.body}</span>
            <span>{dateTime(n.createdAt)}</span>
          </Link>
        ))}
        {list.length === 0 && <Empty title="Chưa có thông báo" />}
      </section>
    </>
  )
}

export function AccountSupport() {
  const db = useDb()
  const customer = useCustomer()!
  const run = useAction()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ type: TicketType; subject: string; message: string; orderId: string }>({ type: 'support', subject: '', message: '', orderId: '' })
  const [replies, setReplies] = useState<Record<string, string>>({})
  const tickets = db.tickets.filter((t) => t.customerId === customer.id)
  const orders = db.orders.filter((o) => o.customerId === customer.id)
  const nameOf = (id: string) => (id === customer.id ? 'Bạn' : db.users.find((u) => u.id === id)?.fullName ?? 'Panda')

  return (
    <>
      <div className="row-between">
        <h2>Góp ý, khiếu nại & hỗ trợ</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus /> Gửi yêu cầu mới</button>
      </div>
      {tickets.map((t) => (
        <section key={t.id} className="card card-pad stack">
          <div className="row-between">
            <div><strong>{t.subject}</strong> <span className="muted small">· {TICKET_TYPE_LABEL[t.type]} · {dateTime(t.createdAt)}</span></div>
            <StatusBadge value={TICKET_STATUS_LABEL[t.status]} />
          </div>
          <div className="thread">
            {t.messages.map((m, i) => (
              <div key={i} className={`msg${m.from === customer.id ? ' staff' : ''}`} style={m.from === customer.id ? undefined : { background: 'var(--shop-soft)' }}>
                {m.text}<small>{nameOf(m.from)} · {dateTime(m.at)}</small>
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" placeholder="Trả lời…" value={replies[t.id] ?? ''} onChange={(e) => setReplies({ ...replies, [t.id]: e.target.value })} />
            <button className="btn" disabled={!replies[t.id]?.trim()} onClick={() => void run(() => replyTicket(customer.id, t.id, replies[t.id]), 'Đã gửi').then((ok) => ok && setReplies({ ...replies, [t.id]: '' }))}>Gửi</button>
          </div>
        </section>
      ))}
      {tickets.length === 0 && <div className="card"><Empty title="Bạn chưa gửi yêu cầu nào" /></div>}
      {creating && (
        <Modal title="Gửi yêu cầu hỗ trợ" onClose={() => setCreating(false)} footer={<><button className="btn" onClick={() => setCreating(false)}>Hủy</button><button className="btn btn-primary" onClick={() => void run(() => createTicket(customer.id, form.type, form.subject, form.message, form.orderId || undefined), 'Đã gửi, Panda sẽ phản hồi sớm').then((ok) => ok && setCreating(false))}>Gửi</button></>}>
          <div className="stack">
            <div className="grid-2">
              <Field label="Loại">
                <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TicketType })}>
                  <option value="support">Cần hỗ trợ</option><option value="complaint">Khiếu nại</option><option value="feedback">Góp ý</option>
                </select>
              </Field>
              <Field label="Liên quan đến đơn">
                <select className="select" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}>
                  <option value="">Không</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>#{o.code}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Tiêu đề"><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            <Field label="Nội dung"><textarea className="textarea" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

export function AccountReviews() {
  const db = useDb()
  const customer = useCustomer()!
  const run = useAction()
  const pending = reviewableItems(db, customer.id)
  const mine = db.reviews.filter((r) => r.customerId === customer.id)
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({})

  return (
    <>
      <h2>Đánh giá sản phẩm</h2>
      {pending.length > 0 && <h3>Chờ đánh giá</h3>}
      {pending.map(({ order, item }) => {
        const key = `${order.id}-${item.productId}`
        const draft = drafts[key] ?? { rating: 5, comment: '' }
        const product = db.products.find((p) => p.id === item.productId)
        return (
          <section key={key} className="card card-pad stack-sm">
            <div className="row">
              {product && <img className="thumb" src={productImage(db, product, item.color)} alt="" />}
              <div><strong>{item.name}</strong><div className="muted small">Đơn #{order.code} · {item.size}/{item.color}</div></div>
            </div>
            <StarInput value={draft.rating} onChange={(rating) => setDrafts({ ...drafts, [key]: { ...draft, rating } })} />
            <textarea className="textarea" placeholder="Chia sẻ cảm nhận về chất liệu, form dáng, dịch vụ…" value={draft.comment} onChange={(e) => setDrafts({ ...drafts, [key]: { ...draft, comment: e.target.value } })} />
            <div><button className="btn btn-primary" onClick={() => void run(() => createReview(customer.id, order.id, item.productId, draft.rating, draft.comment), 'Cảm ơn bạn đã đánh giá!')}>Gửi đánh giá</button></div>
          </section>
        )
      })}
      <h3>Đánh giá của tôi</h3>
      {mine.map((r) => (
        <section key={r.id} className="card card-pad stack-sm">
          <div className="row-between"><Link to={`/san-pham/${r.productId}`} className="strong">{db.products.find((p) => p.id === r.productId)?.name}</Link><span className="muted small">{date(r.createdAt)}</span></div>
          <Stars value={r.rating} />
          <p>{r.comment}</p>
          {r.hidden && <Badge>Đã bị ẩn bởi cửa hàng</Badge>}
          {r.reply && <div className="review-reply"><strong>Panda Fashion:</strong> {r.reply}</div>}
        </section>
      ))}
      {mine.length === 0 && pending.length === 0 && <div className="card"><Empty title="Bạn chưa có sản phẩm để đánh giá"><span>Bạn có thể đánh giá sau khi đơn hàng hoàn tất.</span></Empty></div>}
    </>
  )
}
