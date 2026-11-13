import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { CartItem, DeliveryMethod, PaymentMethod, Product } from '../../types'
import { getDb, useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { canRent, canSell, categoryName, productImage, productVariants, rentalAvailable } from '../../services/catalog'
import { placeOrders, quote, resolveLine, type CheckoutLine } from '../../services/orders'
import { savePerson } from '../../services/people'
import { addDays, date, matches, money, today } from '../../lib/format'
import { Empty, Field, Modal, SearchBox, Chips } from '../../components/ui'
import { useAction } from '../../components/feedback'

type DraftItem = Omit<CartItem, 'id'> & { id: string }

export function Pos() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'all' | 'sale' | 'rental'>('all')
  const [picking, setPicking] = useState<Product>()
  const [items, setItems] = useState<DraftItem[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [walkIn, setWalkIn] = useState({ name: '', phone: '', address: '', save: true })
  const [delivery, setDelivery] = useState<DeliveryMethod>('pickup')
  const [payment, setPayment] = useState<PaymentMethod>('cash')
  const [coupon, setCoupon] = useState('')
  const [handOver, setHandOver] = useState(true)
  const [note, setNote] = useState('')

  const products = db.products
    .filter((p) => p.status === 'active')
    .filter((p) => (mode === 'sale' ? canSell(p) : mode === 'rental' ? canRent(p) : true))
    .filter((p) => matches(query, p.name, categoryName(db, p.categoryId), ...productVariants(db, p.id).map((v) => v.sku)))
  const customer = db.users.find((u) => u.id === customerId)
  const customerMatches = customerQuery.length >= 2 ? db.users.filter((u) => u.role === 'customer' && matches(customerQuery, u.fullName, u.phone, u.email)).slice(0, 6) : []
  const lines = items.map((i) => resolveLine(db, i)).filter((l): l is CheckoutLine => Boolean(l))
  const q = quote(db, { lines, couponCode: coupon, deliveryMethod: delivery, customer })

  const setQty = (id: string, quantity: number) => setItems((list) => list.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i)))

  const submit = async () => {
    const ok = await run(() => {
      let buyer = customer
      if (!buyer && walkIn.save && walkIn.phone) {
        buyer = getDb().users.find((u) => u.phone === walkIn.phone.replace(/\s/g, ''))
        buyer ??= savePerson(user.id, { fullName: walkIn.name, phone: walkIn.phone, email: '', address: walkIn.address })
      }
      const created = placeOrders({
        lines, couponCode: coupon, deliveryMethod: delivery, customer: buyer, customerName: buyer?.fullName ?? walkIn.name, phone: buyer?.phone ?? walkIn.phone,
        address: delivery === 'delivery' ? walkIn.address || buyer?.addresses.find((a) => a.isDefault)?.line || '' : '', paymentMethod: payment,
        channel: 'store', createdBy: user.id, handOverNow: handOver, note,
      })
      navigate(`/admin/${created[0].type === 'sale' ? 'don-mua' : 'don-thue'}?id=${created[0].id}`)
    }, 'Đã tạo đơn tại cửa hàng')
    if (ok) setItems([])
  }

  return (
    <>
      <div className="page-head">
        <div><h2>Tạo đơn tại cửa hàng</h2><p>Bán hoặc cho thuê trực tiếp cho khách đến cửa hàng.</p></div>
      </div>
      <div className="pos">
        <section className="card">
          <div className="toolbar">
            <SearchBox value={query} onChange={setQuery} placeholder="Tên sản phẩm, danh mục hoặc SKU…" />
            <Chips value={mode} onChange={setMode} items={[{ value: 'all', label: 'Tất cả' }, { value: 'sale', label: 'Bán' }, { value: 'rental', label: 'Cho thuê' }]} />
          </div>
          <div className="pos-products">
            {products.map((p) => (
              <button key={p.id} className="pos-product" onClick={() => setPicking(p)}>
                <img src={productImage(db, p)} alt="" />
                <strong>{p.name}</strong>
                <span>{canSell(p) ? money(p.salePrice) : ''}{p.mode === 'both' && ' · '}{canRent(p) ? `${money(p.rentalPricePerDay)}/ngày` : ''}</span>
              </button>
            ))}
          </div>
          {products.length === 0 && <Empty title="Không tìm thấy sản phẩm" />}
        </section>

        <section className="card pos-cart">
          <div className="card-head"><h3>Đơn đang tạo</h3><span className="muted">{lines.length} dòng</span></div>
          {lines.length === 0 && <Empty title="Chọn sản phẩm ở bên trái" />}
          {lines.map((l) => (
            <div key={l.key} className="pos-line">
              <div>
                <strong>{l.product.name}</strong>
                <div className="muted small">{l.variant.size} / {l.variant.color} · {l.mode === 'sale' ? 'Mua' : `Thuê ${date(l.rentalStart)} → ${date(l.rentalEnd)} (${l.days} ngày)`}</div>
                {l.quantity > l.available && <div className="danger-text small">Chỉ còn {l.available} khả dụng</div>}
              </div>
              <strong className="right">{money(l.lineTotal)}{l.deposit > 0 && <div className="muted small">cọc {money(l.deposit)}</div>}</strong>
              <div className="qty">
                <button onClick={() => setQty(l.key, l.quantity - 1)} aria-label="Giảm"><Minus size={14} /></button>
                <span>{l.quantity}</span>
                <button onClick={() => setQty(l.key, l.quantity + 1)} aria-label="Tăng"><Plus size={14} /></button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setItems((list) => list.filter((i) => i.id !== l.key))}><Trash2 /> Bỏ</button>
            </div>
          ))}

          <div className="card-body stack">
            <Field label="Khách hàng">
              {customer ? (
                <div className="row-between">
                  <span><strong>{customer.fullName}</strong> · {customer.phone} · {customer.points} điểm</span>
                  <button className="btn btn-sm" onClick={() => setCustomerId('')}>Đổi</button>
                </div>
              ) : (
                <div className="stack-sm">
                  <SearchBox value={customerQuery} onChange={setCustomerQuery} placeholder="Tìm khách theo tên / SĐT" />
                  {customerMatches.map((c) => (
                    <button key={c.id} className="btn btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setCustomerId(c.id); setCustomerQuery('') }}>
                      {c.fullName} · {c.phone}
                    </button>
                  ))}
                  <div className="grid-2">
                    <input className="input" placeholder="Tên khách vãng lai" value={walkIn.name} onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })} />
                    <input className="input" placeholder="Số điện thoại" value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} />
                  </div>
                  <label className="checkbox small"><input type="checkbox" checked={walkIn.save} onChange={(e) => setWalkIn({ ...walkIn, save: e.target.checked })} /> Lưu thành hồ sơ khách hàng</label>
                </div>
              )}
            </Field>
            <div className="grid-2">
              <Field label="Nhận hàng">
                <select className="select" value={delivery} onChange={(e) => setDelivery(e.target.value as DeliveryMethod)}>
                  <option value="pickup">Tại cửa hàng</option>
                  <option value="delivery">Giao tận nơi</option>
                </select>
              </Field>
              <Field label="Thanh toán">
                <select className="select" value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
                  <option value="cash">Tiền mặt</option>
                  <option value="card">Thẻ / ví điện tử</option>
                  <option value="bank">Chuyển khoản</option>
                </select>
              </Field>
            </div>
            {delivery === 'delivery' && (
              <Field label="Địa chỉ giao"><input className="input" value={walkIn.address} onChange={(e) => setWalkIn({ ...walkIn, address: e.target.value })} placeholder={customer?.addresses.find((a) => a.isDefault)?.line ?? 'Số nhà, đường, phường, quận'} /></Field>
            )}
            <Field label="Mã giảm giá" hint={q.couponError && coupon ? <span className="danger-text">{q.couponError}</span> : q.couponDiscount ? `Giảm ${money(q.couponDiscount)}` : undefined}>
              <input className="input" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="VD: PANDA10" />
            </Field>
            <Field label="Ghi chú"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <label className="checkbox"><input type="checkbox" checked={handOver} onChange={(e) => setHandOver(e.target.checked)} /> Giao hàng/đồ thuê cho khách ngay tại quầy</label>

            <div>
              <div className="summary-row"><span className="muted">Tiền hàng</span><span>{money(q.subtotal.sale + q.subtotal.rental)}</span></div>
              {q.couponDiscount > 0 && <div className="summary-row"><span className="muted">Giảm giá</span><span>−{money(q.couponDiscount)}</span></div>}
              {q.shippingFee > 0 && <div className="summary-row"><span className="muted">Phí giao</span><span>{money(q.shippingFee)}</span></div>}
              {q.deposit > 0 && <div className="summary-row"><span className="muted">Tiền cọc</span><span>{money(q.deposit)}</span></div>}
              <div className="summary-row total"><span>Khách cần trả</span><span>{money(q.total)}</span></div>
            </div>
            <button className="btn btn-primary btn-lg btn-block" disabled={!lines.length} onClick={() => void submit()}>Tạo đơn</button>
          </div>
        </section>
      </div>
      {picking && <PickVariant product={picking} onClose={() => setPicking(undefined)} onPick={(item) => { setItems((list) => [...list, item]); setPicking(undefined) }} />}
    </>
  )
}

function PickVariant({ product, onClose, onPick }: { product: Product; onClose: () => void; onPick: (item: DraftItem) => void }) {
  const db = useDb()
  const variants = productVariants(db, product.id)
  const [variantId, setVariantId] = useState(variants.find((v) => v.stock > 0)?.id ?? variants[0]?.id)
  const [mode, setMode] = useState<'sale' | 'rental'>(canSell(product) ? 'sale' : 'rental')
  const [start, setStart] = useState(today())
  const [end, setEnd] = useState(addDays(today(), 1))
  const [quantity, setQuantity] = useState(1)
  const variant = variants.find((v) => v.id === variantId)
  const available = variant ? (mode === 'rental' ? rentalAvailable(db, variant.id, start, end) : variant.stock) : 0
  return (
    <Modal
      title={product.name}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn btn-primary" disabled={!variant || quantity > available} onClick={() => onPick({ id: `${variantId}-${Date.now()}`, variantId: variantId!, mode, quantity, rentalStart: mode === 'rental' ? start : undefined, rentalEnd: mode === 'rental' ? end : undefined })}>Thêm vào đơn</button></>}
    >
      <div className="stack">
        {product.mode === 'both' && <Chips value={mode} onChange={setMode} items={[{ value: 'sale', label: `Mua · ${money(product.salePrice)}` }, { value: 'rental', label: `Thuê · ${money(product.rentalPricePerDay)}/ngày` }]} />}
        <Field label="Biến thể">
          <select className="select" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.size} / {v.color} — {v.sku} (tồn {v.stock})</option>)}
          </select>
        </Field>
        {mode === 'rental' && (
          <div className="grid-2">
            <Field label="Ngày nhận"><input className="input" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} /></Field>
            <Field label="Ngày trả"><input className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Số lượng" hint={`Khả dụng: ${available}`}>
          <input className="input" type="number" min={1} max={available} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
        </Field>
      </div>
    </Modal>
  )
}
