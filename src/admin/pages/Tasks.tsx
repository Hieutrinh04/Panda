import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Task } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { deleteTask, saveTask, setTaskStatus } from '../../services/people'
import { TASK_STATUS_LABEL } from '../../services/labels'
import { date, today } from '../../lib/format'
import { Avatar, Field, Modal } from '../../components/ui'
import { useAction } from '../../components/feedback'

type Draft = Omit<Task, 'id' | 'createdAt' | 'createdBy'> & { id?: string }

export function Tasks() {
  const db = useDb()
  const user = useAdminUser()!
  const manager = user.role === 'manager'
  const run = useAction()
  const [editing, setEditing] = useState<Draft>()
  const [mine, setMine] = useState(!manager)
  const staff = db.users.filter((u) => u.role !== 'customer' && u.isActive)
  const tasks = db.tasks.filter((t) => !mine || t.assigneeId === user.id)
  const nameOf = (id: string) => db.users.find((u) => u.id === id)?.fullName ?? '—'

  return (
    <>
      <div className="page-head">
        <div><h2>Công việc</h2><p>{manager ? 'Phân công và theo dõi công việc của nhân viên.' : 'Công việc được quản lý giao cho bạn.'}</p></div>
        <div className="row">
          {manager && <label className="checkbox"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Chỉ việc của tôi</label>}
          {manager && <button className="btn btn-primary" onClick={() => setEditing({ title: '', description: '', assigneeId: staff.find((s) => s.role === 'staff')?.id ?? user.id, dueDate: today(), status: 'todo' })}><Plus /> Giao việc</button>}
        </div>
      </div>
      <div className="kanban">
        {(['todo', 'doing', 'done'] as const).map((status) => {
          const list = tasks.filter((t) => t.status === status)
          return (
            <div key={status} className="kanban-col">
              <h3>{TASK_STATUS_LABEL[status][0]}<span className="muted">{list.length}</span></h3>
              {list.map((t) => (
                <div key={t.id} className="task-card stack-sm">
                  <div className="row-between">
                    <strong>{t.title}</strong>
                    {manager && (
                      <span className="nowrap">
                        <button className="icon-btn" onClick={() => setEditing(t)} aria-label="Sửa"><Pencil /></button>
                        <button className="icon-btn" onClick={() => void run(() => deleteTask(user.id, t.id), 'Đã xóa')} aria-label="Xóa"><Trash2 /></button>
                      </span>
                    )}
                  </div>
                  {t.description && <p className="muted small">{t.description}</p>}
                  <div className="row small">
                    <Avatar name={nameOf(t.assigneeId)} /> {nameOf(t.assigneeId)}
                    <span className={`grow right ${t.dueDate && t.dueDate < today() && status !== 'done' ? 'danger-text' : 'muted'}`}>Hạn {date(t.dueDate)}</span>
                  </div>
                  {(t.assigneeId === user.id || manager) && (
                    <select className="select input-sm" value={t.status} onChange={(e) => void run(() => setTaskStatus(user.id, t.id, e.target.value as Task['status']))}>
                      <option value="todo">Cần làm</option><option value="doing">Đang làm</option><option value="done">Hoàn thành</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {editing && (
        <Modal title={editing.id ? 'Sửa công việc' : 'Giao việc mới'} onClose={() => setEditing(undefined)} footer={<><button className="btn" onClick={() => setEditing(undefined)}>Hủy</button><button className="btn btn-primary" onClick={() => void run(() => saveTask(user.id, editing), 'Đã lưu').then((ok) => ok && setEditing(undefined))}>Lưu</button></>}>
          <div className="stack">
            <Field label="Tiêu đề"><input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} autoFocus /></Field>
            <Field label="Mô tả"><textarea className="textarea" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="grid-2">
              <Field label="Giao cho">
                <select className="select" value={editing.assigneeId} onChange={(e) => setEditing({ ...editing, assigneeId: e.target.value })}>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </Field>
              <Field label="Hạn hoàn thành"><input className="input" type="date" value={editing.dueDate ?? ''} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} /></Field>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
