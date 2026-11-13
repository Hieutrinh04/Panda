import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import type { Gender } from '../../types'
import { useDb } from '../../data/store'
import { canRent, canSell, productRating, productVariants, totalStock } from '../../services/catalog'
import { colorHex } from '../../lib/art'
import { matches } from '../../lib/format'
import { Empty } from '../../components/ui'
import { ProductCard } from '../ProductCard'

type Sort = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'rating'

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free size']

export function Catalog() {
  const db = useDb()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const q = params.get('q') ?? ''
  const mode = (params.get('mode') ?? '') as '' | 'sale' | 'rental'
  const cat = params.get('cat') ?? ''
  const col = params.get('col') ?? ''
  const gender = (params.get('gender') ?? '') as '' | Gender
  const sizes = params.getAll('size')
  const colors = params.getAll('color')
  const min = Number(params.get('min')) || 0
  const max = Number(params.get('max')) || 0
  const inStock = params.get('stock') === '1'
  const sort = (params.get('sort') ?? 'featured') as Sort

  const update = (patch: Record<string, string | string[] | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key)
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
      else if (value) next.set(key, value)
    }
    setParams(next, { replace: true })
  }
  const toggle = (key: 'size' | 'color', value: string, list: string[]) => update({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] })

  const price = (p: (typeof db.products)[number]) => (mode === 'rental' || (!canSell(p) && canRent(p)) ? p.rentalPricePerDay : p.salePrice)
  const allColors = [...new Set(db.variants.map((v) => v.color))].sort()
  const allSizes = [...new Set(db.variants.map((v) => v.size))].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))

  const products = db.products
    .filter((p) => p.status === 'active')
    .filter((p) => (mode === 'sale' ? canSell(p) : mode === 'rental' ? canRent(p) : true))
    .filter((p) => !cat || p.categoryId === cat)
    .filter((p) => !col || p.collectionId === col)
    .filter((p) => !gender || p.gender === gender || p.gender === 'Unisex')
    .filter((p) => matches(q, p.name, p.description, p.material, db.categories.find((c) => c.id === p.categoryId)?.name, ...productVariants(db, p.id).map((v) => v.color)))
    .filter((p) => {
      const variants = productVariants(db, p.id)
      return (!sizes.length || variants.some((v) => sizes.includes(v.size))) && (!colors.length || variants.some((v) => colors.includes(v.color)))
    })
    .filter((p) => (!min || price(p) >= min) && (!max || price(p) <= max))
    .filter((p) => !inStock || totalStock(db, p.id) > 0)
    .sort((a, b) => {
      if (sort === 'price-asc') return price(a) - price(b)
      if (sort === 'price-desc') return price(b) - price(a)
      if (sort === 'rating') return productRating(db, b.id).avg - productRating(db, a.id).avg
      if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt)
      return Number(b.featured) - Number(a.featured)
    })

  const title = q ? `Kết quả cho “${q}”` : col ? db.collections.find((c) => c.id === col)?.name : cat ? db.categories.find((c) => c.id === cat)?.name : mode === 'rental' ? 'Thuê trang phục' : mode === 'sale' ? 'Bộ sưu tập' : 'Tất cả sản phẩm'
  const hasFilters = cat || col || gender || sizes.length || colors.length || min || max || inStock

  return (
    <div className="container catalog">
      <aside className={`filters${open ? ' open' : ''}`}>
        <div>
          <h4>Hình thức</h4>
          <div className="filter-list">
            {([['', 'Tất cả'], ['sale', 'Mua'], ['rental', 'Thuê']] as const).map(([value, label]) => (
              <label key={value} className="checkbox"><input type="radio" name="mode" checked={mode === value} onChange={() => update({ mode: value })} /> {label}</label>
            ))}
          </div>
        </div>
        <div>
          <h4>Danh mục</h4>
          <div className="filter-list">
            <label className="checkbox"><input type="radio" name="cat" checked={!cat} onChange={() => update({ cat: undefined })} /> Tất cả</label>
            {db.categories.map((c) => <label key={c.id} className="checkbox"><input type="radio" name="cat" checked={cat === c.id} onChange={() => update({ cat: c.id })} /> {c.name}</label>)}
          </div>
        </div>
        <div>
          <h4>Giá {mode === 'rental' ? '(thuê/ngày)' : ''}</h4>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input input-sm" type="number" min={0} step={50000} placeholder="Từ" value={min || ''} onChange={(e) => update({ min: e.target.value })} />
            <input className="input input-sm" type="number" min={0} step={50000} placeholder="Đến" value={max || ''} onChange={(e) => update({ max: e.target.value })} />
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {(mode === 'rental' ? [[0, 300000], [300000, 0]] : [[0, 1000000], [1000000, 2000000], [2000000, 0]]).map(([a, b]) => (
              <button key={`${a}-${b}`} className="chip" onClick={() => update({ min: a ? String(a) : undefined, max: b ? String(b) : undefined })}>
                {a ? `${a / 1000}k` : '0'} – {b ? `${b / 1000}k` : '∞'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h4>Kích thước</h4>
          <div className="size-btns">{allSizes.map((s) => <button key={s} className={`size-btn${sizes.includes(s) ? ' on' : ''}`} onClick={() => toggle('size', s, sizes)}>{s}</button>)}</div>
        </div>
        <div>
          <h4>Màu sắc</h4>
          <div className="swatches">
            {allColors.map((c) => <button key={c} className={`swatch${colors.includes(c) ? ' on' : ''}`} style={{ background: colorHex(c) }} title={c} aria-label={c} onClick={() => toggle('color', c, colors)} />)}
          </div>
          {colors.length > 0 && <p className="muted small" style={{ marginTop: 6 }}>{colors.join(', ')}</p>}
        </div>
        <div>
          <h4>Dành cho</h4>
          <div className="chips">
            {(['', 'Nữ', 'Nam'] as const).map((g) => <button key={g} className={`chip${gender === g ? ' active' : ''}`} onClick={() => update({ gender: g })}>{g || 'Tất cả'}</button>)}
          </div>
        </div>
        <label className="checkbox"><input type="checkbox" checked={inStock} onChange={(e) => update({ stock: e.target.checked ? '1' : undefined })} /> Chỉ hàng còn sẵn</label>
        {hasFilters && <button className="btn btn-sm" onClick={() => setParams(mode ? { mode } : {})}>Xóa bộ lọc</button>}
      </aside>

      <section>
        <div className="catalog-top">
          <div>
            <h1>{title}</h1>
            <p className="muted">{products.length} sản phẩm</p>
          </div>
          <div className="row">
            <button className="btn filter-toggle" onClick={() => setOpen((v) => !v)}><SlidersHorizontal /> Bộ lọc</button>
            <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sắp xếp">
              <option value="featured">Nổi bật</option>
              <option value="newest">Mới nhất</option>
              <option value="price-asc">Giá thấp → cao</option>
              <option value="price-desc">Giá cao → thấp</option>
              <option value="rating">Đánh giá cao</option>
            </select>
          </div>
        </div>
        {products.length ? (
          <div className="product-grid">{products.map((p) => <ProductCard key={p.id} product={p} preferRental={mode === 'rental'} />)}</div>
        ) : (
          <Empty title="Không tìm thấy sản phẩm phù hợp"><span>Thử bỏ bớt bộ lọc hoặc hỏi trợ lý AI ở góc phải màn hình.</span></Empty>
        )}
      </section>
    </div>
  )
}
