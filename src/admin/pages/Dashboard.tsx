import { Link } from 'react-router-dom'
import { AlarmClock, Boxes, CircleDollarSign, ClipboardList, Repeat, Shirt } from 'lucide-react'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { displayStatus, isOverdue } from '../../services/orders'
import { inventorySummary, reportSummary, revenueSeries } from '../../services/reports'
import { TASK_STATUS_LABEL } from '../../services/labels'
import { addDays, date, dateTime, money, shortMoney, today } from '../../lib/format'
import { BarChart, Empty, StatusBadge, Badge } from '../../components/ui'

export function Dashboard() {
  const db = useDb()
  const user = useAdminUser()!
  const manager = user.role === 'manager'
  const t = today()
  const todayReport = reportSummary(db, t, t)
  const monthReport = reportSummary(db, `${t.slice(0, 8)}01`, t)
  const series = revenueSeries(db, addDays(t, -13), t)
  const pending = db.orders.filter((o) => o.status === 'pending')
  const renting = db.orders.filter((o) => o.status === 'renting')
  const overdue = renting.filter(isOverdue)
  const low = inventorySummary(db).low
  const requests = db.requests.filter((r) => ['pending', 'forwarded'].includes(r.status))
  const toDeliver = db.orders.filter((o) => o.type === 'rental' && o.status === 'confirmed' && o.rental!.startDate <= addDays(t, 1))
  const toReceive = renting.filter((o) => o.rental!.endDate <= addDays(t, 1))
  const myTasks = db.tasks.filter((x) => x.assigneeId === user.id && x.status !== 'done')

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Xin chào, {user.fullName.split(' ').at(-1)} 👋</h2>
          <p>Tình hình cửa hàng hôm nay, {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}.</p>
        </div>
        <Link to="/admin/ban-hang" className="btn btn-primary">Tạo đơn tại quầy</Link>
      </div>

      <div className="stat-grid">
        {manager && (
          <div className="stat">
            <div className="stat-label"><CircleDollarSign /> Doanh thu hôm nay</div>
            <div className="stat-value">{money(todayReport.revenue)}</div>
            <div className="stat-sub">Tháng này: {money(monthReport.revenue)}</div>
          </div>
        )}
        <Link to="/admin/don-mua?status=pending" className={`stat${pending.length ? ' warn' : ''}`}>
          <div className="stat-label"><ClipboardList /> Đơn chờ xác nhận</div>
          <div className="stat-value">{pending.length}</div>
          <div className="stat-sub">{pending.filter((o) => o.type === 'sale').length} mua · {pending.filter((o) => o.type === 'rental').length} thuê</div>
        </Link>
        <Link to="/admin/don-thue?status=renting" className="stat">
          <div className="stat-label"><Shirt /> Đồ đang cho thuê</div>
          <div className="stat-value">{renting.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0)}</div>
          <div className="stat-sub">{renting.length} đơn · cọc đang giữ {money(todayReport.depositHeld)}</div>
        </Link>
        <Link to="/admin/don-thue?status=overdue" className={`stat${overdue.length ? ' bad' : ''}`}>
          <div className="stat-label"><AlarmClock /> Quá hạn trả</div>
          <div className="stat-value">{overdue.length}</div>
          <div className="stat-sub">Cần liên hệ khách</div>
        </Link>
        <Link to="/admin/kho?filter=low" className={`stat${low.length ? ' warn' : ''}`}>
          <div className="stat-label"><Boxes /> Sắp hết hàng</div>
          <div className="stat-value">{low.length}</div>
          <div className="stat-sub">SKU tồn ≤ 2</div>
        </Link>
        <Link to="/admin/yeu-cau" className={`stat${requests.length ? ' warn' : ''}`}>
          <div className="stat-label"><Repeat /> Yêu cầu chờ xử lý</div>
          <div className="stat-value">{requests.length}</div>
          <div className="stat-sub">Hủy, đổi trả, gia hạn</div>
        </Link>
      </div>

      <div className="dash-grid">
        <div className="stack">
          {manager && (
            <section className="card">
              <div className="card-head">
                <h3>Doanh thu 14 ngày gần nhất</h3>
                <Link to="/admin/bao-cao" className="btn btn-sm">Xem báo cáo</Link>
              </div>
              <div className="card-body">
                <BarChart
                  data={series.map((d) => ({ label: d.day.slice(8) + '/' + d.day.slice(5, 7), values: [d.sale, d.rental, d.fees] }))}
                  series={[{ name: 'Bán', color: '#102a43' }, { name: 'Cho thuê', color: '#b46d5b' }, { name: 'Phí phát sinh', color: '#d9a441' }]}
                  format={shortMoney}
                />
              </div>
            </section>
          )}
          <section className="card">
            <div className="card-head">
              <h3>Đơn hàng mới nhất</h3>
              <Link to="/admin/don-mua" className="btn btn-sm">Tất cả đơn</Link>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Mã</th><th>Khách</th><th>Loại</th><th>Trạng thái</th><th className="num">Tổng</th><th>Thời gian</th></tr></thead>
                <tbody>
                  {db.orders.slice(0, 8).map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/admin/${o.type === 'sale' ? 'don-mua' : 'don-thue'}?id=${o.id}`} className="strong">{o.code}</Link></td>
                      <td>{o.customerName}</td>
                      <td>{o.type === 'sale' ? 'Mua' : 'Thuê'}{o.channel === 'store' && <span className="muted"> · quầy</span>}</td>
                      <td><StatusBadge value={displayStatus(o)} /></td>
                      <td className="num">{money(o.total)}</td>
                      <td className="muted nowrap">{dateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Lịch giao – nhận đồ thuê</h3><Link to="/admin/lich-thue" className="btn btn-sm">Lịch thuê</Link></div>
            {toDeliver.length + toReceive.length === 0 && <Empty title="Không có lịch giao nhận hôm nay" />}
            {[...overdue.filter((o) => !toReceive.includes(o)), ...toReceive, ...toDeliver].map((o) => {
              const deliver = o.status === 'confirmed'
              return (
                <Link key={o.id} to={`/admin/don-thue?id=${o.id}`} className="list-row">
                  <div className="grow">
                    <strong>{o.code}</strong> · {o.customerName}
                    <div className="muted small">{o.items.map((i) => i.name).join(', ')}</div>
                  </div>
                  <div className="right">
                    <Badge tone={deliver ? 'info' : isOverdue(o) ? 'danger' : 'accent'}>{deliver ? 'Giao đồ' : isOverdue(o) ? 'Quá hạn' : 'Nhận lại'}</Badge>
                    <div className="muted small">{date(deliver ? o.rental!.startDate : o.rental!.endDate)}</div>
                  </div>
                </Link>
              )
            })}
          </section>

          <section className="card">
            <div className="card-head"><h3>Việc của tôi</h3><Link to="/admin/cong-viec" className="btn btn-sm">Công việc</Link></div>
            {myTasks.length === 0 && <Empty title="Không có việc đang chờ" />}
            {myTasks.map((task) => (
              <div key={task.id} className="list-row">
                <div className="grow">
                  <strong>{task.title}</strong>
                  <div className="muted small">Hạn: {date(task.dueDate)}</div>
                </div>
                <Badge tone={TASK_STATUS_LABEL[task.status][1]}>{TASK_STATUS_LABEL[task.status][0]}</Badge>
              </div>
            ))}
          </section>

          {low.length > 0 && (
            <section className="card">
              <div className="card-head"><h3>Cảnh báo tồn kho</h3><Link to="/admin/kho?filter=low" className="btn btn-sm">Kho</Link></div>
              {low.slice(0, 5).map(({ variant, product }) => (
                <div key={variant.id} className="list-row">
                  <div className="grow"><strong>{product.name}</strong><div className="muted small">{variant.sku} · {variant.size}/{variant.color}</div></div>
                  <Badge tone={variant.stock === 0 ? 'danger' : 'warning'}>Còn {variant.stock}</Badge>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
