import { useState } from 'react'
import { BrainCircuit, Database as DatabaseIcon, RotateCcw } from 'lucide-react'
import type { StoreSettings } from '../../types'
import { isRemote, useDb } from '../../data/store'
import { importSeedToRemote } from '../../data/importSeed'
import { useAdminUser } from '../../services/auth'
import { resetDemoData, saveSettings } from '../../services/people'
import { Field } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'
import { syncKnowledgeBase } from '../../services/knowledge'
import { evaluateRecommender } from '../../services/recommend'

export function Content() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const { confirm } = useFeedback()
  const [form, setForm] = useState<StoreSettings>(db.settings)
  const [importing, setImporting] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [indexResult, setIndexResult] = useState<string>()
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateRecommender>>()

  const runIndex = async () => {
    setIndexing(true)
    await run(async () => {
      const r = await syncKnowledgeBase(db)
      setIndexResult(`${r.total} tài liệu · nhúng mới ${r.embedded} · gỡ ${r.removed}`)
    }, 'Đã cập nhật kho tri thức AI')
    setIndexing(false)
  }

  const runImport = async () => {
    setImporting(true)
    const ok = await run(() => importSeedToRemote(user.id), 'Đã nạp dữ liệu mẫu lên Supabase')
    setImporting(false)
    // Cài đặt cửa hàng cũng được nạp: cập nhật lại form.
    if (ok) window.location.reload()
  }
  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <>
      <div className="page-head">
        <div><h2>Nội dung website & cài đặt</h2><p>Thông tin cửa hàng, nội dung trang chủ và các quy định phí.</p></div>
        <button className="btn btn-primary" onClick={() => void run(() => saveSettings(user.id, form), 'Đã lưu cài đặt')}>Lưu thay đổi</button>
      </div>
      <div className="grid-2">
        <section className="card card-pad stack">
          <h3 style={{ fontSize: 15 }}>Trang chủ</h3>
          <Field label="Thanh thông báo trên cùng"><input className="input" value={form.announcement} onChange={(e) => set('announcement', e.target.value)} /></Field>
          <Field label="Tiêu đề banner"><input className="input" value={form.heroTitle} onChange={(e) => set('heroTitle', e.target.value)} /></Field>
          <Field label="Mô tả banner"><textarea className="textarea" value={form.heroSubtitle} onChange={(e) => set('heroSubtitle', e.target.value)} /></Field>
        </section>
        <section className="card card-pad stack">
          <h3 style={{ fontSize: 15 }}>Thông tin cửa hàng</h3>
          <Field label="Tên cửa hàng"><input className="input" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} /></Field>
          <Field label="Địa chỉ"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Hotline"><input className="input" value={form.hotline} onChange={(e) => set('hotline', e.target.value)} /></Field>
            <Field label="Email"><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          </div>
          <Field label="Giờ mở cửa"><input className="input" value={form.openHours} onChange={(e) => set('openHours', e.target.value)} /></Field>
        </section>
        <section className="card card-pad stack">
          <h3 style={{ fontSize: 15 }}>Giao hàng & phí thuê</h3>
          <div className="grid-2">
            <Field label="Phí giao hàng (đ)"><input className="input" type="number" min={0} step={1000} value={form.shippingFee} onChange={(e) => set('shippingFee', Number(e.target.value))} /></Field>
            <Field label="Miễn phí giao từ (đ)"><input className="input" type="number" min={0} step={50000} value={form.freeShippingFrom} onChange={(e) => set('freeShippingFrom', Number(e.target.value))} /></Field>
          </div>
          <Field label="Phí trả trễ (% giá thuê mỗi ngày trễ)"><input className="input" type="number" min={0} max={300} value={form.lateFeePercentPerDay} onChange={(e) => set('lateFeePercentPerDay', Number(e.target.value))} /></Field>
        </section>
        <section className="card card-pad stack">
          <h3 style={{ fontSize: 15 }}>Dữ liệu dùng thử</h3>
          {isRemote ? (
            <>
              <p className="muted">
                Nạp danh mục, 38 sản phẩm, mã giảm giá, khách hàng và đơn hàng mẫu 4 tuần gần nhất lên Supabase để có dữ liệu demo.
                Chỉ dùng được khi database chưa có sản phẩm. Khách mẫu chưa có tài khoản; ai đăng ký bằng đúng email/SĐT của khách mẫu sẽ nhận lại hồ sơ và lịch sử đó.
              </p>
              <div>
                <button className="btn btn-primary" disabled={db.products.length > 0 || importing} onClick={() => void runImport()}>
                  <DatabaseIcon /> {importing ? 'Đang nạp…' : db.products.length ? 'Database đã có dữ liệu' : 'Nạp dữ liệu mẫu lên Supabase'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Bản hiện tại lưu dữ liệu trong trình duyệt. Khôi phục sẽ xóa mọi thay đổi và nạp lại dữ liệu mẫu.</p>
              <div>
                <button className="btn btn-danger" onClick={async () => (await confirm({ title: 'Khôi phục dữ liệu mẫu?', message: 'Toàn bộ dữ liệu hiện tại (đơn hàng, sản phẩm, tài khoản…) sẽ bị thay bằng dữ liệu mẫu ban đầu.', danger: true, confirmLabel: 'Khôi phục' })) && resetDemoData()}>
                  <RotateCcw /> Khôi phục dữ liệu mẫu
                </button>
              </div>
            </>
          )}
        </section>
        <section className="card card-pad stack">
          <h3 style={{ fontSize: 15 }}>Trí tuệ nhân tạo: RAG và hệ gợi ý</h3>
          <p className="muted">
            Trợ lý AI tìm tài liệu sản phẩm/chính sách liên quan bằng vector embedding (pgvector) trước khi trả lời. Kho tri thức tự cập nhật mỗi lần nhân viên mở trang quản trị; bấm nút để cập nhật ngay sau khi sửa sản phẩm hoặc chính sách.
          </p>
          {isRemote && (
            <div className="row">
              <button className="btn" disabled={indexing} onClick={() => void runIndex()}><BrainCircuit /> {indexing ? 'Đang cập nhật…' : 'Cập nhật kho tri thức AI'}</button>
              {indexResult && <span className="muted small">{indexResult}</span>}
            </div>
          )}
          <p className="muted">
            Hệ gợi ý lai: lọc theo nội dung (TF-IDF, giá, giới tính) kết hợp lọc cộng tác item-item từ lịch sử mua/thuê, yêu thích, giỏ hàng. Đánh giá leave-one-out: giấu một sản phẩm khách đã chọn và kiểm tra nó có nằm trong 5 gợi ý đầu không.
          </p>
          <div className="row">
            <button className="btn" onClick={() => setEvaluation(evaluateRecommender(db, 5))}>Đánh giá hệ gợi ý</button>
            {evaluation && (
              <span className="small">
                HitRate@{evaluation.k}: <strong>{(evaluation.hybrid * 100).toFixed(1)}%</strong> (mô hình lai) so với {(evaluation.popularity * 100).toFixed(1)}% (theo độ phổ biến) · {evaluation.cases} lượt thử
              </span>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
