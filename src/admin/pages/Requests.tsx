import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { OrderRequest, RequestStatus } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { forwardRequest, paidAmount, resolveRequest } from '../../services/orders'
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '../../services/labels'
import { dateTime, money } from '../../lib/format'
import { Empty, Field, Modal, StatusBadge, Tabs } from '../../components/ui'
import { useAction } from '../../components/feedback'

export function Requests() {
  const db = useDb()
  const user = useAdminUser()!
  const [tab, setTab] = useState<'open' | RequestStatus>('open')
  const [handling, setHandling] = useState<OrderRequest>()
  const list = db.requests.filter((r) => (tab === 'open' ? ['pending', 'forwarded'].includes(r.status) : r.status === tab))
  const nameOf = (id?: string) => db.users.find((u) => u.id === id)?.fullName ?? '—'

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Hủy đơn · đổi trả · hoàn tiền · gia hạn</h2>
          <p>{user.role === 'manager' ? 'Phê duyệt yêu cầu của khách hàng.' : 'Tiếp nhận yêu cầu của khách và chuyển quản lý phê duyệt.'}</p>
        </div>
      </div>
      <section className="card">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: 'Đang chờ', count: db.requests.filter((r) => ['pending', 'forwarded'].includes(r.status)).length },
            { value: 'approved', label: 'Đã chấp thuận' },
            { value: 'rejected', label: 'Đã từ chối' },
          ]}
        />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Loại</th><th>Đơn</th><th>Khách hàng</th><th>Lý do</th><th>Trạng thái</th><th>Cập nhật</th><th /></tr></thead>
            <tbody>
              {list.map((r) => {
                const order = db.orders.find((o) => o.id === r.orderId)
                const canHandle = r.status === 'pending' || (r.status === 'forwarded' && user.role === 'manager')
                return (
                  <tr key={r.id}>
                    <td><strong>{REQUEST_TYPE_LABEL[r.type]}</strong>{r.extendDays && <div className="muted small">+{r.extendDays} ngày</div>}</td>
                    <td>{order && <Link to={`/admin/${order.type === 'sale' ? 'don-mua' : 'don-thue'}?id=${order.id}`}>{order.code}</Link>}</td>
                    <td>{order?.customerName}</td>
                    <td style={{ minWidth: 220, maxWidth: 320 }}>{r.reason}{r.staffNote && <div className="muted small">NV: {r.staffNote}</div>}</td>
                    <td><StatusBadge value={REQUEST_STATUS_LABEL[r.status]} />{r.handledBy && <div className="muted small">{nameOf(r.handledBy)}</div>}</td>
                    <td className="muted small nowrap">{dateTime(r.updatedAt)}</td>
                    <td>{canHandle && <button className="btn btn-sm btn-primary" onClick={() => setHandling(r)}>Xử lý</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty title="Không có yêu cầu" />}
        </div>
      </section>
      {handling && <HandleRequest request={handling} onClose={() => setHandling(undefined)} />}
    </>
  )
}

function HandleRequest({ request, onClose }: { request: OrderRequest; onClose: () => void }) {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const order = db.orders.find((o) => o.id === request.orderId)!
  const paid = paidAmount(db, order.id)
  const [note, setNote] = useState('')
  const [refund, setRefund] = useState(request.type === 'return' ? Math.min(order.subtotal - order.discount, paid) : request.refundAmount ?? paid)
  const manager = user.role === 'manager'
  const done = (ok: boolean) => ok && onClose()

  return (
    <Modal
      title={`Yêu cầu ${REQUEST_TYPE_LABEL[request.type].toLowerCase()} · ${order.code}`}
      onClose={onClose}
      footer={
        manager ? (
          <>
            <button className="btn btn-danger" onClick={() => void run(() => resolveRequest(user.id, request.id, false, note), 'Đã từ chối yêu cầu').then(done)}>Từ chối</button>
            <button className="btn btn-success" onClick={() => void run(() => resolveRequest(user.id, request.id, true, note, refund), 'Đã chấp thuận yêu cầu').then(done)}>Chấp thuận</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => void run(() => forwardRequest(user.id, request.id, note), 'Đã chuyển quản lý duyệt').then(done)}>Chuyển quản lý duyệt</button>
        )
      }
    >
      <div className="stack">
        <dl className="kv">
          <dt>Khách hàng</dt><dd>{order.customerName} · {order.phone}</dd>
          <dt>Đơn</dt><dd>{order.items.map((i) => `${i.name} (${i.size}/${i.color}) ×${i.quantity}`).join(', ')}</dd>
          <dt>Tổng đơn / đã thu</dt><dd>{money(order.total)} / {money(paid)}</dd>
          <dt>Lý do của khách</dt><dd>{request.reason}</dd>
          {request.extendDays && <><dt>Gia hạn</dt><dd>{request.extendDays} ngày, hạn trả mới sẽ lùi từ {order.rental?.endDate}</dd></>}
          {request.staffNote && <><dt>Ghi chú NV</dt><dd>{request.staffNote}</dd></>}
        </dl>
        {manager && (request.type === 'return' || request.type === 'refund') && (
          <Field label="Số tiền hoàn cho khách" hint={`Tối đa ${money(paid)}`}>
            <input className="input" type="number" min={0} max={paid} step={1000} value={refund} onChange={(e) => setRefund(Number(e.target.value))} />
          </Field>
        )}
        {request.type === 'cancel' && <p className="muted small">Khi chấp thuận, đơn bị hủy, hàng về kho và tiền đã thu được hoàn lại.</p>}
        {request.type === 'extend' && <p className="muted small">Khi chấp thuận, hệ thống kiểm tra lịch thuê, cộng thêm tiền thuê các ngày gia hạn.</p>}
        <Field label={manager ? 'Phản hồi cho khách' : 'Ghi chú cho quản lý'}><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
