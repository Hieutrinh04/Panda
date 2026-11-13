import { useState } from 'react'
import { Lock, LockOpen, Pencil, Plus } from 'lucide-react'
import type { User } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { toggleUserActive } from '../../services/people'
import { ROLE_LABEL } from '../../services/labels'
import { date, matches } from '../../lib/format'
import { Avatar, Badge, Empty, SearchBox } from '../../components/ui'
import { useAction } from '../../components/feedback'
import { PersonForm } from './Customers'

export function Staff() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<User | 'new'>()
  const staff = db.users.filter((u) => u.role !== 'customer' && matches(query, u.fullName, u.username, u.phone))

  return (
    <>
      <div className="page-head">
        <div><h2>Nhân viên</h2><p>Tài khoản, phân quyền và phân công công việc.</p></div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> Thêm nhân viên</button>
      </div>
      <section className="card">
        <div className="toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Tên, tài khoản, SĐT…" /></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nhân viên</th><th>Tài khoản</th><th>Vai trò</th><th>Phân công</th><th className="num">Đơn phụ trách</th><th className="num">Việc đang làm</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td><div className="row"><Avatar name={s.fullName} src={s.avatar} /><div><strong>{s.fullName}</strong><div className="muted small">{s.phone} · từ {date(s.createdAt)}</div></div></div></td>
                  <td>{s.username}<div className="muted small">{s.email}</div></td>
                  <td><Badge tone={s.role === 'manager' ? 'accent' : 'info'} plain>{ROLE_LABEL[s.role]}</Badge></td>
                  <td>{s.position ?? '—'}</td>
                  <td className="num">{db.orders.filter((o) => o.assignedTo === s.id && !['completed', 'cancelled'].includes(o.status)).length}</td>
                  <td className="num">{db.tasks.filter((t) => t.assigneeId === s.id && t.status !== 'done').length}</td>
                  <td>{s.isActive ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="danger">Đã khóa</Badge>}</td>
                  <td className="right nowrap">
                    <button className="icon-btn" onClick={() => setEditing(s)} aria-label="Sửa"><Pencil /></button>
                    {s.id !== user.id && (
                      <button className="icon-btn" onClick={() => void run(() => toggleUserActive(user.id, s.id), s.isActive ? 'Đã khóa tài khoản' : 'Đã mở khóa')} aria-label={s.isActive ? 'Khóa' : 'Mở khóa'}>
                        {s.isActive ? <Lock /> : <LockOpen />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {staff.length === 0 && <Empty />}
        </div>
      </section>
      <section className="card card-pad">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Phân quyền theo vai trò</h3>
        <div className="grid-2 small">
          <div><strong>Quản lý</strong><p className="muted">Toàn quyền: sản phẩm, giá, kho, nhân viên, khuyến mãi, nội dung website, đánh giá, báo cáo, nhật ký; phê duyệt hủy đơn, đổi trả, hoàn tiền, gia hạn, điều chỉnh kho.</p></div>
          <div><strong>Nhân viên</strong><p className="muted">Tra cứu khách hàng, sản phẩm, tồn kho, lịch thuê; tạo đơn tại quầy; xử lý giao nhận, cập nhật trạng thái; ghi nhận thanh toán; tiếp nhận yêu cầu và chuyển quản lý; hỗ trợ khách; công việc được giao.</p></div>
        </div>
      </section>
      {editing && <PersonForm person={editing === 'new' ? undefined : editing} role="staff" onClose={() => setEditing(undefined)} />}
    </>
  )
}
