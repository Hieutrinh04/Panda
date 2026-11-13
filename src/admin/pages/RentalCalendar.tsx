import { Fragment, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Order } from '../../types'
import { useDb } from '../../data/store'
import { canRent, productVariants } from '../../services/catalog'
import { isOverdue } from '../../services/orders'
import { addDays, daysBetween, matches, today } from '../../lib/format'
import { Empty, SearchBox } from '../../components/ui'
import { OrderDrawer } from './Orders'

const SPAN = 21

export function RentalCalendar() {
  const db = useDb()
  const [start, setStart] = useState(addDays(today(), -3))
  const [query, setQuery] = useState('')
  const [onlyBooked, setOnlyBooked] = useState(true)
  const [openId, setOpenId] = useState<string>()
  const days = Array.from({ length: SPAN }, (_, i) => addDays(start, i))
  const end = days.at(-1)!
  const t = today()

  const active = db.orders.filter((o) => o.type === 'rental' && ['pending', 'confirmed', 'renting'].includes(o.status))
  const rows = db.products
    .filter((p) => canRent(p) && p.status === 'active' && matches(query, p.name))
    .flatMap((p) => productVariants(db, p.id).map((v) => ({ product: p, variant: v })))
    .map((row) => {
      const bookings = active
        .filter((o) => o.items.some((i) => i.variantId === row.variant.id))
        .map((o) => ({ order: o, from: o.rental!.startDate, to: isOverdue(o) ? t : o.rental!.endDate }))
        .filter((b) => b.from <= end && b.to >= start)
        .sort((a, b) => a.from.localeCompare(b.from))
      // Xếp các lượt thuê chồng nhau vào nhiều làn.
      const lanes: (typeof bookings)[] = []
      for (const b of bookings) {
        const lane = lanes.find((l) => l.at(-1)!.to < b.from)
        if (lane) lane.push(b)
        else lanes.push([b])
      }
      return { ...row, lanes }
    })
    .filter((r) => !onlyBooked || r.lanes.length)

  const opened = db.orders.find((o) => o.id === openId)
  const cls = (o: Order) => (isOverdue(o) ? 'overdue' : o.status)

  return (
    <>
      <div className="page-head">
        <div><h2>Lịch thuê</h2><p>Theo dõi đồ đã được đặt thuê, đang ở chỗ khách và quá hạn theo từng biến thể.</p></div>
      </div>
      <section className="card">
        <div className="toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Tìm sản phẩm…" />
          <label className="checkbox"><input type="checkbox" checked={onlyBooked} onChange={(e) => setOnlyBooked(e.target.checked)} /> Chỉ hiện mẫu có lịch</label>
          <div className="grow" />
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Tuần trước"><ChevronLeft /></button>
          <button className="btn btn-sm" onClick={() => setStart(addDays(today(), -3))}>Hôm nay</button>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Tuần sau"><ChevronRight /></button>
        </div>
        <div className="toolbar legend" style={{ borderBottom: 0 }}>
          <span><i style={{ background: 'var(--warning-soft)' }} />Chờ xác nhận</span>
          <span><i style={{ background: 'var(--info-soft)' }} />Đã xác nhận</span>
          <span><i style={{ background: 'var(--accent-soft)' }} />Đang thuê</span>
          <span><i style={{ background: 'var(--danger-soft)' }} />Quá hạn</span>
        </div>
        <div className="calendar">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: 12, left: 0, zIndex: 2 }}>Sản phẩm / biến thể</th>
                {days.map((d) => (
                  <th key={d} className={d === t ? 'today' : ''}>
                    {d.slice(8)}<br /><span style={{ fontWeight: 400 }}>{new Date(`${d}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'narrow' })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, variant, lanes }) => (
                <Fragment key={variant.id}>
                  {(lanes.length ? lanes : [[]]).map((lane, li) => (
                    <tr key={li}>
                      {li === 0 && (
                        <td className="name" rowSpan={Math.max(1, lanes.length)}>
                          <strong>{product.name}</strong>
                          <div className="muted small">{variant.size} / {variant.color} · có {variant.stock}</div>
                        </td>
                      )}
                      {days.map((d) => {
                        const booking = lane.find((b) => (b.from < start ? start : b.from) === d)
                        if (!booking) return <td key={d} className="cell" />
                        const span = daysBetween(d, booking.to < end ? booking.to : end) + 1
                        return (
                          <td key={d} className="cell">
                            <div
                              className={`booking ${cls(booking.order)}`}
                              style={{ width: `calc(${span * 100}% + ${span - 1}px - 2px)`, zIndex: 1 }}
                              title={`${booking.order.code} · ${booking.order.customerName}`}
                              onClick={() => setOpenId(booking.order.id)}
                            >
                              {booking.order.code} · {booking.order.customerName}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty title="Không có lịch thuê trong khoảng này" />}
        </div>
      </section>
      {opened && <OrderDrawer order={opened} onClose={() => setOpenId(undefined)} />}
    </>
  )
}
