import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useDb } from '../../data/store'
import { verifyVnpayReturn, type VnpayResult } from '../../services/payments'
import { errorMessage } from '../../services/core'
import { money } from '../../lib/format'

/** Trang VNPay chuyển về sau khi khách thanh toán (vnp_ReturnUrl). */
export function PaymentResult() {
  const { search } = useLocation()
  const orders = useDb((db) => db.orders)
  const [result, setResult] = useState<VnpayResult | { code: 'error'; message: string }>()
  const started = useRef(false)

  useEffect(() => {
    // StrictMode chạy effect hai lần khi phát triển: chỉ gửi xác minh một lần.
    if (started.current) return
    started.current = true
    verifyVnpayReturn(search)
      .then(setResult)
      .catch((error) => setResult({ code: 'error', message: errorMessage(error) }))
  }, [search])

  if (!result)
    return (
      <div className="container" style={{ maxWidth: 640, padding: '60px 16px', textAlign: 'center' }}>
        <h1>Đang xác nhận thanh toán…</h1>
        <p className="muted">Vui lòng không đóng trang này.</p>
      </div>
    )

  const paid = result.code === 'paid'
  const ids = 'orderIds' in result ? result.orderIds ?? [] : []
  const related = orders.filter((o) => ids.includes(o.id))
  return (
    <div className="container" style={{ maxWidth: 640, padding: '48px 16px' }}>
      <section className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        {paid ? <CheckCircle2 size={56} className="success-text" /> : <XCircle size={56} className="danger-text" />}
        <h1>{paid ? 'Thanh toán thành công' : 'Thanh toán chưa thành công'}</h1>
        <p className="muted">{result.message}{'amount' in result && result.amount ? ` · ${money(result.amount)}` : ''}</p>
        {related.length > 0 && (
          <div className="stack" style={{ width: '100%', maxWidth: 420 }}>
            {related.map((o) => (
              <Link key={o.id} to={`/tai-khoan/don-hang/${o.id}`} className="summary-row">
                <span>Đơn {o.type === 'sale' ? 'mua' : 'thuê'} #{o.code}</span>
                <span>{money(o.total)} →</span>
              </Link>
            ))}
          </div>
        )}
        {!paid && <p className="muted small">Đơn hàng vẫn được giữ. Bạn có thể thanh toán lại trong trang chi tiết đơn hàng.</p>}
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/tai-khoan/don-hang" className="btn btn-primary">Xem đơn hàng</Link>
          <Link to="/san-pham" className="btn">Tiếp tục mua sắm</Link>
        </div>
      </section>
    </div>
  )
}
