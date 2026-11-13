import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Printer, Repeat } from 'lucide-react'
import type { Order, OrderStatus, OrderType, PaymentMethod, PaymentType, RequestType } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { advanceOrder, assignOrder, createRequest, displayStatus, isOverdue, lateFeeFor, nextSteps, paidAmount, recordPayment, requestEligibility } from '../../services/orders'
import { printInvoice } from '../../lib/invoice'
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, STATUS_LABEL } from '../../services/labels'
import { date, dateTime, matches, money, rentalDays, today } from '../../lib/format'
import { Drawer, Empty, Field, Modal, SearchBox, StatusBadge, Tabs, Badge } from '../../components/ui'
import { useAction } from '../../components/feedback'

type Filter = 'all' | OrderStatus | 'overdue'

const FILTERS: Record<OrderType, Filter[]> = {
  sale: ['all', 'pending', 'confirmed', 'shipping', 'completed', 'returned', 'cancelled'],
  rental: ['all', 'pending', 'confirmed', 'renting', 'overdue', 'returned', 'completed', 'cancelled'],
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Xác nhận đơn',
  shipping: 'Giao cho vận chuyển',
  completed: 'Hoàn tất',
  renting: 'Giao đồ cho khách',
  returned: 'Nhận lại đồ',
  cancelled: 'Hủy đơn',
}

export function Orders({ type }: { type: OrderType }) {
  const db = useDb()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('status') as Filter) ?? 'all'
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState<'all' | 'online' | 'store'>('all')
  const selectedId = params.get('id')

  const all = db.orders.filter((o) => o.type === type)
  const countOf = (f: Filter) => (f === 'all' ? all.length : f === 'overdue' ? all.filter(isOverdue).length : all.filter((o) => o.status === f).length)
  const list = all
    .filter((o) => filter === 'all' || (filter === 'overdue' ? isOverdue(o) : o.status === filter))
    .filter((o) => channel === 'all' || o.channel === channel)
    .filter((o) => matches(query, o.code, o.customerName, o.phone, ...o.items.map((i) => i.name)))

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key === 'status' })
  }

  const selected = db.orders.find((o) => o.id === selectedId)

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{type === 'sale' ? 'Đơn mua' : 'Đơn thuê'}</h2>
          <p>{type === 'sale' ? 'Xác nhận, giao hàng và hoàn tất đơn mua.' : 'Theo dõi thời gian thuê, tiền cọc, giao nhận và phí phát sinh.'}</p>
        </div>
        <Link to="/admin/ban-hang" className="btn btn-primary">Tạo đơn tại quầy</Link>
      </div>
      <section className="card">
        <Tabs
          value={filter}
          onChange={(v) => setParam('status', v === 'all' ? undefined : v)}
          items={FILTERS[type].map((f) => ({ value: f, label: f === 'all' ? 'Tất cả' : STATUS_LABEL[f][0], count: countOf(f) }))}
        />
        <div className="toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Mã đơn, khách hàng, SĐT, sản phẩm…" />
          <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="all">Mọi kênh</option>
            <option value="online">Đặt online</option>
            <option value="store">Tại cửa hàng</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã đơn</th><th>Khách hàng</th><th>Sản phẩm</th>
                {type === 'rental' && <th>Thời gian thuê</th>}
                <th>Trạng thái</th><th className="num">Tổng</th><th>Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setParam('id', o.id)}>
                  <td><strong>{o.code}</strong><div className="muted small">{o.channel === 'store' ? 'Tại quầy' : 'Online'}</div></td>
                  <td>{o.customerName}<div className="muted small">{o.phone}</div></td>
                  <td>{o.items[0].name}{o.items.length > 1 && <span className="muted"> +{o.items.length - 1}</span>}<div className="muted small">{o.items[0].size} / {o.items[0].color}</div></td>
                  {type === 'rental' && <td className="nowrap">{date(o.rental!.startDate)} → {date(o.rental!.endDate)}</td>}
                  <td><StatusBadge value={displayStatus(o)} /></td>
                  <td className="num">{money(o.total)}</td>
                  <td className="muted nowrap">{dateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <Empty title="Không có đơn phù hợp" />}
        </div>
      </section>
      {selected && <OrderDrawer order={selected} onClose={() => setParam('id')} />}
    </>
  )
}

type Dialog = { kind: 'step'; next: OrderStatus } | { kind: 'payment' } | { kind: 'request' }

/** Nhân viên ghi nhận yêu cầu hủy / đổi trả / hoàn tiền / gia hạn khi khách đến cửa hàng hoặc gọi điện. */
function RequestDialog({ order, types, onClose }: { order: Order; types: RequestType[]; onClose: () => void }) {
  const user = useAdminUser()!
  const run = useAction()
  const [type, setType] = useState(types[0])
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(1)
  const submit = async () => {
    const ok = await run(() => createRequest(user.id, { orderId: order.id, type, reason, extendDays: type === 'extend' ? days : undefined }), user.role === 'manager' ? 'Đã tạo yêu cầu, bạn có thể duyệt ngay' : 'Đã chuyển yêu cầu cho quản lý duyệt')
    if (ok) onClose()
  }
  return (
    <Modal title={`Ghi nhận yêu cầu · ${order.code}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" onClick={() => void submit()}>Lưu yêu cầu</button></>}>
      <div className="stack">
        <Field label="Loại yêu cầu">
          <select className="select" value={type} onChange={(e) => setType(e.target.value as RequestType)}>
            {types.map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        {type === 'extend' && <Field label="Số ngày gia hạn"><input className="input" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} /></Field>}
        <Field label="Lý do khách đưa ra"><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="muted small">{user.role === 'manager' ? 'Yêu cầu sẽ hiện ở mục Hủy · đổi trả · gia hạn để bạn duyệt.' : 'Yêu cầu được chuyển thẳng cho quản lý phê duyệt.'}</p>
      </div>
    </Modal>
  )
}

export function OrderDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const [dialog, setDialog] = useState<Dialog>()
  const paid = paidAmount(db, order.id)
  const payments = db.payments.filter((p) => p.orderId === order.id)
  const requests = db.requests.filter((r) => r.orderId === order.id)
  const staff = db.users.filter((u) => u.role !== 'customer' && u.isActive)
  const late = isOverdue(order) ? lateFeeFor(db, order) : undefined
  const eligible = requestEligibility(db, order)
  const nameOf = (id?: string) => db.users.find((u) => u.id === id)?.fullName

  return (
    <Drawer
      title={<span className="row">Đơn {order.code} <StatusBadge value={displayStatus(order)} /></span>}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => setDialog({ kind: 'payment' })}>Ghi nhận thu/chi</button>
          <div className="grow" />
          {nextSteps(order).map((next) => (
            <button key={next} className={`btn ${next === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} onClick={() => setDialog({ kind: 'step', next })}>
              {ACTION_LABEL[next]}
            </button>
          ))}
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <div className="row">
          <button className="btn btn-sm" onClick={() => void run(() => printInvoice(order, payments, db.settings))}><Printer /> In {order.type === 'sale' ? 'hóa đơn' : 'phiếu thuê'}</button>
          {eligible.length > 0 && <button className="btn btn-sm" onClick={() => setDialog({ kind: 'request' })}><Repeat /> Ghi nhận yêu cầu của khách</button>}
        </div>
        {late && <div className="form-error">Quá hạn trả {late.days} ngày (hạn {date(order.rental!.endDate)}). Phí trễ tạm tính: <strong>{money(late.fee)}</strong>.</div>}

        <dl className="kv">
          <dt>Khách hàng</dt>
          <dd>{order.customerId ? <Link to={`/admin/khach-hang?id=${order.customerId}`}>{order.customerName}</Link> : order.customerName} · {order.phone}</dd>
          <dt>Nhận hàng</dt>
          <dd>{order.deliveryMethod === 'pickup' ? 'Nhận tại cửa hàng' : order.address}</dd>
          {order.carrier && <><dt>Vận chuyển</dt><dd>{order.carrier}{order.trackingCode && ` · mã ${order.trackingCode}`}</dd></>}
          <dt>Thanh toán</dt>
          <dd>{PAYMENT_METHOD_LABEL[order.paymentMethod]}</dd>
          <dt>Kênh</dt>
          <dd>{order.channel === 'store' ? `Tại cửa hàng${order.createdBy ? ` · ${nameOf(order.createdBy)}` : ''}` : 'Đặt online'}</dd>
          {order.note && <><dt>Ghi chú</dt><dd>{order.note}</dd></>}
          <dt>Phụ trách</dt>
          <dd>
            {user.role === 'manager' ? (
              <select className="select input-sm" style={{ maxWidth: 240 }} value={order.assignedTo ?? ''} onChange={(e) => void run(() => assignOrder(user.id, order.id, e.target.value || undefined), 'Đã phân công')}>
                <option value="">— Chưa phân công —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            ) : nameOf(order.assignedTo) ?? 'Chưa phân công'}
          </dd>
        </dl>

        {order.rental && (
          <section className="card card-pad">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Thông tin thuê</h3>
            <dl className="kv">
              <dt>Thời gian</dt>
              <dd>{date(order.rental.startDate)} → {date(order.rental.endDate)} ({rentalDays(order.rental.startDate, order.rental.endDate)} ngày){order.rental.extendedDays > 0 && <span className="muted"> · đã gia hạn {order.rental.extendedDays} ngày</span>}</dd>
              <dt>Giao đồ</dt>
              <dd>{order.rental.deliveredAt ? `${dateTime(order.rental.deliveredAt)} — ${order.rental.conditionOut}` : 'Chưa giao'}</dd>
              <dt>Nhận lại</dt>
              <dd>{order.rental.returnedAt ? `${dateTime(order.rental.returnedAt)} — ${order.rental.conditionIn}` : 'Chưa trả'}</dd>
              <dt>Tiền cọc</dt>
              <dd>{money(order.depositTotal)}{order.status === 'completed' && <span className="muted"> · đã hoàn {money(order.rental.depositRefunded)}</span>}</dd>
              {(order.rental.lateFee > 0 || order.rental.damageFee > 0) && (
                <><dt>Phí phát sinh</dt><dd>Trễ hạn {money(order.rental.lateFee)} · Bồi thường {money(order.rental.damageFee)}</dd></>
              )}
            </dl>
          </section>
        )}

        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th>Sản phẩm</th><th>SL</th><th className="num">Đơn giá</th><th className="num">Thành tiền</th></tr></thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.variantId}>
                  <td><strong>{i.name}</strong><div className="muted small">{i.sku} · {i.size} / {i.color}</div></td>
                  <td>{i.quantity}</td>
                  <td className="num">{money(i.unitPrice)}{order.type === 'rental' && <div className="muted small">/ngày × {i.days}</div>}</td>
                  <td className="num">{money(i.unitPrice * i.quantity * (order.type === 'rental' ? i.days : 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="summary-row"><span className="muted">Tạm tính</span><span>{money(order.subtotal)}</span></div>
          {order.discount > 0 && <div className="summary-row"><span className="muted">Giảm giá {order.couponCode && `(${order.couponCode})`}{order.pointsUsed > 0 && ` · ${order.pointsUsed} điểm`}</span><span>−{money(order.discount)}</span></div>}
          <div className="summary-row"><span className="muted">Phí giao hàng</span><span>{money(order.shippingFee)}</span></div>
          {order.depositTotal > 0 && <div className="summary-row"><span className="muted">Tiền cọc</span><span>{money(order.depositTotal)}</span></div>}
          <div className="summary-row total"><span>Tổng thanh toán</span><span>{money(order.total)}</span></div>
          <div className="summary-row"><span className="muted">Đã thu ròng</span><span className="strong">{money(paid)}</span></div>
        </div>

        {payments.length > 0 && (
          <section>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Thu chi của đơn</h3>
            <div className="card table-wrap">
              <table className="table">
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{PAYMENT_TYPE_LABEL[p.type]}<div className="muted small">{p.note}</div></td>
                      <td className="muted small">{PAYMENT_METHOD_LABEL[p.method]}</td>
                      <td className="muted small nowrap">{dateTime(p.createdAt)}</td>
                      <td className={`num ${p.amount < 0 ? 'danger-text' : 'success-text'}`}>{p.amount > 0 ? '+' : ''}{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {requests.length > 0 && (
          <section>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Yêu cầu của khách</h3>
            {requests.map((r) => (
              <div key={r.id} className="row-between card card-pad" style={{ marginBottom: 8 }}>
                <div><strong>{REQUEST_TYPE_LABEL[r.type]}</strong>{r.extendDays && ` ${r.extendDays} ngày`} — {r.reason}</div>
                <Link to="/admin/yeu-cau"><StatusBadge value={REQUEST_STATUS_LABEL[r.status]} /></Link>
              </div>
            ))}
          </section>
        )}

        <section>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Lịch sử xử lý</h3>
          <ul className="timeline">
            {[...order.timeline].reverse().map((t, i) => (
              <li key={i}>
                <strong>{STATUS_LABEL[t.status as OrderStatus]?.[0] ?? t.status}</strong>
                <span className="muted small"> · {dateTime(t.at)}{t.by && ` · ${nameOf(t.by)}`}</span>
                {t.note && <div className="small">{t.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {dialog?.kind === 'step' && <StepDialog order={order} next={dialog.next} onClose={() => setDialog(undefined)} />}
      {dialog?.kind === 'payment' && <PaymentDialog order={order} onClose={() => setDialog(undefined)} />}
      {dialog?.kind === 'request' && <RequestDialog order={order} types={eligible} onClose={() => setDialog(undefined)} />}
    </Drawer>
  )
}

function StepDialog({ order, next, onClose }: { order: Order; next: OrderStatus; onClose: () => void }) {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const [note, setNote] = useState('')
  const [condition, setCondition] = useState(next === 'renting' ? 'Nguyên vẹn, đã giặt ủi' : 'Nguyên vẹn')
  const [damageFee, setDamageFee] = useState(0)
  const [returnDate, setReturnDate] = useState(today())
  const [carrier, setCarrier] = useState('Giao Hàng Nhanh')
  const [trackingCode, setTrackingCode] = useState('')
  const late = useMemo(() => (next === 'returned' ? lateFeeFor(db, order, returnDate) : undefined), [db, order, next, returnDate])
  const fees = (order.rental?.lateFee ?? 0) + (order.rental?.damageFee ?? 0)

  const submit = async () => {
    // Tình trạng đồ chỉ ghi nhận ở bước giao và nhận lại đồ thuê.
    const withCondition = next === 'renting' || next === 'returned'
    const ok = await run(() => advanceOrder(user.id, order.id, next, { note, condition: withCondition ? condition : undefined, damageFee, returnDate, carrier, trackingCode }), `Đã cập nhật đơn ${order.code}`)
    if (ok) onClose()
  }

  return (
    <Modal
      title={ACTION_LABEL[next]}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className={`btn ${next === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} onClick={() => void submit()}>{ACTION_LABEL[next]}</button></>}
    >
      <div className="stack">
        {next === 'cancelled' && <p>Đơn sẽ bị hủy, hàng được hoàn về kho và khoản đã thu (nếu có) sẽ được ghi hoàn tiền cho khách.</p>}
        {next === 'shipping' && (
          <>
            <p>Xác nhận đã bàn giao đơn cho đơn vị vận chuyển. Khách sẽ nhận được thông báo kèm mã vận đơn.</p>
            <div className="grid-2">
              <Field label="Đơn vị vận chuyển">
                <select className="select" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  <option>Giao Hàng Nhanh</option><option>Giao Hàng Tiết Kiệm</option><option>Viettel Post</option><option>J&T Express</option><option>Nhân viên cửa hàng</option>
                </select>
              </Field>
              <Field label="Mã vận đơn"><input className="input" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value.toUpperCase())} placeholder="Không bắt buộc" /></Field>
            </div>
          </>
        )}
        {next === 'completed' && order.type === 'sale' && <p>Xác nhận khách đã nhận hàng{order.paymentMethod === 'cod' ? ` và đã thu ${money(order.total)} tiền mặt` : ''}.</p>}
        {next === 'renting' && (
          <>
            <p>Kiểm tra tình trạng đồ trước khi giao.{order.paymentMethod === 'cod' && ` Thu của khách ${money(order.total)} (gồm cọc ${money(order.depositTotal)}).`}</p>
            <Field label="Tình trạng khi giao"><textarea className="textarea" value={condition} onChange={(e) => setCondition(e.target.value)} /></Field>
          </>
        )}
        {next === 'returned' && (
          <>
            <div className="grid-2">
              <Field label="Ngày nhận lại"><input className="input" type="date" value={returnDate} max={today()} onChange={(e) => setReturnDate(e.target.value)} /></Field>
              <Field label="Phí bồi thường (nếu hư hỏng)"><input className="input" type="number" min={0} step={10000} value={damageFee} onChange={(e) => setDamageFee(Number(e.target.value))} /></Field>
            </div>
            <Field label="Tình trạng khi nhận lại"><textarea className="textarea" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Ví dụ: rách nhẹ phần tà, mất 1 khuy…" /></Field>
            <div className="form-note">
              Hạn trả {date(order.rental!.endDate)} — {late!.days ? <>trễ <strong>{late!.days} ngày</strong>, phí trễ <strong>{money(late!.fee)}</strong></> : 'trả đúng hạn, không phí trễ'}.
              {' '}Tiền cọc dự kiến hoàn: <strong>{money(Math.max(0, order.depositTotal - late!.fee - damageFee))}</strong>.
            </div>
          </>
        )}
        {next === 'completed' && order.type === 'rental' && (
          <div className="form-note">
            Hoàn cọc cho khách: {money(order.depositTotal)} − phí {money(fees)} = <strong>{money(Math.max(0, order.depositTotal - fees))}</strong>.
          </div>
        )}
        <Field label={next === 'cancelled' ? 'Lý do hủy' : 'Ghi chú (không bắt buộc)'}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function PaymentDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const user = useAdminUser()!
  const run = useAction()
  const [type, setType] = useState<PaymentType>(order.type)
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const outgoing = type === 'refund' || type === 'deposit_refund'
  const submit = async () => {
    const ok = await run(() => recordPayment(user.id, order.id, type, outgoing ? -Math.abs(amount) : Math.abs(amount), method, note), 'Đã ghi nhận')
    if (ok) onClose()
  }
  return (
    <Modal title="Ghi nhận thu / chi" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" onClick={() => void submit()}>Lưu</button></>}>
      <div className="stack">
        <div className="grid-2">
          <Field label="Khoản">
            <select className="select" value={type} onChange={(e) => setType(e.target.value as PaymentType)}>
              {(Object.keys(PAYMENT_TYPE_LABEL) as PaymentType[]).map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Số tiền" hint={outgoing ? 'Khoản chi trả lại khách' : 'Khoản thu của khách'}>
            <input className="input" type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Hình thức">
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
          </select>
        </Field>
        <Field label="Ghi chú"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Badge tone="info" plain>Thu chi được tính vào báo cáo doanh thu theo ngày ghi nhận.</Badge>
      </div>
    </Modal>
  )
}
