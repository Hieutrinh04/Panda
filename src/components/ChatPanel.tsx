import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send } from 'lucide-react'
import { askAssistant, type AiAction, type AiContext, type AiReply } from '../services/ai'
import { getDb } from '../data/store'
import { productImage } from '../services/catalog'
import { money } from '../lib/format'

interface Message { from: 'user' | 'bot'; reply: AiReply }

export function ChatPanel({ context, greeting, suggestions, onAction, onNavigate }: {
  context: AiContext
  greeting: string
  suggestions: string[]
  onAction?: (action: AiAction) => void
  onNavigate?: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([{ from: 'bot', reply: { text: greeting } }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    setInput('')
    setMessages((m) => [...m, { from: 'user', reply: { text: question } }])
    setBusy(true)
    try {
      // Gửi kèm vài lượt hỏi đáp gần nhất để trợ lý hiểu câu hỏi nối tiếp.
      const history = messages.slice(1).map((m) => ({ role: m.from === 'user' ? ('user' as const) : ('assistant' as const), content: m.reply.text }))
      const reply = await askAssistant(question, context, history)
      setMessages((m) => [...m, { from: 'bot', reply }])
    } finally {
      setBusy(false)
    }
  }

  const db = getDb()
  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            {m.reply.text}
            {m.reply.table && (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>{m.reply.table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{m.reply.table.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {m.reply.products && (
              <div className="bubble-products">
                {m.reply.products.map((p) => (
                  <Link key={p.id} to={`/san-pham/${p.id}`} className="bubble-product" onClick={onNavigate}>
                    <img src={productImage(db, p)} alt="" />
                    <div>
                      <strong>{p.name}</strong>
                      <span>{p.mode === 'rental' ? `Thuê ${money(p.rentalPricePerDay)}/ngày` : `${money(p.salePrice)}${p.mode === 'both' ? ` · thuê ${money(p.rentalPricePerDay)}/ngày` : ''}`}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {(m.reply.links || m.reply.action) && (
              <div className="bubble-links">
                {m.reply.links?.map((l) => <Link key={l.to} className="btn btn-sm" to={l.to} onClick={onNavigate}>{l.label}</Link>)}
                {m.reply.action && onAction && <button className="btn btn-sm btn-primary" onClick={() => onAction(m.reply.action!)}>{m.reply.action.label}</button>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble bot"><span className="typing"><i /><i /><i /></span></div>}
      </div>
      {messages.length <= 1 && (
        <div className="chat-suggestions">
          {suggestions.map((s) => <button key={s} onClick={() => void send(s)}>{s}</button>)}
        </div>
      )}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(input) }}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Nhập câu hỏi…" aria-label="Câu hỏi cho trợ lý" />
        <button className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Gửi"><Send /></button>
      </form>
    </div>
  )
}
