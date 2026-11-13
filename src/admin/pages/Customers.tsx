import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Lock, LockOpen, Pencil, Plus } from 'lucide-react'
import type { User } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { adjustPoints, createStaffAccount, savePerson, toggleUserActive, updateCustomerNote, type PersonInput } from '../../services/people'
import { tierOf, totalSpent } from '../../services/promotions'
import { displayStatus, paidAmount } from '../../services/orders'
import { TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from '../../services/labels'
import { date, dateTime, matches, money } from '../../lib/format'
import { Avatar, Badge, Drawer, Empty, Field, Modal, SearchBox, StatusBadge, Stars, Tabs } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'

export function Customers() {
  const db = useDb()
  const user = useAdminUser()!
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('')
  const [editing, setEditing] = useState<User | 'new'>()
  const customers = db.users
    .filter((u) => u.role === 'customer')
    .filter((u) => matches(query, u.fullName, u.phone, u.email))
    .filter((u) => !tier || tierOf(db, u.id) === tier)
  const selected = db.users.find((u) => u.id === params.get('id'))

  return (
    <>
      <div className="page-head">
        <div><h2>Khách hàng</h2><p>Hồ sơ, liên hệ, địa chỉ, ghi chú và lịch sử giao dịch.</p></div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> Thêm khách hàng</button>
      </div>
      <section className="card">
        <div className="toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Tên, SĐT, email…" />
          <select className="select" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Mọi hạng</option>
            {db.settings.tiers.map((t) => <option key={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Khách hàng</th><th>Liên hệ</th><th>Hạng</th><th className="num">Điểm</th><th className="num">Số đơn</th><th className="num">Đã chi tiêu</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setParams({ id: c.id })}>
                  <td><div className="row"><Avatar name={c.fullName} src={c.avatar} /><div><strong>{c.fullName}</strong><div className="muted small">Từ {date(c.createdAt)}</div></div></div></td>
                  <td>{c.phone}<div className="muted small">{c.email || '—'}</div></td>
                  <td><Badge tone="accent" plain>{tierOf(db, c.id)}</Badge></td>
                  <td className="num">{c.points}</td>
                  <td className="num">{db.orders.filter((o) => o.customerId === c.id).length}</td>
                  <td className="num">{money(totalSpent(db, c.id))}</td>
                  <td>{c.isActive ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && <Empty title="Không tìm thấy khách hàng" />}
        </div>
      </section>
      {selected && <CustomerDrawer customer={selected} manager={user.role === 'manager'} onEdit={() => setEditing(selected)} onClose={() => setParams({})} />}
      {editing && <PersonForm person={editing === 'new' ? undefined : editing} role="customer" onClose={() => setEditing(undefined)} />}
    </>
  )
}

function CustomerDrawer({ customer, manager, onEdit, onClose }: { customer: User; manager: boolean; onEdit: () => void; onClose: () => void }) {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const [tab, setTab] = useState<'orders' | 'payments' | 'support'>('orders')
  const [note, setNote] = useState(customer.note ?? '')
  const [points, setPoints] = useState({ delta: 0, reason: '' })
  const orders = db.orders.filter((o) => o.customerId === customer.id)
  const orderIds = new Set(orders.map((o) => o.id))
  const payments = db.payments.filter((p) => orderIds.has(p.orderId))
  const tickets = db.tickets.filter((t) => t.customerId === customer.id)
  const reviews = db.reviews.filter((r) => r.customerId === customer.id)

  return (
    <Drawer
      title={customer.fullName}
      onClose={onClose}
      footer={manager ? (
        <>
          <button className="btn" onClick={() => void run(() => toggleUserActive(user.id, customer.id), customer.isActive ? 'Đã khóa tài khoản' : 'Đã mở khóa')}>
            {customer.isActive ? <><Lock /> Khóa tài khoản</> : <><LockOpen /> Mở khóa</>}
          </button>
          <button className="btn btn-primary" onClick={onEdit}><Pencil /> Sửa hồ sơ</button>
        </>
      ) : undefined}
    >
      <div className="stack" style={{ gap: 18 }}>
        <div className="row">
          <Avatar name={customer.fullName} src={customer.avatar} size="lg" />
          <div>
            <h3>{customer.fullName}</h3>
            <div className="muted">{customer.phone} · {customer.email || 'chưa có email'}</div>
            <div className="row" style={{ marginTop: 6 }}><Badge tone="accent" plain>{tierOf(db, customer.id)}</Badge><Badge plain>{customer.points} điểm</Badge><Badge plain>Đã chi {money(totalSpent(db, customer.id))}</Badge></div>
          </div>
        </div>
        <dl className="kv">
          <dt>Giới tính</dt><dd>{customer.gender ?? '—'}</dd>
          <dt>Ngày sinh</dt><dd>{date(customer.birthDate)}</dd>
          <dt>Địa chỉ</dt>
          <dd>{customer.addresses.length ? customer.addresses.map((a) => <div key={a.id}>{a.line}{a.isDefault && <span className="muted"> (mặc định)</span>}</div>) : '—'}</dd>
        </dl>
        <Field label="Ghi chú nội bộ">
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sở thích, size thường mặc, lưu ý khi phục vụ…" />
        </Field>
        <div><button className="btn btn-sm" disabled={note === (customer.note ?? '')} onClick={() => void run(() => updateCustomerNote(user.id, customer.id, note), 'Đã lưu ghi chú')}>Lưu ghi chú</button></div>
        {manager && (
          <div className="card card-pad stack-sm">
            <strong>Điều chỉnh điểm thưởng</strong>
            <div className="row">
              <input className="input" style={{ width: 110 }} type="number" value={points.delta} onChange={(e) => setPoints({ ...points, delta: Math.trunc(Number(e.target.value)) })} />
              <input className="input grow" placeholder="Lý do" value={points.reason} onChange={(e) => setPoints({ ...points, reason: e.target.value })} />
              <button className="btn" onClick={() => void run(() => adjustPoints(user.id, customer.id, points.delta, points.reason), 'Đã cập nhật điểm').then((ok) => ok && setPoints({ delta: 0, reason: '' }))}>Áp dụng</button>
            </div>
          </div>
        )}
        <Tabs value={tab} onChange={setTab} items={[{ value: 'orders', label: 'Đơn hàng', count: orders.length }, { value: 'payments', label: 'Thanh toán', count: payments.length }, { value: 'support', label: 'Hỗ trợ & đánh giá', count: tickets.length + reviews.length }]} />
        {tab === 'orders' && (orders.length ? (
          <table className="table">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/admin/${o.type === 'sale' ? 'don-mua' : 'don-thue'}?id=${o.id}`} className="strong">{o.code}</Link><div className="muted small">{dateTime(o.createdAt)}</div></td>
                  <td>{o.type === 'sale' ? 'Mua' : 'Thuê'} · {o.items.map((i) => i.name).join(', ')}</td>
                  <td><StatusBadge value={displayStatus(o)} /></td>
                  <td className="num">{money(o.total)}<div className="muted small">đã thu {money(paidAmount(db, o.id))}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="Chưa có đơn hàng" />)}
        {tab === 'payments' && (payments.length ? (
          <table className="table">
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="muted small nowrap">{dateTime(p.createdAt)}</td>
                  <td>{db.orders.find((o) => o.id === p.orderId)?.code}</td>
                  <td>{p.note || p.type}</td>
                  <td className={`num ${p.amount < 0 ? 'danger-text' : ''}`}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="Chưa có thanh toán" />)}
        {tab === 'support' && (
          <div className="stack">
            {tickets.map((t) => (
              <Link key={t.id} to="/admin/ho-tro" className="row-between card card-pad" style={{ textDecoration: 'none' }}>
                <span><strong>{t.subject}</strong><span className="muted small"> · {TICKET_TYPE_LABEL[t.type]}</span></span>
                <StatusBadge value={TICKET_STATUS_LABEL[t.status]} />
              </Link>
            ))}
            {reviews.map((r) => (
              <div key={r.id} className="card card-pad">
                <Stars value={r.rating} /> <span className="muted small">{db.products.find((p) => p.id === r.productId)?.name}</span>
                <p>{r.comment}</p>
              </div>
            ))}
            {tickets.length + reviews.length === 0 && <Empty />}
          </div>
        )}
      </div>
    </Drawer>
  )
}

export function PersonForm({ person, role, onClose }: { person?: User; role: 'customer' | 'staff'; onClose: () => void }) {
  const user = useAdminUser()!
  const run = useAction()
  const { toast } = useFeedback()
  const [form, setForm] = useState<PersonInput>({
    fullName: person?.fullName ?? '', email: person?.email ?? '', phone: person?.phone ?? '', username: person?.username ?? '', gender: person?.gender,
    birthDate: person?.birthDate ?? '', note: person?.note ?? '', position: person?.position ?? '', role: person?.role ?? role, password: '', address: '',
  })
  const set = (patch: Partial<PersonInput>) => setForm((f) => ({ ...f, ...patch }))
  const staff = role === 'staff'
  const save = async () => {
    // Nhân viên mới cần tài khoản đăng nhập; khách hàng tạo tại cửa hàng chỉ cần hồ sơ.
    if (!person && staff) {
      let needsConfirmation = false
      const ok = await run(async () => {
        needsConfirmation = (await createStaffAccount(user.id, form)).needsConfirmation
      }, 'Đã tạo tài khoản nhân viên')
      if (ok && needsConfirmation) toast(`Nhân viên cần mở email ${form.email} và xác nhận trước khi đăng nhập lần đầu.`)
      if (ok) onClose()
      return
    }
    if (await run(() => savePerson(user.id, form, person?.id), person ? 'Đã cập nhật' : 'Đã thêm mới')) onClose()
  }
  return (
    <Modal title={`${person ? 'Sửa' : 'Thêm'} ${staff ? 'nhân viên' : 'khách hàng'}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={() => void save()}>Lưu</button></>}>
      <div className="grid-2">
        <Field label="Họ và tên" className="span-2"><input className="input" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} autoFocus /></Field>
        <Field label="Số điện thoại"><input className="input" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Giới tính">
          <select className="select" value={form.gender ?? ''} onChange={(e) => set({ gender: (e.target.value || undefined) as User['gender'] })}>
            <option value="">—</option><option>Nam</option><option>Nữ</option><option>Khác</option>
          </select>
        </Field>
        <Field label="Ngày sinh"><input className="input" type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} /></Field>
        {staff && (
          <>
            <Field label="Tên đăng nhập"><input className="input" value={form.username} onChange={(e) => set({ username: e.target.value })} /></Field>
            <Field label="Vai trò">
              <select className="select" value={form.role} onChange={(e) => set({ role: e.target.value as PersonInput['role'] })}>
                <option value="staff">Nhân viên</option><option value="manager">Quản lý</option>
              </select>
            </Field>
            <Field label="Vị trí / phân công"><input className="input" value={form.position} onChange={(e) => set({ position: e.target.value })} placeholder="Bán hàng, kho, giao nhận…" /></Field>
            <Field label={person ? 'Mật khẩu mới (bỏ trống nếu giữ nguyên)' : 'Mật khẩu'}><input className="input" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} /></Field>
          </>
        )}
        {!staff && !person && <Field label="Địa chỉ" className="span-2"><input className="input" value={form.address} onChange={(e) => set({ address: e.target.value })} /></Field>}
        {!staff && <Field label="Ghi chú" className="span-2"><textarea className="textarea" value={form.note} onChange={(e) => set({ note: e.target.value })} /></Field>}
      </div>
    </Modal>
  )
}
