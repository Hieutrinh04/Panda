import type { Category, Collection, Database, Id, Product, Supplier, Variant } from '../types'
import { mutate } from '../data/store'
import { nowISO, today, uid } from '../lib/format'
import { productArt } from '../lib/art'
import { fail, log } from './core'

// ---------- Truy vấn ----------

export const productVariants = (db: Database, productId: Id) => db.variants.filter((v) => v.productId === productId)

export const totalStock = (db: Database, productId: Id) => productVariants(db, productId).reduce((s, v) => s + v.stock, 0)

export const categoryName = (db: Database, id?: Id) => db.categories.find((c) => c.id === id)?.name ?? '—'

export const canSell = (p: Product) => p.mode !== 'rental'
export const canRent = (p: Product) => p.mode !== 'sale'

export function productImage(db: Database, product: Product, color?: string) {
  if (product.images[0]) return product.images[0]
  const variant = productVariants(db, product.id).find((v) => !color || v.color === color)
  return productArt(categoryName(db, product.categoryId), variant?.color ?? '')
}

export function productRating(db: Database, productId: Id) {
  const list = db.reviews.filter((r) => r.productId === productId && !r.hidden)
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0
  return { avg, count: list.length }
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd

/** Số lượng biến thể đã được giữ cho các đơn thuê trùng khoảng ngày. */
export function bookedQuantity(db: Database, variantId: Id, start: string, end: string, excludeOrderId?: Id) {
  const now = today()
  return db.orders
    .filter((o) => o.type === 'rental' && o.id !== excludeOrderId && ['pending', 'confirmed', 'renting'].includes(o.status) && o.rental)
    .filter((o) => {
      // Đồ đang ở chỗ khách quá hạn vẫn bị giữ cho tới khi trả.
      const holdUntil = o.status === 'renting' && o.rental!.endDate < now ? now : o.rental!.endDate
      return overlaps(o.rental!.startDate, holdUntil, start, end)
    })
    .flatMap((o) => o.items)
    .filter((i) => i.variantId === variantId)
    .reduce((s, i) => s + i.quantity, 0)
}

export const rentalAvailable = (db: Database, variantId: Id, start: string, end: string, excludeOrderId?: Id) => {
  const variant = db.variants.find((v) => v.id === variantId)
  return variant ? Math.max(0, variant.stock - bookedQuantity(db, variantId, start, end, excludeOrderId)) : 0
}

/** Lịch thuê của một biến thể: các đơn giữ đồ, dùng cho màn hình lịch thuê. */
export const rentalBookings = (db: Database, variantId: Id) =>
  db.orders.filter((o) => o.type === 'rental' && ['pending', 'confirmed', 'renting'].includes(o.status) && o.items.some((i) => i.variantId === variantId))

// ---------- Sản phẩm ----------

export interface VariantInput { id?: Id; sku: string; size: string; color: string; stock: number }
export type ProductInput = Omit<Product, 'id' | 'createdAt'> & { variants: VariantInput[] }

function validateProduct(input: ProductInput) {
  if (input.name.trim().length < 2) fail('Tên sản phẩm quá ngắn.')
  if (!input.categoryId) fail('Vui lòng chọn danh mục.')
  if (input.mode !== 'rental' && input.salePrice <= 0) fail('Giá bán phải lớn hơn 0.')
  if (input.mode !== 'sale' && (input.rentalPricePerDay <= 0 || input.deposit < 0)) fail('Giá thuê phải lớn hơn 0 và tiền cọc không âm.')
  if (!input.variants.length) fail('Sản phẩm cần ít nhất một biến thể (size/màu).')
  const skus = input.variants.map((v) => v.sku.trim().toUpperCase())
  if (skus.some((s) => !s)) fail('Mỗi biến thể cần có mã SKU.')
  if (new Set(skus).size !== skus.length) fail('Mã SKU bị trùng trong cùng sản phẩm.')
  if (input.variants.some((v) => v.stock < 0 || !Number.isInteger(v.stock))) fail('Số lượng tồn phải là số nguyên không âm.')
}

export function saveProduct(userId: Id, input: ProductInput, productId?: Id) {
  validateProduct(input)
  return mutate((db) => {
    const { variants, ...fields } = input
    const otherSkus = new Set(db.variants.filter((v) => v.productId !== productId).map((v) => v.sku.toUpperCase()))
    const dup = variants.find((v) => otherSkus.has(v.sku.trim().toUpperCase()))
    if (dup) fail(`Mã SKU ${dup.sku} đã được dùng cho sản phẩm khác.`)

    let product = db.products.find((p) => p.id === productId)
    if (product) Object.assign(product, fields)
    else {
      product = { ...fields, id: uid('p-'), createdAt: nowISO() }
      db.products.unshift(product)
    }
    const id = product.id
    const keep = new Set(variants.filter((v) => v.id).map((v) => v.id))
    const removed = db.variants.filter((v) => v.productId === id && !keep.has(v.id))
    if (removed.some((v) => db.orders.some((o) => ['pending', 'confirmed', 'shipping', 'renting'].includes(o.status) && o.items.some((i) => i.variantId === v.id))))
      fail('Không thể xóa biến thể đang có trong đơn chưa hoàn tất.')
    db.variants = db.variants.filter((v) => v.productId !== id || keep.has(v.id))

    for (const v of variants) {
      const existing = db.variants.find((x) => x.id === v.id)
      const next = { sku: v.sku.trim().toUpperCase(), size: v.size.trim(), color: v.color.trim(), stock: v.stock }
      if (existing) {
        // Chênh lệch tồn kho khi sửa trực tiếp được ghi lại thành phiếu điều chỉnh.
        if (existing.stock !== v.stock)
          db.movements.unshift({ id: uid('mv-'), variantId: existing.id, type: 'adjust', quantity: v.stock - existing.stock, note: 'Cập nhật khi sửa sản phẩm', status: 'approved', userId, approvedBy: userId, createdAt: nowISO() })
        Object.assign(existing, next)
      } else {
        const variant: Variant = { id: uid('v-'), productId: id, ...next }
        db.variants.push(variant)
        if (v.stock > 0)
          db.movements.unshift({ id: uid('mv-'), variantId: variant.id, type: 'import', quantity: v.stock, note: 'Tồn kho ban đầu', status: 'approved', userId, approvedBy: userId, createdAt: nowISO() })
      }
    }
    log(db, userId, productId ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm', product.name)
    return product
  })
}

export function setProductStatus(userId: Id, productId: Id, status: Product['status']) {
  mutate((db) => {
    const product = db.products.find((p) => p.id === productId)!
    product.status = status
    log(db, userId, status === 'hidden' ? 'Ngừng kinh doanh sản phẩm' : 'Mở bán lại sản phẩm', product.name)
  })
}

export function deleteProduct(userId: Id, productId: Id) {
  mutate((db) => {
    if (db.orders.some((o) => o.items.some((i) => i.productId === productId)))
      fail('Sản phẩm đã phát sinh đơn hàng, chỉ có thể ngừng kinh doanh thay vì xóa.')
    const product = db.products.find((p) => p.id === productId)!
    db.products = db.products.filter((p) => p.id !== productId)
    db.variants = db.variants.filter((v) => v.productId !== productId)
    log(db, userId, 'Xóa sản phẩm', product.name)
  })
}

// ---------- Danh mục, nhà cung cấp, bộ sưu tập ----------

type TaxonomyKey = 'categories' | 'suppliers' | 'collections'
type TaxonomyItem = Category | Supplier | Collection
const TAXONOMY_LABEL: Record<TaxonomyKey, string> = { categories: 'danh mục', suppliers: 'nhà cung cấp', collections: 'bộ sưu tập' }
const PRODUCT_FIELD: Record<TaxonomyKey, keyof Product> = { categories: 'categoryId', suppliers: 'supplierId', collections: 'collectionId' }

export function saveTaxonomy(userId: Id, key: TaxonomyKey, item: Omit<TaxonomyItem, 'id'> & { id?: Id }) {
  if (!item.name.trim()) fail('Tên không được để trống.')
  mutate((db) => {
    const list = db[key] as TaxonomyItem[]
    if (list.some((x) => x.id !== item.id && x.name.trim().toLowerCase() === item.name.trim().toLowerCase())) fail(`Tên ${TAXONOMY_LABEL[key]} đã tồn tại.`)
    const existing = list.find((x) => x.id === item.id)
    if (existing) Object.assign(existing, item)
    else list.push({ ...item, id: uid(`${key.slice(0, 3)}-`) } as TaxonomyItem)
    log(db, userId, existing ? `Cập nhật ${TAXONOMY_LABEL[key]}` : `Thêm ${TAXONOMY_LABEL[key]}`, item.name)
  })
}

export function deleteTaxonomy(userId: Id, key: TaxonomyKey, id: Id) {
  mutate((db) => {
    const count = db.products.filter((p) => p[PRODUCT_FIELD[key]] === id).length
    if (count) fail(`Đang có ${count} sản phẩm thuộc ${TAXONOMY_LABEL[key]} này.`)
    const list = db[key] as TaxonomyItem[]
    const item = list.find((x) => x.id === id)
    ;(db[key] as TaxonomyItem[]) = list.filter((x) => x.id !== id)
    log(db, userId, `Xóa ${TAXONOMY_LABEL[key]}`, item?.name)
  })
}

// ---------- Yêu thích ----------

export function toggleWishlist(customerId: Id, productId: Id) {
  mutate((db) => {
    const list = db.wishlists[customerId] ?? []
    db.wishlists[customerId] = list.includes(productId) ? list.filter((x) => x !== productId) : [...list, productId]
  })
}
