// Trợ lý AI. Bản hiện tại hiểu câu hỏi tiếng Việt bằng bộ quy tắc chạy trên dữ
// liệu cục bộ. Khi có Supabase, askAssistant() có thể chuyển sang gọi một Edge
// Function dùng mô hình ngôn ngữ, giữ nguyên định dạng AiReply để giao diện
// không phải đổi.
import type { Database, Gender, Id, Product, User } from '../types'
import { getDb, isRemote, mutate } from '../data/store'
import { supabase } from '../lib/supabase'
import { addDays, money, normalize, nowISO, today, uid } from '../lib/format'
import { canRent, canSell, categoryName, productRating, productVariants, rentalAvailable, totalStock } from './catalog'
import { displayStatus, isOverdue, lateFeeFor } from './orders'
import { inventorySummary, reportSummary } from './reports'
import { tierOf, totalSpent } from './promotions'
import type { ProductInput } from './catalog'

export interface ProductDraft extends Partial<ProductInput> { name: string }

export type AiAction =
  | { kind: 'create-product'; label: string; draft: ProductDraft }
  | { kind: 'import-stock'; label: string; variantId: Id; quantity: number }

export interface AiReply {
  text: string
  products?: Product[]
  table?: { headers: string[]; rows: string[][] }
  links?: { label: string; to: string }[]
  action?: AiAction
}

export interface AiContext { scope: 'shop' | 'admin'; user?: User; cartProductIds?: Id[] }

// ---------- Phân tích câu hỏi ----------

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w))

function parseAmount(raw: string, unit?: string) {
  const n = Number(raw.replace(',', '.'))
  if (!unit) return n < 1000 ? n * 1000 : n
  if (/^(tr|trieu|m|cu)/.test(unit)) return n * 1_000_000
  return n * 1000
}

/** Tìm khoảng giá trong câu: "dưới 500k", "từ 1tr", "tầm 300 nghìn". */
function parseBudget(q: string): { min?: number; max?: number } {
  const re = /(duoi|toi da|khong qua|it hon|<|tren|tu|hon|>|tam|khoang|gia)?\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu|m|cu)?\b/g
  for (const m of q.matchAll(re)) {
    const [, word, num, unit] = m
    if (!word && !unit) continue
    const amount = parseAmount(num, unit)
    if (amount < 10_000) continue
    if (word && /duoi|toi da|khong qua|it hon|</.test(word)) return { max: amount }
    if (word && /tren|tu|hon|>/.test(word)) return { min: amount }
    return { min: amount * 0.7, max: amount * 1.3 }
  }
  return {}
}

const CATEGORY_WORDS: [string[], string[]][] = [
  [['áo dài'], ['Áo dài']],
  [['vest', 'tuxedo', 'com lê', 'suit'], ['Vest nam']],
  [['đầm', 'dạ hội', 'váy dạ hội'], ['Dạ tiệc']],
  [['váy'], ['Váy', 'Dạ tiệc']],
  [['kimono', 'hanbok', 'hóa trang', 'cosplay'], ['Hóa trang']],
  [['phụ kiện', 'túi', 'cà vạt', 'khăn', 'mấn', 'nơ'], ['Phụ kiện']],
]

const OCCASIONS: [string[], { categories?: string[]; collection?: string; label: string }][] = [
  [['cuoi', 'dam cuoi', 'an hoi', 'dam hoi'], { collection: 'col-wedding', label: 'đám cưới' }],
  [['tet', 'xuan', 'chup anh gia dinh'], { collection: 'col-tet', label: 'dịp Tết' }],
  [['tiec', 'prom', 'su kien', 'gala'], { categories: ['Dạ tiệc', 'Váy', 'Vest nam'], label: 'dự tiệc' }],
  [['le hoi', 'halloween', 'hoa trang', 'cosplay'], { categories: ['Hóa trang'], label: 'lễ hội' }],
  [['cong so', 'phong van', 'di lam'], { categories: ['Vest nam'], label: 'công sở' }],
]

const COLORS: [string, string][] = [['trang', 'trắng'], ['den', 'đen'], ['do', 'đỏ'], ['hong', 'hồng'], ['xanh', 'xanh'], ['vang', 'vàng'], ['be', 'be'], ['xam', 'xám'], ['tim', 'tím'], ['nau', 'nâu'], ['champagne', 'champagne']]

interface ProductQuery {
  mode?: 'sale' | 'rental'
  gender?: Gender
  /** Danh mục khách nói rõ (bắt buộc khớp). */
  categories?: string[]
  /** Danh mục/bộ sưu tập suy ra từ dịp mặc (chỉ dùng để ưu tiên hoặc lọc khi không có danh mục rõ). */
  occasionCategories?: string[]
  collection?: string
  colors: string[]
  sizes: string[]
  min?: number
  max?: number
  words: string[]
  occasion?: string
}

const STOP = new Set(['toi', 'minh', 'em', 'muon', 'can', 'tim', 'cho', 'do', 'trang', 'phuc', 'giup', 'voi', 'mot', 'cai', 'bo', 'nao', 'co', 'khong', 'gi', 'di', 'mac', 'de', 'la', 'thue', 'mua', 'nam', 'nu', 'gia', 'duoi', 'tren', 'tam', 'khoang', 'k', 'size', 'mau', 'nhe', 'a', 'ban', 'shop', 'goi', 'y', 'nhung', 'cac', 'dang'])

function parseProductQuery(q: string, raw: string): ProductQuery {
  const query: ProductQuery = { colors: [], sizes: [], words: [], ...parseBudget(q) }
  if (has(q, 'thue', 'muon')) query.mode = 'rental'
  else if (has(q, 'mua', 'so huu')) query.mode = 'sale'
  if (/\b(nu|con gai|ban gai|vo|co dau)\b/.test(q)) query.gender = 'Nữ'
  else if (/\b(nam|con trai|ban trai|chong|chu re)\b/.test(q)) query.gender = 'Nam'
  // Câu có dấu thì so trên câu gốc để phân biệt "đầm"/"đám", "đồ"/"đỏ"; câu không dấu thì so bản bỏ dấu.
  const accented = normalize(raw) !== raw.toLowerCase().trim()
  const lower = ` ${raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  // Với câu không dấu, "dam cuoi"/"dam hoi" là dịp (đám cưới), không phải "đầm".
  const hasWord = (word: string) => (accented ? lower.includes(` ${word} `) : new RegExp(`\\b${normalize(word)}\\b(?!\\s+(cuoi|hoi)\\b)`).test(q))
  for (const [words, cats] of CATEGORY_WORDS) if (words.some(hasWord)) { query.categories = cats; break }
  for (const [words, occasion] of OCCASIONS)
    if (has(q, ...words)) {
      query.occasion = occasion.label
      query.collection = occasion.collection
      query.occasionCategories = occasion.categories
      break
    }
  // Câu không dấu chỉ nhận màu khi có chữ "mau" đứng trước, tránh nhầm "do" (đồ) thành "đỏ".
  query.colors = COLORS.filter(([plain, label]) => (accented ? hasWord(label) : new RegExp(`\\bmau\\s+${plain}\\b`).test(q))).map(([c]) => c)
  query.sizes = [...q.matchAll(/\bsize\s*(xs|s|m|l|xl|xxl)\b|\b(xs|xl|xxl)\b/g)].map((m) => (m[1] || m[2]).toUpperCase())
  query.words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w))
  return query
}

const priceFor = (p: Product, mode?: 'sale' | 'rental') => (mode === 'rental' || (!mode && p.mode === 'rental') ? p.rentalPricePerDay : p.salePrice)

export function searchProducts(db: Database, query: ProductQuery) {
  const scored = db.products
    .filter((p) => p.status === 'active')
    .filter((p) => (query.mode === 'rental' ? canRent(p) : query.mode === 'sale' ? canSell(p) : true))
    .filter((p) => !query.gender || p.gender === query.gender || p.gender === 'Unisex')
    .filter((p) => !query.categories || query.categories.includes(categoryName(db, p.categoryId)))
    .filter((p) => query.categories || (!query.occasionCategories && !query.collection) || query.occasionCategories?.includes(categoryName(db, p.categoryId)) || p.collectionId === query.collection)
    .filter((p) => {
      const price = priceFor(p, query.mode)
      return (!query.min || price >= query.min) && (!query.max || price <= query.max)
    })
    // So khớp theo từng từ: "vàng đồng" (vang dong) không được tính là "đỏ" (do).
    .filter((p) => !query.colors.length || productVariants(db, p.id).some((v) => query.colors.some((c) => normalize(v.color).split(/\s+/).includes(c))))
    .filter((p) => !query.sizes.length || productVariants(db, p.id).some((v) => query.sizes.includes(v.size.toUpperCase())))
    .filter((p) => totalStock(db, p.id) > 0)
    .map((p) => {
      const text = normalize(`${p.name} ${categoryName(db, p.categoryId)} ${p.description} ${p.material}`)
      let score = query.words.filter((w) => text.includes(w)).length * 2
      if (query.collection && p.collectionId === query.collection) score += 2
      if (p.featured) score += 1
      score += productRating(db, p.id).avg / 5
      return { p, score }
    })
  return scored.sort((a, b) => b.score - a.score).map((x) => x.p)
}

const describeFilters = (q: ProductQuery) =>
  [
    q.mode === 'rental' ? 'cho thuê' : q.mode === 'sale' ? 'để mua' : '',
    q.occasion ? `cho ${q.occasion}` : '',
    q.gender ? `dành cho ${q.gender.toLowerCase()}` : '',
    q.colors.length ? `màu ${q.colors.map((c) => COLORS.find(([n]) => n === c)?.[1] ?? c).join(', ')}` : '',
    q.sizes.length ? `size ${q.sizes.join(', ')}` : '',
    q.max ? `dưới ${money(q.max)}` : q.min ? `từ ${money(q.min)}` : '',
  ].filter(Boolean).join(', ')

// ---------- Trả lời cho khách hàng ----------

function shopFaq(db: Database, q: string): AiReply | undefined {
  const s = db.settings
  if (has(q, 'tre han', 'tra tre', 'phi tre', 'qua han')) return { text: `Nếu trả đồ thuê trễ hạn, phí trễ là ${s.lateFeePercentPerDay}% giá thuê mỗi ngày trễ, được trừ vào tiền cọc khi hoàn cọc. Bạn có thể gửi yêu cầu gia hạn trong trang Đơn hàng trước ngày trả.` }
  if (has(q, 'coc', 'dat coc')) return { text: 'Mỗi mẫu cho thuê có mức cọc riêng (hiển thị ở trang sản phẩm). Tiền cọc được hoàn lại khi bạn trả đồ đúng hạn và nguyên vẹn; phí trễ hoặc phí bồi thường (nếu có) sẽ được khấu trừ.' }
  if (has(q, 'doi tra', 'hoan tien', 'tra hang', 'doi size')) return { text: 'Đơn mua được hỗ trợ đổi trả trong 7 ngày sau khi nhận hàng. Bạn vào Tài khoản → Đơn hàng → chọn đơn → "Yêu cầu đổi trả". Panda sẽ xác nhận và hoàn tiền sau khi nhận lại sản phẩm.', links: [{ label: 'Đơn hàng của tôi', to: '/tai-khoan/don-hang' }] }
  if (has(q, 'giao hang', 'ship', 'van chuyen', 'phi giao')) return { text: `Phí giao hàng ${money(s.shippingFee)}, miễn phí cho đơn từ ${money(s.freeShippingFrom)}. Bạn cũng có thể chọn nhận tại cửa hàng.` }
  if (has(q, 'dia chi', 'cua hang o dau', 'mo cua', 'gio', 'hotline', 'lien he')) return { text: `${s.storeName} — ${s.address}. Giờ mở cửa: ${s.openHours}. Hotline/Zalo: ${s.hotline}.` }
  if (has(q, 'ma giam', 'khuyen mai', 'uu dai', 'voucher', 'coupon')) {
    const live = db.coupons.filter((c) => c.active && c.startAt <= today() && today() <= c.endAt && c.used < c.usageLimit)
    return { text: live.length ? `Các mã đang áp dụng:\n${live.map((c) => `• ${c.code}: ${c.description}`).join('\n')}` : 'Hiện chưa có mã giảm giá nào đang chạy.' }
  }
  if (has(q, 'diem', 'hang thanh vien', 'tich diem')) return { text: `Cứ mỗi ${money(s.pointsPerAmount)} chi tiêu bạn nhận 1 điểm, mỗi điểm trị giá ${money(s.pointValue)} khi thanh toán. Hạng thành viên: ${s.tiers.map((t) => `${t.name} (từ ${money(t.minSpent)})`).join(', ')}.` }
  return undefined
}

function shopOrderLookup(db: Database, q: string, user?: User): AiReply | undefined {
  const code = q.match(/pd\d{6,}/)?.[0]?.toUpperCase()
  if (!code && !has(q, 'don cua toi', 'don hang cua', 'trang thai don', 'kiem tra don')) return undefined
  if (!user) return { text: 'Bạn vui lòng đăng nhập để mình tra cứu đơn hàng nhé.', links: [{ label: 'Đăng nhập', to: '/dang-nhap' }] }
  const orders = db.orders.filter((o) => o.customerId === user.id && (!code || o.code === code))
  if (!orders.length) return { text: code ? `Mình không tìm thấy đơn ${code} trong tài khoản của bạn.` : 'Bạn chưa có đơn hàng nào.' }
  return {
    text: code ? `Thông tin đơn ${code}:` : 'Các đơn gần đây của bạn:',
    table: { headers: ['Mã đơn', 'Loại', 'Trạng thái', 'Tổng'], rows: orders.slice(0, 5).map((o) => [o.code, o.type === 'sale' ? 'Mua' : 'Thuê', displayStatus(o)[0], money(o.total)]) },
    links: orders.slice(0, 1).map((o) => ({ label: `Xem đơn ${o.code}`, to: `/tai-khoan/don-hang/${o.id}` })),
  }
}

function answerShop(db: Database, question: string, ctx: AiContext): AiReply {
  const q = normalize(question)
  if (/^(xin chao|chao|hello|hi)\b/.test(q)) return { text: `Chào ${ctx.user?.fullName.split(' ').at(-1) ?? 'bạn'}! Bạn cần tìm trang phục cho dịp nào? Mình có thể gợi ý theo dịp, ngân sách, màu sắc, size hoặc mua/thuê.` }
  const faq = shopFaq(db, q)
  if (faq) return faq
  const order = shopOrderLookup(db, q, ctx.user)
  if (order) return order

  const query = parseProductQuery(q, question)
  let results = searchProducts(db, query)
  const filters = describeFilters(query)
  if (!results.length && query.words.length) results = searchProducts(db, { ...query, words: [] })
  if (results.length) return { text: `Mình tìm được ${results.length} mẫu${filters ? ` ${filters}` : ''}. Đây là những gợi ý phù hợp nhất:`, products: results.slice(0, 4) }

  // Không khớp: gợi ý theo giỏ hàng / lịch sử mua thuê.
  const history = new Set([...(ctx.cartProductIds ?? []), ...db.orders.filter((o) => o.customerId === ctx.user?.id).flatMap((o) => o.items.map((i) => i.productId))])
  const cats = new Set(db.products.filter((p) => history.has(p.id)).map((p) => p.categoryId))
  const similar = db.products.filter((p) => p.status === 'active' && cats.has(p.categoryId) && !history.has(p.id)).slice(0, 4)
  if (similar.length) return { text: `Mình chưa tìm thấy mẫu đúng yêu cầu${filters ? ` (${filters})` : ''}. Dựa trên những món bạn quan tâm, bạn có thể thích:`, products: similar }
  return { text: 'Mình chưa tìm được mẫu phù hợp. Bạn thử nói rõ hơn: dịp mặc (cưới, tiệc, Tết…), nam hay nữ, ngân sách, màu sắc hoặc muốn mua hay thuê nhé.', products: db.products.filter((p) => p.featured && p.status === 'active').slice(0, 4) }
}

// ---------- Trả lời cho quản lý / nhân viên ----------

function dateRange(q: string): [string, string, string] {
  const t = today()
  if (has(q, 'hom qua')) return [addDays(t, -1), addDays(t, -1), 'hôm qua']
  if (has(q, 'tuan nay', '7 ngay', 'tuan qua')) return [addDays(t, -6), t, '7 ngày qua']
  if (has(q, 'thang truoc')) {
    const d = new Date()
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const last = new Date(d.getFullYear(), d.getMonth(), 0)
    return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10), 'tháng trước']
  }
  if (has(q, 'thang nay', 'thang')) return [`${t.slice(0, 8)}01`, t, 'tháng này']
  if (has(q, '30 ngay')) return [addDays(t, -29), t, '30 ngày qua']
  return [t, t, 'hôm nay']
}

function parseProductDraft(db: Database, question: string): ProductDraft | undefined {
  const q = normalize(question)
  // Không dùng \b vì JavaScript coi chữ có dấu là ký tự ngắt từ.
  const nameMatch = question.match(/(?:thêm|tạo|nhập)\s+(?:sản phẩm|mẫu|sp)\s+(.+?)(?=\s+(?:giá|gia|size|màu|mau|số lượng|so luong|sl|danh mục|danh muc|cho thuê|cho thue|thuê|cọc|coc)(?:\s|\d|$)|,|$)/i)
  if (!nameMatch) return undefined
  const num = (re: RegExp) => {
    const m = q.match(re)
    return m ? parseAmount(m[1], m[2]) : undefined
  }
  const salePrice = num(/\bgia(?: ban)?\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|tr|trieu|m)?/)
  const rentalPrice = num(/\bthue\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|tr|trieu|m)?/)
  const deposit = num(/\bcoc\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|tr|trieu|m)?/)
  const sizes = (q.match(/size\s*([a-z0-9 ,/]+?)(?=\s+(?:mau|so|sl|gia|danh|cho|thue|coc)\b|$)/)?.[1] ?? 'M').split(/[ ,/]+/).filter(Boolean).map((s) => s.toUpperCase())
  const colorRaw = question.match(/màu\s+([^,]+?)(?=\s+(?:size|số lượng|sl|giá|danh mục|cho thuê|thuê|cọc)(?:\s|\d|$)|,|$)/i)?.[1]?.trim() ?? 'Đen'
  const quantity = Number(q.match(/(?:so luong|sl)\s*(\d+)/)?.[1] ?? 1)
  const category = db.categories.find((c) => q.includes(normalize(c.name))) ?? db.categories.find((c) => normalize(nameMatch[1]).includes(normalize(c.name).split(' ')[0]))
  const mode = rentalPrice ? (salePrice ? 'both' : 'rental') : 'sale'
  const name = nameMatch[1].trim().replace(/^["“]|["”]$/g, '')
  return {
    name, categoryId: category?.id ?? '', mode, salePrice: salePrice ?? 0, rentalPricePerDay: rentalPrice ?? 0, deposit: deposit ?? (rentalPrice ? rentalPrice * 3 : 0),
    gender: has(q, ' nam') ? 'Nam' : has(q, ' nu') ? 'Nữ' : 'Unisex',
    variants: sizes.map((size, i) => ({ sku: `NEW-${normalize(name).replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase()}-${size}${i}`, size, color: colorRaw.charAt(0).toUpperCase() + colorRaw.slice(1), stock: quantity })),
  }
}

function findProductsByText(db: Database, q: string) {
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w) && !['ton', 'kho', 'con', 'bao', 'nhieu', 'so', 'luong', 'sp', 'san', 'pham'].includes(w))
  if (!words.length) return []
  const scored = db.products.map((p) => ({ p, score: words.filter((w) => normalize(p.name).includes(w)).length })).filter((x) => x.score > 0)
  // Chỉ giữ các sản phẩm khớp nhiều từ nhất để câu hỏi cụ thể không trả về cả nhóm.
  const best = Math.max(0, ...scored.map((x) => x.score))
  return scored.filter((x) => x.score === best).map((x) => x.p)
}

function answerAdmin(db: Database, question: string, ctx: AiContext): AiReply {
  const q = normalize(question)
  const manager = ctx.user?.role === 'manager'

  // Nhập dữ liệu bằng câu lệnh tự nhiên.
  const draft = parseProductDraft(db, question)
  if (draft) {
    return {
      text: `Mình đã chuẩn bị bản nháp sản phẩm "${draft.name}"${draft.categoryId ? ` (${categoryName(db, draft.categoryId)})` : ''}: ${draft.variants!.length} biến thể, ${draft.mode === 'sale' ? `giá bán ${money(draft.salePrice!)}` : `giá thuê ${money(draft.rentalPricePerDay!)}/ngày, cọc ${money(draft.deposit!)}`}. Kiểm tra lại rồi lưu nhé.`,
      action: { kind: 'create-product', label: 'Mở form với bản nháp', draft },
    }
  }
  const importMatch = q.match(/nhap (?:kho|them)\s+(\d+)\s+(.+)/) ?? q.match(/nhap (?:kho|them)\s+(.+?)\s+(\d+)\s*(?:cai|chiec|bo)?$/)
  if (importMatch) {
    const [qty, target] = /^\d+$/.test(importMatch[1]) ? [Number(importMatch[1]), importMatch[2]] : [Number(importMatch[2]), importMatch[1]]
    const variant = db.variants.find((v) => normalize(v.sku) === target.trim()) ?? productVariants(db, findProductsByText(db, target)[0]?.id ?? '')[0]
    if (variant) {
      const product = db.products.find((p) => p.id === variant.productId)!
      return { text: `Nhập thêm ${qty} sản phẩm cho ${product.name} (${variant.sku} · ${variant.size}/${variant.color}). Tồn hiện tại: ${variant.stock}.`, action: { kind: 'import-stock', label: `Xác nhận nhập ${qty}`, variantId: variant.id, quantity: qty } }
    }
  }

  if (has(q, 'doanh thu', 'doanh so', 'thu duoc', 'loi nhuan', 'tien thu')) {
    if (!manager) return { text: 'Số liệu doanh thu chỉ dành cho quản lý.' }
    const [from, to, label] = dateRange(q)
    const r = reportSummary(db, from, to)
    return {
      text: `Doanh thu ${label}: ${money(r.revenue)} từ ${r.orderCount} đơn (${r.saleOrders} mua, ${r.rentalOrders} thuê).`,
      table: { headers: ['Khoản', 'Số tiền'], rows: [['Bán hàng', money(r.saleRevenue)], ['Cho thuê', money(r.rentalRevenue)], ['Phí trễ + bồi thường', money(r.lateFees + r.damageFees)], ['Phí giao hàng', money(r.shipping)], ['Tiền cọc đang giữ', money(r.depositHeld)]] },
      links: [{ label: 'Xem báo cáo chi tiết', to: '/admin/bao-cao' }],
    }
  }

  if (has(q, 'ban chay', 'pho bien', 'top')) {
    const [from, to, label] = dateRange(has(q, 'hom nay', 'hom qua', 'tuan', 'thang') ? q : '30 ngay')
    const top = reportSummary(db, from, to).topProducts.slice(0, 5)
    return { text: `Sản phẩm nổi bật ${label}:`, table: { headers: ['Sản phẩm', 'Loại', 'Số lượng'], rows: top.map((t) => [t.name, t.type === 'sale' ? 'Mua' : 'Thuê', String(t.quantity)]) } }
  }

  if (has(q, 'sap het', 'het hang', 'ton thap', 'can nhap')) {
    const low = inventorySummary(db).low.slice(0, 10)
    return { text: low.length ? `Có ${low.length} biến thể sắp hết hàng:` : 'Không có biến thể nào sắp hết hàng.', table: low.length ? { headers: ['SKU', 'Sản phẩm', 'Size/Màu', 'Tồn'], rows: low.map((r) => [r.variant.sku, r.product.name, `${r.variant.size}/${r.variant.color}`, String(r.variant.stock)]) } : undefined, links: [{ label: 'Mở kho hàng', to: '/admin/kho' }] }
  }

  const code = q.match(/pd\d{6,}/)?.[0]?.toUpperCase()
  if (code) {
    const o = db.orders.find((x) => x.code === code)
    if (!o) return { text: `Không tìm thấy đơn ${code}.` }
    return {
      text: `Đơn ${o.code} (${o.type === 'sale' ? 'mua' : 'thuê'}) của ${o.customerName} — ${displayStatus(o)[0]}. Tổng ${money(o.total)}.${o.rental ? ` Thuê từ ${o.rental.startDate} đến ${o.rental.endDate}.` : ''}`,
      table: { headers: ['Sản phẩm', 'Size/Màu', 'SL'], rows: o.items.map((i) => [i.name, `${i.size}/${i.color}`, String(i.quantity)]) },
      links: [{ label: 'Mở đơn', to: `/admin/${o.type === 'sale' ? 'don-mua' : 'don-thue'}?id=${o.id}` }],
    }
  }

  if (has(q, 'qua han', 'tre han', 'chua tra')) {
    const list = db.orders.filter(isOverdue)
    return { text: list.length ? `Có ${list.length} đơn thuê quá hạn trả:` : 'Không có đơn thuê nào quá hạn.', table: list.length ? { headers: ['Mã', 'Khách', 'Hạn trả', 'Phí trễ tạm tính'], rows: list.map((o) => [o.code, o.customerName, o.rental!.endDate, money(lateFeeFor(db, o).fee)]) } : undefined }
  }
  if (has(q, 'phai tra', 'can giao', 'lich thue', 'hom nay giao', 'hom nay tra')) {
    const t = today()
    const deliver = db.orders.filter((o) => o.type === 'rental' && o.status === 'confirmed' && o.rental!.startDate <= addDays(t, 1))
    const back = db.orders.filter((o) => o.type === 'rental' && o.status === 'renting' && o.rental!.endDate <= addDays(t, 1))
    return { text: `Cần giao ${deliver.length} đơn thuê và nhận lại ${back.length} đơn (hôm nay – ngày mai).`, table: { headers: ['Mã', 'Khách', 'Việc', 'Ngày'], rows: [...deliver.map((o) => [o.code, o.customerName, 'Giao đồ', o.rental!.startDate]), ...back.map((o) => [o.code, o.customerName, 'Nhận lại', o.rental!.endDate])] }, links: [{ label: 'Mở lịch thuê', to: '/admin/lich-thue' }] }
  }
  if (has(q, 'cho xac nhan', 'don moi', 'chua xu ly', 'can xu ly')) {
    const list = db.orders.filter((o) => o.status === 'pending')
    return { text: `Có ${list.length} đơn đang chờ xác nhận.`, table: list.length ? { headers: ['Mã', 'Loại', 'Khách', 'Tổng'], rows: list.slice(0, 10).map((o) => [o.code, o.type === 'sale' ? 'Mua' : 'Thuê', o.customerName, money(o.total)]) } : undefined }
  }

  if (has(q, 'khach', 'sdt', 'so dien thoai')) {
    const phone = q.match(/0\d{9,10}/)?.[0]
    const words = q.replace(/khach( hang)?|thong tin|tim|tra cuu|sdt|so dien thoai/g, ' ').trim()
    const list = db.users.filter((u) => u.role === 'customer' && (phone ? u.phone === phone : words.length > 1 && normalize(u.fullName).includes(words)))
    if (list.length)
      return {
        text: `Tìm thấy ${list.length} khách hàng:`,
        table: { headers: ['Tên', 'SĐT', 'Hạng', 'Đã chi', 'Số đơn'], rows: list.map((u) => [u.fullName, u.phone, tierOf(db, u.id), money(totalSpent(db, u.id)), String(db.orders.filter((o) => o.customerId === u.id).length)]) },
        links: list.slice(0, 1).map((u) => ({ label: `Hồ sơ ${u.fullName}`, to: `/admin/khach-hang?id=${u.id}` })),
      }
  }

  if (has(q, 'ton', 'con bao nhieu', 'con hang', 'kho', 'so luong')) {
    const products = findProductsByText(db, q)
    if (products.length) {
      const rows = products.slice(0, 3).flatMap((p) => productVariants(db, p.id).map((v) => [p.name, `${v.size}/${v.color}`, String(v.stock), canRent(p) ? String(rentalAvailable(db, v.id, today(), today())) : '—']))
      return { text: 'Tồn kho hiện tại:', table: { headers: ['Sản phẩm', 'Size/Màu', 'Tồn', 'Rảnh để thuê hôm nay'], rows } }
    }
    const inv = inventorySummary(db)
    return { text: `Kho hiện có ${inv.units} sản phẩm thuộc ${inv.skuCount} SKU, ${inv.low.length} SKU sắp hết.`, links: [{ label: 'Mở kho hàng', to: '/admin/kho' }] }
  }

  const products = findProductsByText(db, q)
  if (products.length)
    return { text: 'Sản phẩm liên quan:', table: { headers: ['Sản phẩm', 'Danh mục', 'Giá', 'Tồn'], rows: products.slice(0, 6).map((p) => [p.name, categoryName(db, p.categoryId), p.mode === 'rental' ? `${money(p.rentalPricePerDay)}/ngày` : money(p.salePrice), String(totalStock(db, p.id))]) } }

  return {
    text: 'Mình có thể giúp bạn:\n• "Doanh thu tháng này" / "doanh thu 7 ngày"\n• "Còn bao nhiêu vest tuxedo"\n• "Sản phẩm sắp hết hàng"\n• "Đơn thuê quá hạn" / "hôm nay cần giao trả"\n• "Khách 0901234567"\n• "PD2611... " để tra đơn\n• "Thêm sản phẩm Váy Luna giá 890k size S,M màu hồng số lượng 3"\n• "Nhập kho 5 vest tuxedo"',
  }
}

// ---------- Gọi mô hình ngôn ngữ (Claude qua Edge Function) ----------

/**
 * Dữ liệu gửi kèm câu hỏi: chỉ gồm những gì người dùng hiện tại đã được phép xem
 * (dữ liệu trong bộ nhớ đã được RLS lọc khi tải từ Supabase).
 */
function buildContext(db: Database, ctx: AiContext) {
  const t = today()
  const products = db.products
    .filter((p) => p.status === 'active' || ctx.scope === 'admin')
    .map((p) => {
      const variants = productVariants(db, p.id)
      return {
        id: p.id, name: p.name, category: categoryName(db, p.categoryId), collection: db.collections.find((c) => c.id === p.collectionId)?.name,
        gender: p.gender, mode: p.mode, salePrice: p.mode !== 'rental' ? p.salePrice : undefined,
        rentalPerDay: p.mode !== 'sale' ? p.rentalPricePerDay : undefined, deposit: p.mode !== 'sale' ? p.deposit : undefined,
        colors: [...new Set(variants.map((v) => v.color))], sizes: [...new Set(variants.map((v) => v.size))], stock: totalStock(db, p.id),
        rating: productRating(db, p.id).avg || undefined, description: p.description, material: p.material, status: ctx.scope === 'admin' ? p.status : undefined,
      }
    })
  const s = db.settings
  const policies = {
    store: { name: s.storeName, address: s.address, hotline: s.hotline, openHours: s.openHours },
    shipping: { fee: s.shippingFee, freeFrom: s.freeShippingFrom }, lateFeePercentPerDay: s.lateFeePercentPerDay,
    loyalty: { pointsPerAmount: s.pointsPerAmount, pointValue: s.pointValue, tiers: s.tiers }, returnPolicy: 'Đổi trả đơn mua trong 7 ngày; gia hạn thuê gửi yêu cầu trước ngày trả.',
    coupons: db.coupons.filter((c) => c.active && c.startAt <= t && t <= c.endAt && c.used < c.usageLimit).map((c) => ({ code: c.code, description: c.description, minOrder: c.minOrder, appliesTo: c.appliesTo, minTier: c.minTier })),
  }
  const orderSummary = (o: Database['orders'][number]) => ({
    id: o.id, code: o.code, type: o.type, status: displayStatus(o)[0], customer: o.customerName, phone: o.phone, total: o.total, createdAt: o.createdAt.slice(0, 10),
    items: o.items.map((i) => `${i.name} (${i.size}/${i.color}) x${i.quantity}`), rental: o.rental ? { start: o.rental.startDate, end: o.rental.endDate } : undefined,
  })

  if (ctx.scope === 'shop') {
    const mine = ctx.user ? db.orders.filter((o) => o.customerId === ctx.user!.id).slice(0, 10).map(orderSummary) : []
    return { today: t, customer: ctx.user ? { name: ctx.user.fullName, points: ctx.user.points } : null, cartProductIds: ctx.cartProductIds ?? [], products, policies, myOrders: mine }
  }

  const manager = ctx.user?.role === 'manager'
  const revenue = manager
    ? Object.fromEntries((['hôm nay', '7 ngày', '30 ngày', 'tháng này'] as const).map((label) => {
        const from = label === 'hôm nay' ? t : label === '7 ngày' ? addDays(t, -6) : label === '30 ngày' ? addDays(t, -29) : `${t.slice(0, 8)}01`
        const r = reportSummary(db, from, t)
        return [label, { revenue: r.revenue, sale: r.saleRevenue, rental: r.rentalRevenue, fees: r.lateFees + r.damageFees, orders: r.orderCount, top: r.topProducts.slice(0, 5) }]
      }))
    : undefined
  return {
    today: t, role: ctx.user?.role, products, policies, revenue,
    lowStock: inventorySummary(db).low.slice(0, 20).map(({ product, variant }) => ({ product: product.name, sku: variant.sku, size: variant.size, color: variant.color, stock: variant.stock })),
    overdueRentals: db.orders.filter(isOverdue).map((o) => ({ ...orderSummary(o), lateFee: lateFeeFor(db, o).fee })),
    recentOrders: db.orders.slice(0, 60).map(orderSummary),
    pendingRequests: db.requests.filter((r) => ['pending', 'forwarded'].includes(r.status)).map((r) => ({ type: r.type, status: r.status, order: db.orders.find((o) => o.id === r.orderId)?.code, reason: r.reason })),
    customers: db.users.filter((u) => u.role === 'customer').slice(0, 300).map((u) => ({ id: u.id, name: u.fullName, phone: u.phone, tier: tierOf(db, u.id), spent: totalSpent(db, u.id), points: u.points, orders: db.orders.filter((o) => o.customerId === u.id).length })),
  }
}

interface RemoteReply { text: string; productIds: string[]; links: { label: string; to: string }[]; table: { headers: string[]; rows: string[][] } | null }

async function askModel(question: string, ctx: AiContext, history: AiHistory): Promise<AiReply> {
  const db = getDb()
  const { data, error } = await supabase!.functions.invoke<RemoteReply>('assistant', {
    body: { scope: ctx.scope, question, history, context: buildContext(db, ctx) },
  })
  if (error || !data?.text) throw error ?? new Error('Trợ lý không trả lời')
  const products = data.productIds.map((id) => db.products.find((p) => p.id === id)).filter((p): p is Product => Boolean(p))
  return {
    text: data.text,
    products: products.length ? products : undefined,
    links: data.links?.length ? data.links.filter((l) => l.to.startsWith('/')) : undefined,
    table: data.table?.rows.length ? data.table : undefined,
  }
}

export type AiHistory = { role: 'user' | 'assistant'; content: string }[]

export async function askAssistant(question: string, ctx: AiContext, history: AiHistory = []): Promise<AiReply> {
  const db = getDb()
  const local = ctx.scope === 'shop' ? answerShop(db, question, ctx) : answerAdmin(db, question, ctx)
  let reply = local
  // Câu lệnh nhập liệu (thêm sản phẩm, nhập kho) giữ bộ quy tắc vì cần bản nháp có cấu trúc chính xác.
  if (isRemote && !local.action) {
    try {
      reply = await askModel(question, ctx, history)
    } catch (error) {
      // Chưa triển khai function / chưa có khóa API / lỗi mạng: dùng bộ quy tắc cục bộ.
      console.warn('Trợ lý AI dùng bộ quy tắc dự phòng:', error)
    }
  } else {
    // Giả lập độ trễ để giao diện hiển thị trạng thái "đang trả lời".
    await new Promise((r) => setTimeout(r, 350))
  }
  mutate((draft) => {
    draft.aiLogs.unshift({ id: uid('ai-'), userId: ctx.user?.id, scope: ctx.scope, question, answer: reply.text, at: nowISO() })
    if (draft.aiLogs.length > 300) draft.aiLogs.length = 300
  })
  return reply
}
