import { useState } from 'react'
import { Download } from 'lucide-react'
import { useDb } from '../../data/store'
import { inventorySummary, reportSummary, revenueSeries } from '../../services/reports'
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL } from '../../services/labels'
import { addDays, dateTime, downloadCsv, money, shortMoney, today } from '../../lib/format'
import { BarChart, Chips, Empty, Field } from '../../components/ui'

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom'

export function Reports() {
  const db = useDb()
  const t = today()
  const [preset, setPreset] = useState<Preset>('30d')
  const [custom, setCustom] = useState({ from: addDays(t, -6), to: t })
  const [from, to] =
    preset === 'today' ? [t, t] : preset === '7d' ? [addDays(t, -6), t] : preset === '30d' ? [addDays(t, -29), t] : preset === 'month' ? [`${t.slice(0, 8)}01`, t] : [custom.from, custom.to]
  const r = reportSummary(db, from, to)
  const series = revenueSeries(db, from, to)
  const inv = inventorySummary(db)

  const exportCsv = () =>
    downloadCsv(`bao-cao-${from}-${to}.csv`, [
      ['Thời gian', 'Mã đơn', 'Khách hàng', 'Khoản', 'Hình thức', 'Số tiền', 'Ghi chú'],
      ...r.payments.map((p) => {
        const o = db.orders.find((x) => x.id === p.orderId)
        return [dateTime(p.createdAt), o?.code ?? '', o?.customerName ?? '', PAYMENT_TYPE_LABEL[p.type], PAYMENT_METHOD_LABEL[p.method], p.amount, p.note ?? '']
      }),
    ])

  return (
    <>
      <div className="page-head">
        <div><h2>Báo cáo & thống kê</h2><p>Doanh thu, đơn hàng, khách hàng, tiền cọc, phí phát sinh và tồn kho.</p></div>
        <button className="btn" onClick={exportCsv}><Download /> Xuất CSV</button>
      </div>
      <div className="row">
        <Chips value={preset} onChange={setPreset} items={[{ value: 'today', label: 'Hôm nay' }, { value: '7d', label: '7 ngày' }, { value: '30d', label: '30 ngày' }, { value: 'month', label: 'Tháng này' }, { value: 'custom', label: 'Tùy chọn' }]} />
        {preset === 'custom' && (
          <div className="row">
            <Field label="Từ"><input className="input input-sm" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
            <Field label="Đến"><input className="input input-sm" type="date" value={custom.to} min={custom.from} max={t} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
          </div>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Doanh thu thuần</div><div className="stat-value">{money(r.revenue)}</div><div className="stat-sub">Đã trừ hoàn tiền {money(-r.refunds)}</div></div>
        <div className="stat"><div className="stat-label">Bán hàng</div><div className="stat-value">{money(r.saleRevenue)}</div><div className="stat-sub">{r.saleOrders} đơn mua</div></div>
        <div className="stat"><div className="stat-label">Cho thuê</div><div className="stat-value">{money(r.rentalRevenue)}</div><div className="stat-sub">{r.rentalOrders} đơn thuê</div></div>
        <div className="stat"><div className="stat-label">Phí phát sinh</div><div className="stat-value">{money(r.lateFees + r.damageFees)}</div><div className="stat-sub">Trễ {money(r.lateFees)} · bồi thường {money(r.damageFees)}</div></div>
        <div className="stat"><div className="stat-label">Tiền cọc</div><div className="stat-value">{money(r.depositHeld)}</div><div className="stat-sub">Đang giữ · thu {money(r.depositCollected)} / hoàn {money(r.depositRefunded)} trong kỳ</div></div>
        <div className="stat"><div className="stat-label">Khách hàng</div><div className="stat-value">{r.activeCustomers}</div><div className="stat-sub">mua/thuê · {r.newCustomers} khách mới</div></div>
      </div>

      <section className="card">
        <div className="card-head"><h3>Doanh thu theo ngày</h3><span className="muted small">{r.orderCount} đơn · {r.completed} hoàn tất · {r.cancelled} hủy</span></div>
        <div className="card-body">
          <BarChart
            data={series.map((d) => ({ label: `${d.day.slice(8)}/${d.day.slice(5, 7)}`, values: [d.sale, d.rental, d.fees] }))}
            series={[{ name: 'Bán', color: '#102a43' }, { name: 'Cho thuê', color: '#b46d5b' }, { name: 'Phí phát sinh', color: '#d9a441' }]}
            format={shortMoney}
          />
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Sản phẩm nổi bật</h3></div>
          {r.topProducts.length ? (
            <table className="table">
              <thead><tr><th>Sản phẩm</th><th>Loại</th><th className="num">SL</th><th className="num">Doanh thu</th></tr></thead>
              <tbody>{r.topProducts.map((p) => <tr key={p.name + p.type}><td>{p.name}</td><td>{p.type === 'sale' ? 'Mua' : 'Thuê'}</td><td className="num">{p.quantity}</td><td className="num">{money(p.revenue)}</td></tr>)}</tbody>
            </table>
          ) : <Empty />}
        </section>
        <section className="card">
          <div className="card-head"><h3>Tồn kho</h3><span className="muted small">{inv.units} sản phẩm · giá trị {money(inv.value)}</span></div>
          {inv.low.length ? (
            <table className="table">
              <thead><tr><th>Sắp hết hàng</th><th>SKU</th><th className="num">Tồn</th></tr></thead>
              <tbody>{inv.low.slice(0, 8).map(({ product, variant }) => <tr key={variant.id}><td>{product.name} · {variant.size}/{variant.color}</td><td className="muted">{variant.sku}</td><td className="num">{variant.stock}</td></tr>)}</tbody>
            </table>
          ) : <Empty title="Không có hàng sắp hết" />}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h3>Giao dịch trong kỳ</h3><span className="muted small">{r.payments.length} giao dịch</span></div>
        <div className="table-wrap" style={{ maxHeight: 420 }}>
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Đơn</th><th>Khoản</th><th>Hình thức</th><th className="num">Số tiền</th></tr></thead>
            <tbody>
              {r.payments.map((p) => (
                <tr key={p.id}>
                  <td className="muted nowrap">{dateTime(p.createdAt)}</td>
                  <td>{db.orders.find((o) => o.id === p.orderId)?.code}</td>
                  <td>{PAYMENT_TYPE_LABEL[p.type]}{p.note && <div className="muted small">{p.note}</div>}</td>
                  <td className="muted small">{PAYMENT_METHOD_LABEL[p.method]}</td>
                  <td className={`num ${p.amount < 0 ? 'danger-text' : ''}`}>{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.payments.length === 0 && <Empty title="Không có giao dịch" />}
        </div>
      </section>
    </>
  )
}
