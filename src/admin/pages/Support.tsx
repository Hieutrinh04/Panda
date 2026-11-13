import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { TicketStatus } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { assignTicket, replyTicket } from '../../services/engagement'
import { TICKET_STATUS_LABEL, TICKET_TYPE_LABEL } from '../../services/labels'
import { dateTime } from '../../lib/format'
import { Badge, Empty, StatusBadge, Tabs } from '../../components/ui'
import { useAction } from '../../components/feedback'

export function Support() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const [tab, setTab] = useState<'active' | TicketStatus>('active')
  const [openId, setOpenId] = useState<string>()
  const [text, setText] = useState('')
  const list = db.tickets.filter((t) => (tab === 'active' ? t.status !== 'resolved' : t.status === tab))
  const ticket = db.tickets.find((t) => t.id === (openId ?? list[0]?.id))
  const ticketOrder = db.orders.find((o) => o.id === ticket?.orderId)
  const nameOf = (id?: string) => db.users.find((u) => u.id === id)?.fullName ?? '—'
  const staff = db.users.filter((u) => u.role !== 'customer' && u.isActive)

  const send = async (status?: TicketStatus) => {
    if (ticket && (await run(() => replyTicket(user.id, ticket.id, text, status), status === 'resolved' ? 'Đã đóng yêu cầu' : 'Đã gửi phản hồi'))) setText('')
  }

  return (
    <>
      <div className="page-head"><div><h2>Hỗ trợ khách hàng</h2><p>Góp ý, khiếu nại và yêu cầu hỗ trợ từ khách hàng.</p></div></div>
      <div className="dash-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)' }}>
        <section className="card">
          <Tabs value={tab} onChange={(v) => { setTab(v); setOpenId(undefined) }} items={[{ value: 'active', label: 'Đang mở', count: db.tickets.filter((t) => t.status !== 'resolved').length }, { value: 'resolved', label: 'Đã giải quyết' }]} />
          {list.map((t) => (
            <button key={t.id} className="list-row" style={{ width: '100%', border: 0, background: t.id === ticket?.id ? 'var(--soft)' : 'transparent', textAlign: 'left' }} onClick={() => setOpenId(t.id)}>
              <div className="grow">
                <strong>{t.subject}</strong>
                <div className="muted small">{nameOf(t.customerId)} · {TICKET_TYPE_LABEL[t.type]} · {dateTime(t.messages.at(-1)!.at)}</div>
              </div>
              <StatusBadge value={TICKET_STATUS_LABEL[t.status]} />
            </button>
          ))}
          {list.length === 0 && <Empty title="Không có yêu cầu" />}
        </section>
        {ticket ? (
          <section className="card">
            <div className="card-head">
              <div>
                <h3>{ticket.subject}</h3>
                <div className="muted small">
                  <Link to={`/admin/khach-hang?id=${ticket.customerId}`}>{nameOf(ticket.customerId)}</Link> · <Badge plain>{TICKET_TYPE_LABEL[ticket.type]}</Badge>
                  {ticketOrder && <> · đơn <Link to={`/admin/${ticketOrder.type === 'sale' ? 'don-mua' : 'don-thue'}?id=${ticketOrder.id}`}>{ticketOrder.code}</Link></>}
                </div>
              </div>
              <select className="select input-sm" style={{ width: 190 }} value={ticket.assignedTo ?? ''} onChange={(e) => void run(() => assignTicket(user.id, ticket.id, e.target.value || undefined), 'Đã phân công')}>
                <option value="">— Chưa phân công —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
            <div className="card-body thread">
              {ticket.messages.map((m, i) => (
                <div key={i} className={`msg${m.from === ticket.customerId ? '' : ' staff'}`}>
                  {m.text}
                  <small>{nameOf(m.from)} · {dateTime(m.at)}</small>
                </div>
              ))}
            </div>
            <div className="card-body stack" style={{ borderTop: '1px solid var(--line)' }}>
              <textarea className="textarea" placeholder="Nhập phản hồi cho khách…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                {ticket.status !== 'resolved' && <button className="btn" onClick={() => void send('resolved')}>Đánh dấu đã giải quyết</button>}
                <button className="btn btn-primary" disabled={!text.trim()} onClick={() => void send()}>Gửi phản hồi</button>
              </div>
            </div>
          </section>
        ) : <section className="card"><Empty title="Chọn một yêu cầu để xem" /></section>}
      </div>
    </>
  )
}
