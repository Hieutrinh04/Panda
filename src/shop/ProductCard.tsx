import { Link, useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import type { Product } from '../types'
import { useDb } from '../data/store'
import { useCustomer } from '../services/auth'
import { canRent, canSell, productImage, productRating, productVariants, toggleWishlist, totalStock } from '../services/catalog'
import { money } from '../lib/format'
import { Stars } from '../components/ui'

export function ProductCard({ product, preferRental }: { product: Product; preferRental?: boolean }) {
  const db = useDb()
  const customer = useCustomer()
  const navigate = useNavigate()
  const fav = customer ? (db.wishlists[customer.id] ?? []).includes(product.id) : false
  const rating = productRating(db, product.id)
  const variants = productVariants(db, product.id)
  const colors = [...new Set(variants.map((v) => v.color))]
  const sizes = [...new Set(variants.map((v) => v.size))]
  const out = totalStock(db, product.id) === 0
  const showRental = canRent(product) && (preferRental || !canSell(product))

  return (
    <Link to={`/san-pham/${product.id}${showRental ? '?mode=rental' : ''}`} className="product-card">
      <div className="media">
        <img src={productImage(db, product)} alt={product.name} loading="lazy" />
        <div className="tags">
          {canRent(product) && <span className="tag rent">Cho thuê</span>}
          {out && <span className="tag out">Hết hàng</span>}
        </div>
        <button
          className={`fav${fav ? ' on' : ''}`}
          aria-label={fav ? 'Bỏ yêu thích' : 'Yêu thích'}
          onClick={(e) => {
            e.preventDefault()
            if (!customer) navigate('/dang-nhap')
            else toggleWishlist(customer.id, product.id)
          }}
        >
          <Heart fill={fav ? 'currentColor' : 'none'} />
        </button>
      </div>
      <h3>{product.name}</h3>
      <div className="meta">{colors.join(', ')} · {sizes.join(' / ')}</div>
      {rating.count > 0 && <Stars value={rating.avg} count={rating.count} />}
      <div className="price">
        {showRental ? <>{money(product.rentalPricePerDay)}<span>/ngày · cọc {money(product.deposit)}</span></> : <>{money(product.salePrice)}{canRent(product) && <span> · thuê {money(product.rentalPricePerDay)}/ngày</span>}</>}
      </div>
    </Link>
  )
}
