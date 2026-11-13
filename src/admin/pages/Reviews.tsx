import { useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { deleteReview, moderateReview } from '../../services/engagement'
import { productImage } from '../../services/catalog'
import { dateTime } from '../../lib/format'
import { Badge, Chips, Empty, Stars } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'

export function Reviews() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const { confirm } = useFeedback()
  const [filter, setFilter] = useState<'all' | 'low' | 'hidden' | 'unanswered'>('all')
  const [replies, setReplies] = useState<Record<string, string>>({})
  const list = db.reviews.filter((r) => (filter === 'low' ? r.rating <= 3 : filter === 'hidden' ? r.hidden : filter === 'unanswered' ? !r.reply : true))
  const avg = db.reviews.length ? db.reviews.reduce((s, r) => s + r.rating, 0) / db.reviews.length : 0

  return (
    <>
      <div className="page-head">
        <div><h2>Bình luận & đánh giá</h2><p>Điểm trung bình {avg.toFixed(1)}/5 từ {db.reviews.length} đánh giá. Ẩn nội dung không phù hợp và phản hồi khách.</p></div>
      </div>
      <Chips value={filter} onChange={setFilter} items={[{ value: 'all', label: 'Tất cả' }, { value: 'unanswered', label: 'Chưa phản hồi' }, { value: 'low', label: '≤ 3 sao' }, { value: 'hidden', label: 'Đang ẩn' }]} />
      <div className="stack">
        {list.map((r) => {
          const product = db.products.find((p) => p.id === r.productId)
          const customer = db.users.find((u) => u.id === r.customerId)
          return (
            <section key={r.id} className="card card-pad stack-sm" style={r.hidden ? { opacity: 0.65 } : undefined}>
              <div className="row-between">
                <div className="row">
                  {product && <img className="thumb" src={productImage(db, product)} alt="" />}
                  <div>
                    <strong>{product?.name ?? 'Sản phẩm đã xóa'}</strong>
                    <div className="row small"><Stars value={r.rating} /><span className="muted">{customer?.fullName} · {dateTime(r.createdAt)}</span>{r.hidden && <Badge>Đang ẩn</Badge>}</div>
                  </div>
                </div>
                <div className="nowrap">
                  <button className="btn btn-sm" onClick={() => void run(() => moderateReview(user.id, r.id, { hidden: !r.hidden }), r.hidden ? 'Đã hiện đánh giá' : 'Đã ẩn đánh giá')}>{r.hidden ? <><Eye /> Hiện</> : <><EyeOff /> Ẩn</>}</button>{' '}
                  <button className="btn btn-sm btn-danger" onClick={async () => (await confirm({ title: 'Xóa đánh giá?', message: 'Đánh giá sẽ bị xóa vĩnh viễn.', danger: true })) && run(() => deleteReview(user.id, r.id), 'Đã xóa')}><Trash2 /></button>
                </div>
              </div>
              <p>{r.comment}</p>
              {r.reply ? (
                <p className="form-note"><strong>Panda phản hồi:</strong> {r.reply}</p>
              ) : (
                <div className="row">
                  <input className="input grow" placeholder="Phản hồi khách hàng…" value={replies[r.id] ?? ''} onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })} />
                  <button className="btn btn-primary" disabled={!replies[r.id]?.trim()} onClick={() => void run(() => moderateReview(user.id, r.id, { reply: replies[r.id].trim() }), 'Đã gửi phản hồi')}>Gửi</button>
                </div>
              )}
            </section>
          )
        })}
        {list.length === 0 && <div className="card"><Empty title="Không có đánh giá" /></div>}
      </div>
    </>
  )
}
