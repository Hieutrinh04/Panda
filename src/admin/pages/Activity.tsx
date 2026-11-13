import { useState } from 'react'
import { useDb } from '../../data/store'
import { dateTime, matches } from '../../lib/format'
import { Empty, SearchBox, Tabs } from '../../components/ui'

export function Activity() {
  const db = useDb()
  const [tab, setTab] = useState<'activity' | 'ai'>('activity')
  const [query, setQuery] = useState('')
  const [userId, setUserId] = useState('')
  const nameOf = (id?: string) => db.users.find((u) => u.id === id)?.fullName ?? 'Khách vãng lai'
  const staff = db.users.filter((u) => u.role !== 'customer')
  const activity = db.activity.filter((a) => (!userId || a.userId === userId) && matches(query, a.action, a.target))
  const ai = db.aiLogs.filter((a) => matches(query, a.question, a.answer))

  return (
    <>
      <div className="page-head"><div><h2>Nhật ký hoạt động</h2><p>Theo dõi thao tác của tài khoản và lịch sử tương tác với trợ lý AI.</p></div></div>
      <section className="card">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'activity', label: 'Thao tác hệ thống', count: db.activity.length }, { value: 'ai', label: 'Trợ lý AI', count: db.aiLogs.length }]} />
        <div className="toolbar">
          <SearchBox value={query} onChange={setQuery} />
          {tab === 'activity' && (
            <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Mọi người dùng</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          )}
        </div>
        <div className="table-wrap">
          {tab === 'activity' ? (
            <table className="table">
              <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th></tr></thead>
              <tbody>{activity.slice(0, 300).map((a) => <tr key={a.id}><td className="muted nowrap">{dateTime(a.at)}</td><td>{nameOf(a.userId)}</td><td>{a.action}</td><td className="muted">{a.target}</td></tr>)}</tbody>
            </table>
          ) : (
            <table className="table">
              <thead><tr><th>Thời gian</th><th>Người hỏi</th><th>Kênh</th><th>Câu hỏi</th><th>Trả lời</th></tr></thead>
              <tbody>{ai.map((a) => <tr key={a.id}><td className="muted nowrap">{dateTime(a.at)}</td><td>{nameOf(a.userId)}</td><td>{a.scope === 'shop' ? 'Website' : 'Quản trị'}</td><td>{a.question}</td><td className="muted small" style={{ maxWidth: 360 }}>{a.answer}</td></tr>)}</tbody>
            </table>
          )}
          {(tab === 'activity' ? activity : ai).length === 0 && <Empty />}
        </div>
      </section>
    </>
  )
}
