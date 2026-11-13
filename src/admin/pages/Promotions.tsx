import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Coupon, StoreSettings, Tier } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { couponIsLive, deleteCoupon, saveCoupon, tierOf } from '../../services/promotions'
import { saveSettings } from '../../services/people'
import { addDays, date, money, today } from '../../lib/format'
import { Badge, Empty, Field, Modal, Tabs } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'

type Draft = Omit<Coupon, 'id' | 'used'> & { id?: string }

const newCoupon = (): Draft => ({
  code: '', description: '', kind: 'percent', value: 10, maxDiscount: 100000, minOrder: 0, appliesTo: 'all', startAt: today(), endAt: addDays(today(), 30), usageLimit: 100, active: true,
})

export function Promotions() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const { confirm } = useFeedback()
  const [tab, setTab] = useState<'coupons' | 'loyalty'>('coupons')
  const [editing, setEditing] = useState<Draft>()
  const [loyalty, setLoyalty] = useState<StoreSettings>(db.settings)
  const customers = db.users.filter((u) => u.role === 'customer')

  return (
    <>
      <div className="page-head">
        <div><h2>Khuyến mãi</h2><p>Mã giảm giá, điều kiện áp dụng, thời gian hiệu lực, điểm thưởng và hạng thành viên.</p></div>
        {tab === 'coupons' && <button className="btn btn-primary" onClick={() => setEditing(newCoupon())}><Plus /> Tạo mã giảm giá</button>}
      </div>
      <section className="card">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'coupons', label: 'Mã giảm giá', count: db.coupons.length }, { value: 'loyalty', label: 'Điểm thưởng & hạng thành viên' }]} />
        {tab === 'coupons' ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Mã</th><th>Ưu đãi</th><th>Điều kiện</th><th>Hiệu lực</th><th className="num">Đã dùng</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {db.coupons.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong><div className="muted small">{c.description}</div></td>
                    <td>{c.kind === 'percent' ? `${c.value}%` : money(c.value)}{c.maxDiscount ? <div className="muted small">tối đa {money(c.maxDiscount)}</div> : null}</td>
                    <td className="small">{c.appliesTo === 'all' ? 'Mọi đơn' : c.appliesTo === 'sale' ? 'Đơn mua' : 'Đơn thuê'} · từ {money(c.minOrder)}{c.minTier && <div className="muted">Hạng {c.minTier}+</div>}</td>
                    <td className="small nowrap">{date(c.startAt)} → {date(c.endAt)}</td>
                    <td className="num">{c.used}/{c.usageLimit}</td>
                    <td>{couponIsLive(c) ? <Badge tone="success">Đang chạy</Badge> : c.active && c.startAt > today() ? <Badge tone="info">Sắp chạy</Badge> : <Badge>Ngừng</Badge>}</td>
                    <td className="right nowrap">
                      <button className="icon-btn" onClick={() => setEditing(c)} aria-label="Sửa"><Pencil /></button>
                      <button className="icon-btn" aria-label="Xóa" onClick={async () => (await confirm({ title: 'Xóa mã?', message: `Xóa mã ${c.code}?`, danger: true })) && run(() => deleteCoupon(user.id, c.id), 'Đã xóa')}><Trash2 /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {db.coupons.length === 0 && <Empty />}
          </div>
        ) : (
          <div className="card-body stack">
            <div className="grid-2">
              <Field label="Số tiền chi tiêu để nhận 1 điểm"><input className="input" type="number" min={1000} step={1000} value={loyalty.pointsPerAmount} onChange={(e) => setLoyalty({ ...loyalty, pointsPerAmount: Number(e.target.value) })} /></Field>
              <Field label="Giá trị quy đổi của 1 điểm (đ)"><input className="input" type="number" min={0} step={10} value={loyalty.pointValue} onChange={(e) => setLoyalty({ ...loyalty, pointValue: Number(e.target.value) })} /></Field>
            </div>
            <h3 style={{ fontSize: 14 }}>Hạng thành viên theo tổng chi tiêu</h3>
            <table className="table">
              <thead><tr><th>Hạng</th><th>Chi tiêu tối thiểu</th><th className="num">Số khách</th></tr></thead>
              <tbody>
                {loyalty.tiers.map((t, i) => (
                  <tr key={t.name}>
                    <td><strong>{t.name}</strong></td>
                    <td><input className="input input-sm" style={{ maxWidth: 180 }} type="number" min={0} step={100000} disabled={i === 0} value={t.minSpent} onChange={(e) => setLoyalty({ ...loyalty, tiers: loyalty.tiers.map((x, j) => (j === i ? { ...x, minSpent: Number(e.target.value) } : x)) })} /></td>
                    <td className="num">{customers.filter((c) => tierOf(db, c.id) === t.name).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div><button className="btn btn-primary" onClick={() => void run(() => saveSettings(user.id, loyalty), 'Đã lưu cấu hình')}>Lưu cấu hình</button></div>
          </div>
        )}
      </section>
      {editing && (
        <Modal title={editing.id ? `Sửa mã ${editing.code}` : 'Tạo mã giảm giá'} onClose={() => setEditing(undefined)} footer={<><button className="btn" onClick={() => setEditing(undefined)}>Hủy</button><button className="btn btn-primary" onClick={() => void run(() => saveCoupon(user.id, editing), 'Đã lưu mã giảm giá').then((ok) => ok && setEditing(undefined))}>Lưu</button></>}>
          <div className="grid-2">
            <Field label="Mã"><input className="input" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="Giảm theo">
              <select className="select" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as Coupon['kind'] })}>
                <option value="percent">Phần trăm</option><option value="fixed">Số tiền</option>
              </select>
            </Field>
            <Field label="Mô tả" className="span-2"><input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label={editing.kind === 'percent' ? 'Phần trăm giảm' : 'Số tiền giảm'}><input className="input" type="number" min={0} value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} /></Field>
            <Field label="Giảm tối đa (đ)"><input className="input" type="number" min={0} disabled={editing.kind === 'fixed'} value={editing.maxDiscount ?? 0} onChange={(e) => setEditing({ ...editing, maxDiscount: Number(e.target.value) || undefined })} /></Field>
            <Field label="Áp dụng cho">
              <select className="select" value={editing.appliesTo} onChange={(e) => setEditing({ ...editing, appliesTo: e.target.value as Coupon['appliesTo'] })}>
                <option value="all">Mọi đơn</option><option value="sale">Đơn mua</option><option value="rental">Đơn thuê</option>
              </select>
            </Field>
            <Field label="Đơn tối thiểu (đ)"><input className="input" type="number" min={0} step={10000} value={editing.minOrder} onChange={(e) => setEditing({ ...editing, minOrder: Number(e.target.value) })} /></Field>
            <Field label="Hạng thành viên tối thiểu">
              <select className="select" value={editing.minTier ?? ''} onChange={(e) => setEditing({ ...editing, minTier: (e.target.value || undefined) as Tier | undefined })}>
                <option value="">Mọi khách</option>
                {db.settings.tiers.map((t) => <option key={t.name}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Số lượt tối đa"><input className="input" type="number" min={1} value={editing.usageLimit} onChange={(e) => setEditing({ ...editing, usageLimit: Number(e.target.value) })} /></Field>
            <Field label="Bắt đầu"><input className="input" type="date" value={editing.startAt} onChange={(e) => setEditing({ ...editing, startAt: e.target.value })} /></Field>
            <Field label="Kết thúc"><input className="input" type="date" value={editing.endAt} onChange={(e) => setEditing({ ...editing, endAt: e.target.value })} /></Field>
            <label className="checkbox span-2"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Kích hoạt (khách sẽ nhận thông báo khi tạo mã mới)</label>
          </div>
        </Modal>
      )}
    </>
  )
}
