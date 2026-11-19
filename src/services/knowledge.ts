// Kho tri thức cho RAG: chuyển dữ liệu cửa hàng thành các tài liệu văn bản ngắn
// (mỗi sản phẩm một tài liệu, mỗi nhóm chính sách một tài liệu). Edge Function
// "assistant" nhúng (embedding) các tài liệu này vào pgvector; khi khách hỏi, chỉ những
// tài liệu gần câu hỏi nhất được đưa cho mô hình ngôn ngữ.
import type { Database } from '../types'
import { money, today } from '../lib/format'
import { canRent, canSell, categoryName, productRating, productVariants } from './catalog'
import { isRemote, supabase } from '../lib/supabase'

export interface KnowledgeDocument { id: string; kind: 'product' | 'policy'; refId?: string; title: string; content: string }

export function buildKnowledgeDocuments(db: Database): KnowledgeDocument[] {
  const s = db.settings
  const products: KnowledgeDocument[] = db.products
    .filter((p) => p.status === 'active')
    .map((p) => {
      const variants = productVariants(db, p.id)
      const colors = [...new Set(variants.map((v) => v.color))].join(', ')
      const sizes = [...new Set(variants.map((v) => v.size))].join(', ')
      const collection = db.collections.find((c) => c.id === p.collectionId)?.name
      const rating = productRating(db, p.id)
      const price = [
        canSell(p) ? `Giá bán ${money(p.salePrice)}.` : '',
        canRent(p) ? `Cho thuê ${money(p.rentalPricePerDay)}/ngày, đặt cọc ${money(p.deposit)}.` : '',
      ].filter(Boolean).join(' ')
      return {
        id: `product:${p.id}`,
        kind: 'product' as const,
        refId: p.id,
        title: p.name,
        content: [
          `Sản phẩm: ${p.name} (mã ${p.id}).`,
          `Danh mục: ${categoryName(db, p.categoryId)}${collection ? `; bộ sưu tập ${collection}` : ''}. Dành cho: ${p.gender}.`,
          `Hình thức: ${canSell(p) && canRent(p) ? 'mua hoặc thuê' : canRent(p) ? 'chỉ cho thuê' : 'chỉ bán'}. ${price}`,
          `Chất liệu: ${p.material}. Màu: ${colors}. Size: ${sizes}.`,
          `Mô tả: ${p.description}`,
          rating.count ? `Đánh giá trung bình ${rating.avg.toFixed(1)}/5 (${rating.count} lượt).` : '',
        ].filter(Boolean).join('\n'),
      }
    })

  const t = today()
  const coupons = db.coupons.filter((c) => c.active && c.startAt <= t && t <= c.endAt && c.used < c.usageLimit)
  const policies: KnowledgeDocument[] = [
    {
      id: 'policy:store', kind: 'policy', title: 'Thông tin cửa hàng',
      content: `${s.storeName} — địa chỉ ${s.address}. Giờ mở cửa: ${s.openHours}. Hotline/Zalo: ${s.hotline}. Email: ${s.email}. Cửa hàng bán và cho thuê áo dài, vest, đầm dạ hội, váy cưới, trang phục hóa trang và phụ kiện.`,
    },
    {
      id: 'policy:shipping', kind: 'policy', title: 'Giao hàng và nhận tại cửa hàng',
      content: `Phí giao hàng ${money(s.shippingFee)}, miễn phí giao hàng cho đơn từ ${money(s.freeShippingFrom)}. Khách có thể chọn nhận tại cửa hàng (không mất phí). Giỏ hàng có cả đồ mua và đồ thuê sẽ được tách thành 2 đơn, phí giao chỉ tính một lần.`,
    },
    {
      id: 'policy:rental', kind: 'policy', title: 'Quy trình thuê đồ, tiền cọc, phí trễ',
      content: `Khách chọn ngày nhận và ngày trả, tiền thuê tính theo số ngày. Mỗi mẫu có mức cọc riêng, cọc được thanh toán cùng đơn thuê và hoàn lại khi trả đồ. Trả trễ: phí ${s.lateFeePercentPerDay}% giá thuê mỗi ngày trễ, trừ vào tiền cọc. Đồ hư hỏng có thể bị tính phí bồi thường. Muốn thuê thêm ngày thì gửi yêu cầu gia hạn trong trang Đơn hàng trước ngày trả.`,
    },
    {
      id: 'policy:returns', kind: 'policy', title: 'Đổi trả, hủy đơn, hoàn tiền',
      content: 'Đơn mua được đổi trả trong 7 ngày sau khi nhận hàng, sản phẩm còn nguyên tem mác. Đơn chưa giao có thể yêu cầu hủy. Yêu cầu gửi trong Tài khoản → Đơn hàng → chọn đơn; nhân viên tiếp nhận và quản lý phê duyệt. Tiền đã thanh toán được hoàn lại sau khi yêu cầu được chấp thuận.',
    },
    {
      id: 'policy:payment', kind: 'policy', title: 'Phương thức thanh toán',
      content: 'Thanh toán khi nhận hàng (COD) hoặc thanh toán trực tuyến qua cổng VNPay (thẻ ATM nội địa, QR ngân hàng, thẻ quốc tế). Đơn chọn VNPay được xác nhận sau khi thanh toán thành công; nếu thanh toán lỗi có thể thanh toán lại trong trang chi tiết đơn. Tại cửa hàng nhận tiền mặt, chuyển khoản, thẻ.',
    },
    {
      id: 'policy:loyalty', kind: 'policy', title: 'Điểm thưởng và hạng thành viên',
      content: `Cứ mỗi ${money(s.pointsPerAmount)} chi tiêu nhận 1 điểm, mỗi điểm trị giá ${money(s.pointValue)} khi thanh toán. Điểm được cộng khi đơn hoàn tất. Hạng thành viên theo tổng chi tiêu: ${s.tiers.map((x) => `${x.name} từ ${money(x.minSpent)}`).join(', ')}.`,
    },
    {
      id: 'policy:coupons', kind: 'policy', title: 'Mã giảm giá đang áp dụng',
      content: coupons.length
        ? coupons.map((c) => `Mã ${c.code}: ${c.description}${c.minOrder ? `, đơn tối thiểu ${money(c.minOrder)}` : ''}${c.appliesTo !== 'all' ? `, áp dụng cho đơn ${c.appliesTo === 'sale' ? 'mua' : 'thuê'}` : ''}${c.minTier ? `, hạng ${c.minTier} trở lên` : ''}, hạn đến ${c.endAt}.`).join('\n')
        : 'Hiện chưa có mã giảm giá nào đang áp dụng.',
    },
    {
      id: 'policy:sizing', kind: 'policy', title: 'Tư vấn chọn size',
      content: 'Size nữ: S (45–50kg, cao 1m50–1m58), M (50–56kg, 1m55–1m63), L (56–62kg, 1m60–1m68). Size nam: M (55–65kg, 1m65–1m72), L (65–75kg, 1m70–1m78), XL (75–85kg, 1m75–1m83). Free size dành cho phụ kiện. Bộ áo dài đôi có size theo cặp (Bộ S/M, Bộ M/L). Khách phân vân giữa hai size nên chọn size lớn hơn hoặc thử tại cửa hàng.',
    },
  ]
  return [...products, ...policies]
}

/**
 * Đồng bộ kho tri thức lên Supabase (chỉ nhân viên/quản lý). Function chỉ nhúng lại
 * những tài liệu có nội dung thay đổi, nên gọi nhiều lần cũng không tốn kém.
 */
export async function syncKnowledgeBase(db: Database) {
  if (!isRemote || !supabase) throw new Error('Kho tri thức AI cần kết nối Supabase.')
  const { data, error } = await supabase.functions.invoke<{ total: number; embedded: number; removed: number; error?: string }>('assistant', {
    body: { action: 'index', documents: buildKnowledgeDocuments(db) },
  })
  if (error || !data || data.error) throw new Error(data?.error ?? 'Không cập nhật được kho tri thức AI.')
  return data
}
