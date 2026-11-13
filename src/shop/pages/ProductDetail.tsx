import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Heart, Minus, Plus } from 'lucide-react'
import { useDb } from '../../data/store'
import { useCustomer } from '../../services/auth'
import { canRent, canSell, categoryName, productRating, productVariants, rentalAvailable, toggleWishlist } from '../../services/catalog'
import { addToCart } from '../../services/orders'
import { productArt } from '../../lib/art'
import { addDays, date, money, rentalDays, today } from '../../lib/format'
import { Empty, Stars } from '../../components/ui'
import { useAction } from '../../components/feedback'
import { ProductCard } from '../ProductCard'

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']

// Gắn key theo id để trạng thái chọn màu/size được làm mới khi chuyển sang sản phẩm khác.
export function ProductDetail() {
  const { id } = useParams()
  return <ProductView key={id} id={id} />
}

function ProductView({ id }: { id?: string }) {
  const [params] = useSearchParams()
  const db = useDb()
  const customer = useCustomer()
  const navigate = useNavigate()
  const run = useAction()
  const product = db.products.find((p) => p.id === id && p.status === 'active')
  const variants = product ? productVariants(db, product.id) : []
  const colors = [...new Set(variants.map((v) => v.color))]
  const [color, setColor] = useState(colors[0] ?? '')
  const [size, setSize] = useState('')
  const [mode, setMode] = useState<'sale' | 'rental'>(product && canRent(product) && (params.get('mode') === 'rental' || !canSell(product)) ? 'rental' : 'sale')
  const [start, setStart] = useState(addDays(today(), 1))
  const [end, setEnd] = useState(addDays(today(), 2))
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)

  if (!product) return <div className="container"><Empty title="Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"><Link to="/san-pham" className="btn">Xem sản phẩm khác</Link></Empty></div>

  const sizes = variants.filter((v) => v.color === color).sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size))
  const variant = sizes.find((v) => v.size === size)
  const available = variant ? (mode === 'rental' ? rentalAvailable(db, variant.id, start, end) : variant.stock) : 0
  const days = rentalDays(start, end)
  const total = mode === 'rental' ? product.rentalPricePerDay * days * quantity : product.salePrice * quantity
  const images = product.images.length ? product.images : colors.map((c) => productArt(categoryName(db, product.categoryId), c))
  const mainImage = product.images.length ? images[imageIndex] ?? images[0] : productArt(categoryName(db, product.categoryId), color)
  const rating = productRating(db, product.id)
  const reviews = db.reviews.filter((r) => r.productId === product.id && !r.hidden)
  const fav = customer ? (db.wishlists[customer.id] ?? []).includes(product.id) : false
  const related = db.products.filter((p) => p.status === 'active' && p.id !== product.id && (p.categoryId === product.categoryId || p.collectionId === product.collectionId)).slice(0, 4)

  const add = async (goTo?: string) => {
    if (!customer) return navigate('/dang-nhap', { state: { from: `/san-pham/${product.id}` } })
    if (!variant) return run(() => { throw new Error('Vui lòng chọn kích thước.') })
    const ok = await run(() => addToCart(customer.id, { variantId: variant.id, mode, quantity, rentalStart: mode === 'rental' ? start : undefined, rentalEnd: mode === 'rental' ? end : undefined }), goTo ? undefined : 'Đã thêm vào giỏ hàng')
    if (ok && goTo) navigate(goTo)
  }

  return (
    <div className="container">
      <p className="muted small" style={{ paddingTop: 20 }}>
        <Link to="/">Trang chủ</Link> / <Link to={`/san-pham?cat=${product.categoryId}`}>{categoryName(db, product.categoryId)}</Link> / {product.name}
      </p>
      <div className="detail">
        <div className="gallery">
          <div className="gallery-thumbs">
            {images.map((src, i) => (
              <button key={i} className={(product.images.length ? i === imageIndex : colors[i] === color) ? 'on' : ''} onClick={() => (product.images.length ? setImageIndex(i) : setColor(colors[i]))}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <div className="gallery-main"><img src={mainImage} alt={product.name} /></div>
        </div>

        <div className="detail-info">
          <div>
            <p className="muted small">{categoryName(db, product.categoryId)} · {product.gender}</p>
            <h1>{product.name}</h1>
            {rating.count > 0 && <a href="#danh-gia"><Stars value={rating.avg} count={rating.count} /></a>}
          </div>
          <div className="price-box">
            {canSell(product) && <div><span>Giá bán</span><strong>{money(product.salePrice)}</strong></div>}
            {canRent(product) && (
              <>
                <div><span>Giá thuê</span><strong>{money(product.rentalPricePerDay)}<span>/ngày</span></strong></div>
                <div><span>Tiền cọc</span><strong>{money(product.deposit)}</strong></div>
              </>
            )}
          </div>

          {product.mode === 'both' && (
            <div className="mode-switch">
              <button className={mode === 'sale' ? 'on' : ''} onClick={() => setMode('sale')}><strong>Mua</strong><span>Sở hữu với {money(product.salePrice)}</span></button>
              <button className={mode === 'rental' ? 'on' : ''} onClick={() => setMode('rental')}><strong>Thuê</strong><span>{money(product.rentalPricePerDay)}/ngày + cọc</span></button>
            </div>
          )}

          <div>
            <div className="option-label">Màu sắc: <span className="muted">{color}</span></div>
            <div className="chips">{colors.map((c) => <button key={c} className={`chip${c === color ? ' active' : ''}`} onClick={() => { setColor(c); setSize('') }}>{c}</button>)}</div>
          </div>
          <div>
            <div className="option-label">Kích thước</div>
            <div className="size-btns">
              {sizes.map((v) => {
                const free = mode === 'rental' ? rentalAvailable(db, v.id, start, end) : v.stock
                return <button key={v.id} className={`size-btn${v.size === size ? ' on' : ''}`} disabled={free === 0} onClick={() => setSize(v.size)} title={free ? `Còn ${free}` : 'Hết'}>{v.size}</button>
              })}
            </div>
          </div>

          {mode === 'rental' && (
            <div className="grid-2">
              <label className="field"><span>Ngày nhận đồ</span><input className="input" type="date" min={today()} value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} /></label>
              <label className="field"><span>Ngày trả đồ</span><input className="input" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
          )}

          <div className="row">
            <div className="qty">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Giảm"><Minus size={14} /></button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} aria-label="Tăng"><Plus size={14} /></button>
            </div>
            <span className="stock-note">
              {!variant ? <span className="muted">Chọn size để xem tình trạng</span> : available === 0 ? <span className="danger-text">{mode === 'rental' ? 'Đã kín lịch trong khoảng ngày này' : 'Hết hàng'}</span> : quantity > available ? <span className="danger-text">Chỉ còn {available}</span> : <span className="success-text">{mode === 'rental' ? `Còn ${available} bộ trống lịch` : `Còn ${available} sản phẩm`}</span>}
            </span>
          </div>

          <div className="card card-pad">
            {mode === 'rental' ? (
              <>
                <div className="summary-row"><span className="muted">Tiền thuê ({days} ngày × {quantity})</span><span>{money(total)}</span></div>
                <div className="summary-row"><span className="muted">Tiền cọc (hoàn khi trả đồ)</span><span>{money(product.deposit * quantity)}</span></div>
                <div className="summary-row total"><span>Tạm tính</span><span>{money(total + product.deposit * quantity)}</span></div>
                <p className="muted small" style={{ marginTop: 6 }}>Nhận {date(start)} · trả {date(end)}. Trả trễ tính {db.settings.lateFeePercentPerDay}% giá thuê mỗi ngày.</p>
              </>
            ) : (
              <div className="summary-row total" style={{ border: 0, margin: 0, padding: 0 }}><span>Tạm tính</span><span>{money(total)}</span></div>
            )}
          </div>

          <div className="detail-actions">
            <button className="btn btn-lg" disabled={!!variant && quantity > available} onClick={() => void add()}>Thêm vào giỏ</button>
            <button className="btn btn-primary btn-lg" disabled={!!variant && quantity > available} onClick={() => void add('/gio-hang')}>{mode === 'rental' ? 'Thuê ngay' : 'Mua ngay'}</button>
            <button className={`btn btn-lg${fav ? ' btn-accent' : ''}`} style={{ flex: 'none' }} aria-label="Yêu thích" onClick={() => (customer ? toggleWishlist(customer.id, product.id) : navigate('/dang-nhap'))}>
              <Heart fill={fav ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Mô tả</h3>
            <p style={{ color: 'var(--ink-2)' }}>{product.description}</p>
          </div>
          <dl className="spec">
            <dt>Chất liệu</dt><dd>{product.material || '—'}</dd>
            <dt>Danh mục</dt><dd>{categoryName(db, product.categoryId)}</dd>
            {product.collectionId && <><dt>Bộ sưu tập</dt><dd>{db.collections.find((c) => c.id === product.collectionId)?.name}</dd></>}
            <dt>Mã SKU</dt><dd>{variant?.sku ?? variants.map((v) => v.sku).slice(0, 2).join(', ') + (variants.length > 2 ? '…' : '')}</dd>
          </dl>
        </div>
      </div>

      <section className="section" id="danh-gia">
        <div className="section-head"><div><small>ĐÁNH GIÁ</small><h2>Khách hàng nói gì</h2></div></div>
        {reviews.length ? (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="rating-summary">
              <div><div className="big">{rating.avg.toFixed(1)}</div><Stars value={rating.avg} /><div className="muted small">{rating.count} đánh giá</div></div>
              <div className="bars">
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = reviews.filter((r) => r.rating === s).length
                  return <div key={s}><span>{s} ★</span><i><b style={{ width: `${(n / reviews.length) * 100}%` }} /></i><span>{n}</span></div>
                })}
              </div>
            </div>
            <div>
              {reviews.map((r) => (
                <div key={r.id} className="review">
                  <div className="row-between"><strong>{db.users.find((u) => u.id === r.customerId)?.fullName ?? 'Khách hàng'}</strong><span className="muted small">{date(r.createdAt)}</span></div>
                  <Stars value={r.rating} />
                  <p style={{ marginTop: 6 }}>{r.comment}</p>
                  {r.reply && <div className="review-reply"><strong>Panda Fashion:</strong> {r.reply}</div>}
                </div>
              ))}
            </div>
          </div>
        ) : <Empty title="Chưa có đánh giá"><span>Khách đã mua/thuê có thể đánh giá sau khi hoàn tất đơn.</span></Empty>}
      </section>

      {related.length > 0 && (
        <section className="section" style={{ paddingBottom: 60 }}>
          <div className="section-head"><div><small>GỢI Ý</small><h2>Có thể bạn cũng thích</h2></div></div>
          <div className="product-grid">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </div>
  )
}
