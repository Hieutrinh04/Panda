import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownToLine, Check, X } from 'lucide-react'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { canRent, productImage, rentalAvailable } from '../../services/catalog'
import { createMovement, reviewMovement, type MovementInput } from '../../services/inventory'
import { inventorySummary } from '../../services/reports'
import { MOVEMENT_LABEL } from '../../services/labels'
import { dateTime, matches, money, today } from '../../lib/format'
import { Badge, Empty, Field, Modal, SearchBox, Tabs } from '../../components/ui'
import { useAction } from '../../components/feedback'

export function Inventory() {
  const db = useDb()
  const user = useAdminUser()!
  const manager = user.role === 'manager'
  const run = useAction()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'stock' | 'history' | 'pending'>('stock')
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(params.get('filter') === 'low')
  const [movement, setMovement] = useState<MovementInput>()
  const summary = inventorySummary(db)
  const pending = db.movements.filter((m) => m.status === 'pending')
  const t = today()
  // Số lượng đồ thuê đã giao và chưa trả, theo biến thể.
  const rentedOut = new Map<string, number>()
  db.orders.filter((o) => o.status === 'renting').flatMap((o) => o.items).forEach((i) => rentedOut.set(i.variantId, (rentedOut.get(i.variantId) ?? 0) + i.quantity))

  const rows = db.variants
    .map((v) => ({ v, p: db.products.find((p) => p.id === v.productId)! }))
    .filter(({ p }) => p)
    .filter(({ v, p }) => matches(query, p.name, v.sku, v.color, v.size))
    .filter(({ v }) => !lowOnly || v.stock <= 2)
    .sort((a, b) => a.v.stock - b.v.stock)
  const variantLabel = (id: string) => {
    const v = db.variants.find((x) => x.id === id)
    const p = v && db.products.find((x) => x.id === v.productId)
    return v && p ? `${p.name} · ${v.size}/${v.color}` : 'Đã xóa'
  }
  const nameOf = (id?: string) => db.users.find((u) => u.id === id)?.fullName ?? '—'

  return (
    <>
      <div className="page-head">
        <div><h2>Kho hàng</h2><p>Tồn kho theo biến thể, lịch sử nhập – xuất – điều chỉnh.</p></div>
        <button className="btn btn-primary" onClick={() => setMovement({ variantId: db.variants[0].id, type: manager ? 'import' : 'adjust', quantity: 1, note: '' })}>
          <ArrowDownToLine /> {manager ? 'Nhập / xuất / điều chỉnh' : 'Đề xuất điều chỉnh'}
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Tổng số lượng</div><div className="stat-value">{summary.units}</div><div className="stat-sub">{summary.skuCount} SKU</div></div>
        {manager && <div className="stat"><div className="stat-label">Giá trị tồn (giá bán/cọc)</div><div className="stat-value">{money(summary.value)}</div></div>}
        <div className={`stat${summary.low.length ? ' warn' : ''}`}><div className="stat-label">SKU sắp hết (≤ 2)</div><div className="stat-value">{summary.low.length}</div></div>
        <div className={`stat${pending.length ? ' warn' : ''}`}><div className="stat-label">Điều chỉnh chờ duyệt</div><div className="stat-value">{pending.length}</div></div>
      </div>
      <section className="card">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'stock', label: 'Tồn kho' }, { value: 'history', label: 'Lịch sử kho' }, { value: 'pending', label: 'Chờ duyệt', count: pending.length }]} />
        {tab === 'stock' && (
          <>
            <div className="toolbar">
              <SearchBox value={query} onChange={setQuery} placeholder="Sản phẩm, SKU, màu, size…" />
              <label className="checkbox"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Chỉ hàng sắp hết</label>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Sản phẩm</th><th>SKU</th><th>Size / Màu</th><th className="num">Tồn kho</th><th className="num">Đang ở chỗ khách</th><th className="num">Rảnh cho thuê hôm nay</th><th /></tr></thead>
                <tbody>
                  {rows.map(({ v, p }) => (
                    <tr key={v.id}>
                      <td><div className="cell-product"><img className="thumb" src={productImage(db, p, v.color)} alt="" /><strong>{p.name}</strong></div></td>
                      <td className="muted">{v.sku}</td>
                      <td>{v.size} / {v.color}</td>
                      <td className="num">{v.stock <= 2 ? <Badge tone={v.stock ? 'warning' : 'danger'}>{v.stock}</Badge> : v.stock}</td>
                      <td className="num">{canRent(p) ? rentedOut.get(v.id) ?? 0 : '—'}</td>
                      <td className="num">{canRent(p) ? rentalAvailable(db, v.id, t, t) : '—'}</td>
                      <td className="right">
                        <button className="btn btn-sm" onClick={() => setMovement({ variantId: v.id, type: manager ? 'import' : 'adjust', quantity: 1, note: '' })}>{manager ? 'Nhập/xuất' : 'Điều chỉnh'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <Empty title="Không có biến thể phù hợp" />}
            </div>
          </>
        )}
        {tab !== 'stock' && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Thời gian</th><th>Loại</th><th>Biến thể</th><th className="num">Số lượng</th><th>Ghi chú</th><th>Người tạo</th><th>{tab === 'pending' ? '' : 'Trạng thái'}</th></tr></thead>
              <tbody>
                {(tab === 'pending' ? pending : db.movements).slice(0, 200).map((m) => (
                  <tr key={m.id}>
                    <td className="muted nowrap">{dateTime(m.createdAt)}</td>
                    <td>{MOVEMENT_LABEL[m.type]}</td>
                    <td>{variantLabel(m.variantId)}</td>
                    <td className={`num ${m.quantity < 0 ? 'danger-text' : m.quantity > 0 ? 'success-text' : ''}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                    <td className="muted">{m.note}</td>
                    <td>{nameOf(m.userId)}</td>
                    <td className="nowrap">
                      {m.status === 'pending' && manager ? (
                        <>
                          <button className="btn btn-sm btn-success" onClick={() => void run(() => reviewMovement(user.id, m.id, true), 'Đã duyệt')}><Check /> Duyệt</button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => void run(() => reviewMovement(user.id, m.id, false), 'Đã từ chối')}><X /></button>
                        </>
                      ) : (
                        <Badge tone={m.status === 'approved' ? 'success' : m.status === 'pending' ? 'warning' : 'danger'}>{m.status === 'approved' ? 'Đã áp dụng' : m.status === 'pending' ? 'Chờ duyệt' : 'Từ chối'}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(tab === 'pending' ? pending : db.movements).length === 0 && <Empty />}
          </div>
        )}
      </section>
      {movement && (
        <Modal
          title={manager ? 'Phiếu kho' : 'Đề xuất điều chỉnh kho'}
          onClose={() => setMovement(undefined)}
          footer={<><button className="btn" onClick={() => setMovement(undefined)}>Hủy</button><button className="btn btn-primary" onClick={() => void run(() => createMovement(user.id, user.role, movement), manager || movement.type !== 'adjust' ? 'Đã cập nhật kho' : 'Đã gửi quản lý duyệt').then((ok) => ok && setMovement(undefined))}>Lưu phiếu</button></>}
        >
          <div className="stack">
            {manager && (
              <Field label="Loại phiếu">
                <select className="select" value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value as MovementInput['type'] })}>
                  <option value="import">Nhập kho</option>
                  <option value="export">Xuất kho (hàng lỗi, trả NCC…)</option>
                  <option value="adjust">Điều chỉnh sau kiểm kê</option>
                </select>
              </Field>
            )}
            <Field label="Biến thể">
              <select className="select" value={movement.variantId} onChange={(e) => setMovement({ ...movement, variantId: e.target.value })}>
                {db.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v.id)} — {v.sku} (tồn {v.stock})</option>)}
              </select>
            </Field>
            <Field label="Số lượng" hint={movement.type === 'adjust' ? 'Nhập số âm để giảm, số dương để tăng.' : undefined}>
              <input className="input" type="number" value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: Math.trunc(Number(e.target.value)) })} />
            </Field>
            <Field label={movement.type === 'adjust' ? 'Lý do điều chỉnh' : 'Ghi chú'}><input className="input" value={movement.note} onChange={(e) => setMovement({ ...movement, note: e.target.value })} /></Field>
            {!manager && <p className="muted small">Điều chỉnh kho cần quản lý phê duyệt trước khi áp dụng.</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
