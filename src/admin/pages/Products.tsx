import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EyeOff, Eye, Plus, Trash2 } from 'lucide-react'
import type { Gender, Product, ProductMode } from '../../types'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { categoryName, deleteProduct, productImage, productRating, productVariants, saveProduct, setProductStatus, totalStock, type ProductInput, type VariantInput } from '../../services/catalog'
import { MODE_LABEL } from '../../services/labels'
import type { ProductDraft } from '../../services/ai'
import { matches, money, normalize } from '../../lib/format'
import { Badge, Empty, Field, ImageUploader, Modal, SearchBox, Stars } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'

export function Products() {
  const db = useDb()
  const user = useAdminUser()!
  const manager = user.role === 'manager'
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [mode, setMode] = useState<'' | ProductMode>('')
  const [status, setStatus] = useState<'' | Product['status']>('')
  const [editing, setEditing] = useState<{ product?: Product; draft?: ProductDraft }>()
  const openId = params.get('id')
  const opened = openId ? db.products.find((p) => p.id === openId) : undefined

  const list = db.products
    .filter((p) => !category || p.categoryId === category)
    .filter((p) => !mode || p.mode === mode || (mode !== 'both' && p.mode === 'both'))
    .filter((p) => !status || p.status === status)
    .filter((p) => matches(query, p.name, ...productVariants(db, p.id).map((v) => v.sku)))

  const close = () => {
    setEditing(undefined)
    if (openId) setParams({})
  }
  const current = editing ?? (opened ? { product: opened } : undefined)

  return (
    <>
      <div className="page-head">
        <div><h2>Sản phẩm</h2><p>{db.products.length} sản phẩm · {db.variants.length} biến thể. {manager ? '' : 'Bạn đang ở chế độ tra cứu.'}</p></div>
        {manager && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus /> Thêm sản phẩm</button>}
      </div>
      <section className="card">
        <div className="toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="Tên sản phẩm hoặc SKU…" />
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Mọi danh mục</option>
            {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="">Bán & cho thuê</option>
            <option value="sale">Có bán</option>
            <option value="rental">Có cho thuê</option>
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Mọi trạng thái</option>
            <option value="active">Đang kinh doanh</option>
            <option value="hidden">Ngừng kinh doanh</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Hình thức</th><th className="num">Giá bán</th><th className="num">Giá thuê / cọc</th><th className="num">Tồn</th><th>Đánh giá</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const rating = productRating(db, p.id)
                const stock = totalStock(db, p.id)
                return (
                  <tr key={p.id} className="clickable" onClick={() => setEditing({ product: p })}>
                    <td>
                      <div className="cell-product">
                        <img className="thumb" src={productImage(db, p)} alt="" />
                        <div><strong>{p.name}</strong><div className="muted small">{productVariants(db, p.id).length} biến thể · {p.gender}</div></div>
                      </div>
                    </td>
                    <td>{categoryName(db, p.categoryId)}</td>
                    <td>{MODE_LABEL[p.mode]}</td>
                    <td className="num">{p.mode !== 'rental' ? money(p.salePrice) : '—'}</td>
                    <td className="num">{p.mode !== 'sale' ? <>{money(p.rentalPricePerDay)}/ngày<div className="muted small">cọc {money(p.deposit)}</div></> : '—'}</td>
                    <td className="num">{stock <= 2 ? <Badge tone={stock ? 'warning' : 'danger'}>{stock}</Badge> : stock}</td>
                    <td>{rating.count ? <Stars value={rating.avg} count={rating.count} /> : <span className="muted">—</span>}</td>
                    <td>{p.status === 'active' ? <Badge tone="success">Đang bán</Badge> : <Badge>Ngừng KD</Badge>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty title="Không có sản phẩm phù hợp" />}
        </div>
      </section>
      {current && <ProductForm product={current.product} draft={current.draft} readOnly={!manager} onClose={close} />}
    </>
  )
}

const emptyInput = (): ProductInput => ({
  name: '', categoryId: '', supplierId: '', collectionId: '', description: '', material: '', gender: 'Unisex', images: [], mode: 'sale',
  salePrice: 0, rentalPricePerDay: 0, deposit: 0, status: 'active', featured: false, variants: [{ sku: '', size: 'M', color: '', stock: 0 }],
})

export function ProductForm({ product, draft, readOnly, onClose }: { product?: Product; draft?: ProductDraft; readOnly?: boolean; onClose: () => void }) {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const { confirm } = useFeedback()
  const [form, setForm] = useState<ProductInput>(() => {
    if (product) return { ...product, variants: productVariants(db, product.id).map((v) => ({ ...v })) }
    return { ...emptyInput(), ...draft, variants: draft?.variants ?? emptyInput().variants }
  })
  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setVariant = (index: number, patch: Partial<VariantInput>) => set('variants', form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  const suggestSku = (index: number) => {
    const v = form.variants[index]
    const base = normalize(form.name).replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'SP'
    const color = normalize(v.color).replace(/[^a-z]/g, '').slice(0, 2).toUpperCase() || 'XX'
    setVariant(index, { sku: `${base}-${color}-${v.size.replace(/\s/g, '').toUpperCase()}` })
  }

  const save = async () => {
    const ok = await run(() => saveProduct(user.id, { ...form, supplierId: form.supplierId || undefined, collectionId: form.collectionId || undefined }, product?.id), product ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm')
    if (ok) onClose()
  }
  const remove = async () => {
    if (!product || !(await confirm({ title: 'Xóa sản phẩm?', message: `Xóa vĩnh viễn "${product.name}" và các biến thể. Sản phẩm đã có đơn hàng chỉ có thể ngừng kinh doanh.`, danger: true, confirmLabel: 'Xóa' }))) return
    if (await run(() => deleteProduct(user.id, product.id), 'Đã xóa sản phẩm')) onClose()
  }

  return (
    <Modal
      wide
      title={readOnly ? form.name : product ? `Sửa: ${product.name}` : 'Thêm sản phẩm'}
      onClose={onClose}
      footer={
        readOnly ? <button className="btn" onClick={onClose}>Đóng</button> : (
          <>
            {product && <button className="btn btn-danger" onClick={() => void remove()}><Trash2 /> Xóa</button>}
            {product && (
              <button className="btn" onClick={() => void run(() => setProductStatus(user.id, product.id, product.status === 'active' ? 'hidden' : 'active'), 'Đã cập nhật trạng thái').then((ok) => ok && onClose())}>
                {product.status === 'active' ? <><EyeOff /> Ngừng kinh doanh</> : <><Eye /> Mở bán lại</>}
              </button>
            )}
            <div className="grow" />
            <button className="btn" onClick={onClose}>Hủy</button>
            <button className="btn btn-primary" onClick={() => void save()}>Lưu sản phẩm</button>
          </>
        )
      }
    >
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        {draft && <div className="form-note">Bản nháp do trợ lý AI tạo — kiểm tra lại thông tin trước khi lưu.</div>}
        <div className="grid-2">
          <Field label="Tên sản phẩm" className="span-2"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Danh mục">
            <select className="select" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Chọn —</option>
              {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Giới tính">
            <select className="select" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
              <option>Nữ</option><option>Nam</option><option>Unisex</option>
            </select>
          </Field>
          <Field label="Nhà cung cấp">
            <select className="select" value={form.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">— Không —</option>
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Bộ sưu tập">
            <select className="select" value={form.collectionId ?? ''} onChange={(e) => set('collectionId', e.target.value)}>
              <option value="">— Không —</option>
              {db.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Chất liệu"><input className="input" value={form.material} onChange={(e) => set('material', e.target.value)} /></Field>
          <Field label="Hình thức kinh doanh">
            <select className="select" value={form.mode} onChange={(e) => set('mode', e.target.value as ProductMode)}>
              <option value="sale">Chỉ bán</option><option value="rental">Chỉ cho thuê</option><option value="both">Bán và cho thuê</option>
            </select>
          </Field>
          {form.mode !== 'rental' && <Field label="Giá bán (đ)"><input className="input" type="number" min={0} step={10000} value={form.salePrice} onChange={(e) => set('salePrice', Number(e.target.value))} /></Field>}
          {form.mode !== 'sale' && (
            <>
              <Field label="Giá thuê mỗi ngày (đ)"><input className="input" type="number" min={0} step={10000} value={form.rentalPricePerDay} onChange={(e) => set('rentalPricePerDay', Number(e.target.value))} /></Field>
              <Field label="Tiền cọc (đ)"><input className="input" type="number" min={0} step={50000} value={form.deposit} onChange={(e) => set('deposit', Number(e.target.value))} /></Field>
            </>
          )}
          <Field label="Mô tả" className="span-2"><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        </div>
        <Field label="Hình ảnh" hint="Tối đa 5 ảnh. Chưa có ảnh sẽ dùng hình minh họa theo danh mục.">
          <ImageUploader value={form.images} onChange={(v) => set('images', v)} />
        </Field>
        <label className="checkbox"><input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} /> Hiển thị ở mục nổi bật trang chủ</label>

        <div className="row-between">
          <h3 style={{ fontSize: 14 }}>Biến thể (size · màu · SKU · tồn kho)</h3>
          {!readOnly && <button type="button" className="btn btn-sm" onClick={() => set('variants', [...form.variants, { sku: '', size: '', color: form.variants.at(-1)?.color ?? '', stock: 0 }])}><Plus /> Thêm biến thể</button>}
        </div>
        <div className="card table-wrap">
          <table className="table variant-table">
            <thead><tr><th>Size</th><th>Màu</th><th>SKU</th><th>Tồn kho</th><th /></tr></thead>
            <tbody>
              {form.variants.map((v, i) => (
                <tr key={v.id ?? i}>
                  <td><input className="input input-sm" value={v.size} onChange={(e) => setVariant(i, { size: e.target.value })} placeholder="S, M, L…" /></td>
                  <td><input className="input input-sm" value={v.color} onChange={(e) => setVariant(i, { color: e.target.value })} placeholder="Đỏ" /></td>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                      <input className="input input-sm" value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} />
                      {!readOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={() => suggestSku(i)} title="Tạo mã tự động">Tự tạo</button>}
                    </div>
                  </td>
                  <td><input className="input input-sm" type="number" min={0} value={v.stock} onChange={(e) => setVariant(i, { stock: Math.max(0, Math.floor(Number(e.target.value))) })} /></td>
                  <td>{!readOnly && form.variants.length > 1 && <button type="button" className="icon-btn" onClick={() => set('variants', form.variants.filter((_, x) => x !== i))} aria-label="Xóa biến thể"><Trash2 /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {product && <p className="muted small">Thay đổi tồn kho ở đây được ghi thành phiếu điều chỉnh trong lịch sử kho.</p>}
      </fieldset>
    </Modal>
  )
}
