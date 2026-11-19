import { Sparkles } from 'lucide-react'
import type { Recommendation } from '../services/recommend'
import { ProductCard } from './ProductCard'

/** Một hàng sản phẩm gợi ý, kèm lý do gợi ý dưới mỗi sản phẩm. */
export function RecommendationSection({ eyebrow, title, items, preferRental }: { eyebrow: string; title: string; items: Recommendation[]; preferRental?: boolean }) {
  if (!items.length) return null
  return (
    <section className="section">
      <div className="section-head"><div><small>{eyebrow}</small><h2>{title}</h2></div></div>
      <div className="product-grid">
        {items.map((r) => (
          <div key={r.product.id} className="reco-item">
            <ProductCard product={r.product} preferRental={preferRental} />
            <span className="reco-reason"><Sparkles size={12} aria-hidden /> {r.reason}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
