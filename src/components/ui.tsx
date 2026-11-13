import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Inbox, Search, Star, X } from 'lucide-react'
import type { Tone } from '../services/labels'
import { initials } from '../lib/format'
import { uploadImage } from '../lib/images'
import { useFeedback } from './feedback'

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(onClose)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </aside>
    </div>
  )
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose)
  useEffect(() => {
    ref.current = onClose
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && ref.current()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export const Badge = ({ tone = 'neutral', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) => (
  <span className={`badge ${tone}${plain ? ' plain' : ''}`}>{children}</span>
)

export const StatusBadge = ({ value }: { value: [string, Tone] }) => <Badge tone={value[1]}>{value[0]}</Badge>

export function Empty({ title = 'Chưa có dữ liệu', children, icon }: { title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={value === t.value ? 'active' : ''} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="chips">
      {items.map((t) => (
        <button key={t.value} className={`chip${value === t.value ? ' active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search-box">
      <Search />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  )
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="stars" aria-label={`${value.toFixed(1)} sao`}>
        {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={value >= i - 0.25 ? '' : 'off'} fill="currentColor" strokeWidth={0} />)}
      </span>
      {count !== undefined && <span className="muted small">({count})</span>}
    </span>
  )
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Chấm điểm">
      {[1, 2, 3, 4, 5].map((i) => (
        <button type="button" key={i} className={value >= i ? 'on' : ''} onClick={() => onChange(i)} aria-label={`${i} sao`}>
          <Star fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, src, size }: { name: string; src?: string; size?: 'lg' }) {
  return <span className={`avatar${size ? ` ${size}` : ''}`}>{src ? <img src={src} alt={name} /> : initials(name)}</span>
}

export function ImageUploader({ value, onChange, max = 5 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const id = useId()
  const { toast } = useFeedback()
  const [busy, setBusy] = useState(false)
  const add = async (files: FileList | null) => {
    if (!files) return
    setBusy(true)
    try {
      const images = await Promise.all([...files].slice(0, max - value.length).map((f) => uploadImage(f, 'product')))
      onChange([...value, ...images])
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Không tải được ảnh', true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="uploader">
      {value.map((src, i) => (
        <div className="uploader-item" key={i}>
          <img src={src} alt={`Ảnh ${i + 1}`} />
          <button type="button" onClick={() => onChange(value.filter((_, x) => x !== i))} aria-label="Xóa ảnh"><X /></button>
        </div>
      ))}
      {value.length < max && (
        <label className="uploader-add" htmlFor={id}>
          <span><ImagePlus size={20} /><br />{busy ? 'Đang xử lý…' : 'Thêm ảnh'}</span>
          <input id={id} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
        </label>
      )}
    </div>
  )
}

/** Biểu đồ cột chồng đơn giản bằng SVG. */
export function BarChart({ data, series, height = 220, format }: {
  data: { label: string; values: number[] }[]
  series: { name: string; color: string }[]
  height?: number
  format: (n: number) => string
}) {
  const [hover, setHover] = useState<number>()
  const width = 720
  const pad = { top: 12, right: 8, bottom: 26, left: 48 }
  const max = Math.max(1, ...data.map((d) => d.values.reduce((s, v) => s + Math.max(0, v), 0)))
  const step = (width - pad.left - pad.right) / Math.max(1, data.length)
  const barW = Math.min(28, step * 0.62)
  const y = (v: number) => pad.top + (height - pad.top - pad.bottom) * (1 - v / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t)
  const labelEvery = Math.ceil(data.length / 12)
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ doanh thu">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
            <text x={pad.left - 8} y={y(t) + 3} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + step * i + (step - barW) / 2
          let acc = 0
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
              <rect x={pad.left + step * i} y={pad.top} width={step} height={height - pad.top - pad.bottom} fill={hover === i ? 'rgba(16,42,67,.04)' : 'transparent'} />
              {d.values.map((v, s) => {
                const value = Math.max(0, v)
                const top = y(acc + value)
                const h = y(acc) - top
                acc += value
                return h > 0 ? <rect key={s} x={x} y={top} width={barW} height={h} rx={s === d.values.length - 1 ? 3 : 0} fill={series[s].color} /> : null
              })}
              {i % labelEvery === 0 && <text x={x + barW / 2} y={height - 8} textAnchor="middle">{d.label}</text>}
            </g>
          )
        })}
        {hover !== undefined && (
          <g className="chart-tip" transform={`translate(${Math.min(pad.left + step * hover + step / 2, width - 150)}, ${pad.top})`}>
            <rect x={-4} y={0} width={150} height={20 + series.length * 16} rx={6} fill="#17202b" opacity={0.92} />
            <text x={6} y={14} style={{ fill: '#fff', fontWeight: 600 }}>{data[hover].label}</text>
            {series.map((s, i) => (
              <text key={s.name} x={6} y={30 + i * 16} style={{ fill: '#dfe6ec' }}>{s.name}: {format(data[hover].values[i])}</text>
            ))}
          </g>
        )}
      </svg>
      <div className="legend">
        {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  )
}
