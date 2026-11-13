import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import type { Id } from '../types'
import { useDb } from '../data/store'
import { markNotificationsRead } from '../services/engagement'
import { dateTime } from '../lib/format'
import { Empty } from './ui'

export function NotificationBell({ userId, allLink }: { userId: Id; allLink?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const items = useDb((db) => db.notifications).filter((n) => n.userId === userId)
  const unread = items.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label={`Thông báo (${unread} chưa đọc)`}>
        <Bell />
        {unread > 0 && <span className="dot-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="row-between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <strong>Thông báo</strong>
            <div className="row">
              {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={() => markNotificationsRead(userId)}>Đánh dấu đã đọc</button>}
              {allLink && <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); navigate(allLink) }}>Xem tất cả</button>}
            </div>
          </div>
          {items.length === 0 && <Empty title="Chưa có thông báo" />}
          {items.slice(0, 20).map((n) => (
            <button
              key={n.id}
              className={`notice${n.read ? '' : ' unread'}`}
              onClick={() => {
                markNotificationsRead(userId, [n.id])
                setOpen(false)
                if (n.link) navigate(n.link)
              }}
            >
              <strong>{n.title}</strong>
              <span>{n.body}</span>
              <span>{dateTime(n.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
