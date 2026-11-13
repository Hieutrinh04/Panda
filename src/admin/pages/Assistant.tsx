import { useState } from 'react'
import { useAdminUser } from '../../services/auth'
import { createMovement } from '../../services/inventory'
import type { AiAction, ProductDraft } from '../../services/ai'
import { ChatPanel } from '../../components/ChatPanel'
import { useAction } from '../../components/feedback'
import { ProductForm } from './Products'

export function Assistant() {
  const user = useAdminUser()!
  const run = useAction()
  const [draft, setDraft] = useState<ProductDraft>()
  const manager = user.role === 'manager'

  const onAction = (action: AiAction) => {
    if (action.kind === 'create-product') setDraft(action.draft)
    if (action.kind === 'import-stock')
      void run(() => createMovement(user.id, user.role, { variantId: action.variantId, type: manager ? 'import' : 'adjust', quantity: action.quantity, note: 'Nhập qua trợ lý AI' }), manager ? 'Đã nhập kho' : 'Đã gửi đề xuất điều chỉnh')
  }

  return (
    <>
      <div className="page-head">
        <div><h2>Trợ lý AI</h2><p>Hỏi bằng tiếng Việt để tra cứu sản phẩm, tồn kho, khách hàng, đơn hàng{manager ? ', doanh thu' : ''} hoặc nhập dữ liệu nhanh.</p></div>
      </div>
      <section className="card ai-page">
        <ChatPanel
          context={{ scope: 'admin', user }}
          greeting={`Chào ${user.fullName.split(' ').at(-1)}! Mình có thể tra cứu số liệu cửa hàng hoặc giúp nhập sản phẩm, nhập kho. Bạn cần gì?`}
          suggestions={[
            ...(manager ? ['Doanh thu tháng này', 'Sản phẩm bán chạy'] : []),
            'Sản phẩm sắp hết hàng',
            'Đơn thuê quá hạn',
            'Hôm nay cần giao trả đồ nào?',
            'Còn bao nhiêu vest tuxedo',
            'Khách 0901234567',
            'Thêm sản phẩm Váy Luna giá 890k size S,M màu hồng số lượng 3 danh mục váy',
          ]}
          onAction={onAction}
        />
      </section>
      {draft && <ProductForm draft={draft} readOnly={!manager} onClose={() => setDraft(undefined)} />}
    </>
  )
}
