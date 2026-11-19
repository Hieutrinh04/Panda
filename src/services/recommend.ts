// Hệ gợi ý sản phẩm (recommendation system) kết hợp hai hướng:
//
// 1. Lọc theo nội dung (content-based): mỗi sản phẩm là một vector TF-IDF dựng từ tên,
//    danh mục, bộ sưu tập, chất liệu, mô tả, màu sắc; độ giống nhau = cosine của hai vector,
//    cộng thêm điểm cùng danh mục, gần mức giá và hợp giới tính.
// 2. Lọc cộng tác item-item (collaborative filtering): ma trận khách hàng × sản phẩm với
//    phản hồi ngầm (mua/thuê = 3, yêu thích = 2, trong giỏ = 1); độ giống nhau của hai
//    sản phẩm = cosine giữa hai cột, có hệ số co (shrinkage) khi ít khách cùng tương tác.
//
// Điểm lai (hybrid) = α·CF + (1 − α)·nội dung, với α = n / (n + K) tăng theo số khách đã tương
// tác với sản phẩm: sản phẩm mới (cold start) dựa vào nội dung, sản phẩm có nhiều dữ liệu
// dựa nhiều hơn vào hành vi. Danh sách cuối được sắp lại bằng MMR để không trùng lặp danh mục.
//
// Ở chế độ Supabase, khách hàng chỉ đọc được đơn của chính mình (RLS), nên thống kê cộng tác
// được lấy từ hàm recommendation_stats() trên database (chỉ trả số liệu tổng hợp, không có
// thông tin cá nhân). Ở chế độ cục bộ, thống kê được tính trực tiếp từ dữ liệu.
import type { CfStats, Database, Id, Product } from '../types'
import { normalize } from '../lib/format'
import { categoryName, productRating, productVariants, totalStock } from './catalog'

export interface Recommendation { product: Product; score: number; reason: string }

/** Trọng số phản hồi ngầm. */
export const WEIGHTS = { order: 3, wishlist: 2, cart: 1, view: 1 }
/** Hệ số co của độ giống nhau CF: cần khoảng SHRINK khách cùng tương tác để tin cậy một nửa. */
const SHRINK = 2
/** α = n / (n + CONFIDENCE): số khách tương tác cần để CF và nội dung có trọng số ngang nhau. */
const CONFIDENCE = 4

// ---------- Lọc theo nội dung: TF-IDF ----------

const STOPWORDS = new Set(['va', 'cho', 'cua', 'voi', 'la', 'co', 'trong', 'khi', 'nhe', 'mot', 'cac', 'nhung', 'de', 'tu', 'phu', 'hop', 'kem'])

export function tokenize(text: string) {
  const words = normalize(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOPWORDS.has(w))
  // Thêm cụm 2 từ để giữ nghĩa của từ ghép tiếng Việt: "ao dai", "da hoi", "ke soc".
  const bigrams = words.slice(1).map((w, i) => `${words[i]}_${w}`)
  return [...words, ...bigrams]
}

type Vector = Map<string, number>

function cosine(a: Vector, b: Vector) {
  let dot = 0
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  for (const [k, v] of small) dot += v * (large.get(k) ?? 0)
  return dot // vector đã chuẩn hóa độ dài 1
}

function productText(db: Database, p: Product) {
  const colors = [...new Set(productVariants(db, p.id).map((v) => v.color))].join(' ')
  const collection = db.collections.find((c) => c.id === p.collectionId)?.name ?? ''
  const category = categoryName(db, p.categoryId)
  // Tên và danh mục lặp lại để có trọng số cao hơn mô tả.
  return `${p.name} ${p.name} ${category} ${category} ${collection} ${p.material} ${colors} ${p.description}`
}

/** Mức giá để so sánh: giá bán, hoặc giá thuê quy đổi (khoảng 6 ngày thuê ≈ giá mua). */
const priceLevel = (p: Product) => (p.mode === 'rental' ? p.rentalPricePerDay * 6 : p.salePrice || p.rentalPricePerDay * 6)

export function buildTfIdf(db: Database) {
  const docs = db.products.map((p) => ({ id: p.id, tokens: tokenize(productText(db, p)) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  const n = docs.length
  const vectors = new Map<Id, Vector>()
  for (const d of docs) {
    const tf = new Map<string, number>()
    for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    const v: Vector = new Map()
    let norm = 0
    for (const [t, c] of tf) {
      const w = (c / d.tokens.length) * (Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1)
      v.set(t, w)
      norm += w * w
    }
    norm = Math.sqrt(norm) || 1
    for (const [t, w] of v) v.set(t, w / norm)
    vectors.set(d.id, v)
  }
  return vectors
}

// ---------- Lọc cộng tác: thống kê tương tác ----------

/** Ma trận tương tác khách hàng × sản phẩm từ dữ liệu đang có. */
export function interactionMatrix(db: Database) {
  const m = new Map<Id, Map<Id, number>>()
  const add = (user: Id | undefined, product: Id | undefined, w: number) => {
    if (!user || !product) return
    const row = m.get(user) ?? new Map<Id, number>()
    row.set(product, (row.get(product) ?? 0) + w)
    m.set(user, row)
  }
  for (const o of db.orders) if (o.status !== 'cancelled') for (const i of o.items) add(o.customerId, i.productId, WEIGHTS.order)
  for (const [user, ids] of Object.entries(db.wishlists)) for (const id of ids) add(user, id, WEIGHTS.wishlist)
  for (const [user, items] of Object.entries(db.carts))
    for (const item of items) add(user, db.variants.find((v) => v.id === item.variantId)?.productId, WEIGHTS.cart)
  return m
}

/** Tích vô hướng giữa các cặp sản phẩm và chuẩn của từng sản phẩm (giống kết quả recommendation_stats()). */
export function computeStats(matrix: Map<Id, Map<Id, number>>): CfStats {
  const pairs = new Map<string, [Id, Id, number, number]>()
  const items = new Map<Id, [Id, number, number]>()
  for (const row of matrix.values()) {
    const entries = [...row]
    for (const [p, w] of entries) {
      const it = items.get(p) ?? [p, 0, 0]
      it[1] += w * w
      it[2] += 1
      items.set(p, it)
      for (const [q, wq] of entries) {
        if (p === q) continue
        const key = `${p}|${q}`
        const pair = pairs.get(key) ?? [p, q, 0, 0]
        pair[2] += w * wq
        pair[3] += 1
        pairs.set(key, pair)
      }
    }
  }
  return { pairs: [...pairs.values()], items: [...items.values()] }
}

// ---------- Mô hình (tính một lần cho mỗi bản dữ liệu) ----------

interface Model {
  tfidf: Map<Id, Vector>
  /** cf.get(a).get(b) = độ giống nhau CF đã co. */
  cf: Map<Id, Map<Id, number>>
  /** Số khách đã tương tác với từng sản phẩm. */
  users: Map<Id, number>
  /** Số khách cùng tương tác với cặp sản phẩm. */
  co: Map<Id, Map<Id, number>>
  byId: Map<Id, Product>
}

const cache = new WeakMap<Database, Model>()

function model(db: Database): Model {
  const hit = cache.get(db)
  if (hit) return hit
  const stats = db.recoStats ?? computeStats(interactionMatrix(db))
  const norms = new Map(stats.items.map(([p, sq]) => [p, Math.sqrt(sq)]))
  const users = new Map(stats.items.map(([p, , n]) => [p, n]))
  const cf = new Map<Id, Map<Id, number>>()
  const co = new Map<Id, Map<Id, number>>()
  for (const [a, b, dot, n] of stats.pairs) {
    const sim = (dot / ((norms.get(a) || 1) * (norms.get(b) || 1))) * (n / (n + SHRINK))
    if (!cf.has(a)) cf.set(a, new Map())
    if (!co.has(a)) co.set(a, new Map())
    cf.get(a)!.set(b, sim)
    co.get(a)!.set(b, n)
  }
  const m: Model = { tfidf: buildTfIdf(db), cf, users, co, byId: new Map(db.products.map((p) => [p.id, p])) }
  cache.set(db, m)
  return m
}

/** Độ giống nhau theo nội dung, trong khoảng [0, 1]. */
export function contentSimilarity(db: Database, a: Product, b: Product) {
  const m = model(db)
  const text = cosine(m.tfidf.get(a.id) ?? new Map(), m.tfidf.get(b.id) ?? new Map())
  const sameCategory = a.categoryId === b.categoryId ? 1 : 0
  const [pa, pb] = [priceLevel(a), priceLevel(b)]
  const price = pa && pb ? Math.min(pa, pb) / Math.max(pa, pb) : 0
  const genderOk = a.gender === b.gender || a.gender === 'Unisex' || b.gender === 'Unisex'
  return (0.55 * text + 0.25 * sameCategory + 0.2 * price) * (genderOk ? 1 : 0.5)
}

export const cfSimilarity = (db: Database, a: Id, b: Id) => model(db).cf.get(a)?.get(b) ?? 0

/** Điểm lai giữa hai sản phẩm. */
export function hybridSimilarity(db: Database, a: Product, b: Product) {
  const n = model(db).users.get(a.id) ?? 0
  const alpha = n / (n + CONFIDENCE)
  return alpha * cfSimilarity(db, a.id, b.id) + (1 - alpha) * contentSimilarity(db, a, b)
}

const available = (db: Database, p: Product) => p.status === 'active' && totalStock(db, p.id) > 0

/** Độ phổ biến: số khách đã tương tác, cộng điểm nổi bật và đánh giá. */
export function popularity(db: Database, p: Product) {
  return (model(db).users.get(p.id) ?? 0) + (p.featured ? 1 : 0) + productRating(db, p.id).avg / 5
}

/**
 * Sắp xếp lại theo MMR (Maximal Marginal Relevance): cân bằng giữa mức liên quan và độ đa
 * dạng, tránh gợi ý toàn sản phẩm na ná nhau.
 */
function rerank(db: Database, list: Recommendation[], limit: number, lambda = 0.75) {
  const picked: Recommendation[] = []
  const rest = [...list]
  const top = Math.max(...rest.map((r) => r.score), 1e-9)
  while (picked.length < limit && rest.length) {
    let best = 0
    let bestValue = -Infinity
    rest.forEach((r, i) => {
      const redundancy = Math.max(0, ...picked.map((x) => contentSimilarity(db, r.product, x.product)))
      const value = lambda * (r.score / top) - (1 - lambda) * redundancy
      if (value > bestValue) [best, bestValue] = [i, value]
    })
    picked.push(rest.splice(best, 1)[0])
  }
  return picked
}

// ---------- Các loại gợi ý ----------

/** "Sản phẩm tương tự": điểm lai so với sản phẩm đang xem. */
export function similarProducts(db: Database, productId: Id, limit = 4): Recommendation[] {
  const base = model(db).byId.get(productId)
  if (!base) return []
  const list = db.products
    .filter((p) => p.id !== productId && available(db, p))
    .map((p) => ({ product: p, score: hybridSimilarity(db, base, p), reason: categoryName(db, p.categoryId) === categoryName(db, base.categoryId) ? 'Cùng phong cách' : 'Có thể phối cùng' }))
    .sort((a, b) => b.score - a.score)
  return rerank(db, list.slice(0, limit * 3), limit)
}

/** "Khách mua/thuê mẫu này cũng chọn": chỉ dựa trên hành vi (CF), cần ít nhất một khách chung. */
export function alsoChosen(db: Database, productId: Id, limit = 4): Recommendation[] {
  const m = model(db)
  const row = m.cf.get(productId)
  if (!row) return []
  return [...row]
    .map(([id, score]) => ({ product: m.byId.get(id)!, score, reason: `${m.co.get(productId)?.get(id) ?? 0} khách cùng chọn` }))
    // Cần ít nhất 2 khách cùng chọn: một khách lẻ thường chỉ là trùng hợp, không phải xu hướng.
    .filter((r) => r.product && available(db, r.product) && r.score > 0 && (m.co.get(productId)?.get(r.product.id) ?? 0) >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Các sản phẩm người dùng đã tương tác, kèm trọng số (hồ sơ sở thích). */
export function userProfile(db: Database, userId?: Id, viewed: Id[] = []) {
  const profile = new Map<Id, number>()
  const add = (id: Id | undefined, w: number) => id && profile.set(id, (profile.get(id) ?? 0) + w)
  if (userId) {
    for (const o of db.orders) if (o.customerId === userId && o.status !== 'cancelled') for (const i of o.items) add(i.productId, WEIGHTS.order)
    for (const id of db.wishlists[userId] ?? []) add(id, WEIGHTS.wishlist)
    for (const item of db.carts[userId] ?? []) add(db.variants.find((v) => v.id === item.variantId)?.productId, WEIGHTS.cart)
  }
  viewed.forEach((id, i) => add(id, WEIGHTS.view * (1 - i / (viewed.length + 1)))) // xem gần đây nặng hơn
  return profile
}

/**
 * "Gợi ý cho bạn": điểm của sản phẩm ứng viên = trung bình có trọng số của độ giống nhau lai
 * với từng sản phẩm trong hồ sơ. Không có hồ sơ thì gợi ý theo độ phổ biến.
 */
export function recommendForUser(db: Database, userId?: Id, options: { viewed?: Id[]; limit?: number; exclude?: Id[] } = {}): Recommendation[] {
  const limit = options.limit ?? 8
  const m = model(db)
  const profile = userProfile(db, userId, options.viewed)
  // Đồ đã mua thì không gợi ý lại; đồ đã thuê vẫn có thể thuê tiếp.
  const owned = new Set(userId ? db.orders.filter((o) => o.customerId === userId && o.type === 'sale' && o.status !== 'cancelled').flatMap((o) => o.items.map((i) => i.productId)) : [])
  const skip = new Set([...(options.exclude ?? []), ...owned, ...(userId ? (db.carts[userId] ?? []).map((c) => db.variants.find((v) => v.id === c.variantId)?.productId ?? '') : [])])
  const candidates = db.products.filter((p) => available(db, p) && !skip.has(p.id))

  if (!profile.size) {
    const list = candidates.map((p) => ({ product: p, score: popularity(db, p), reason: 'Được nhiều khách chọn' })).sort((a, b) => b.score - a.score)
    return rerank(db, list.slice(0, limit * 3), limit)
  }

  const total = [...profile.values()].reduce((s, w) => s + w, 0)
  const list = candidates
    .map((p) => {
      let score = 0
      let best: [Id, number] = ['', 0]
      for (const [id, w] of profile) {
        const source = m.byId.get(id)
        if (!source || source.id === p.id) continue
        const s = w * hybridSimilarity(db, source, p)
        score += s
        if (s > best[1]) best = [id, s]
      }
      const source = m.byId.get(best[0])
      return { product: p, score: score / total + 0.02 * popularity(db, p), reason: source ? `Vì bạn quan tâm ${source.name}` : 'Dành cho bạn' }
    })
    .filter((r) => !profile.has(r.product.id))
    .sort((a, b) => b.score - a.score)
  return rerank(db, list.slice(0, limit * 3), limit)
}

/** Gợi ý mua kèm cho giỏ hàng: ưu tiên sản phẩm khác danh mục để phối đồ (vest → cà vạt, đầm → ví). */
export function recommendForCart(db: Database, productIds: Id[], limit = 4): Recommendation[] {
  const m = model(db)
  const inCart = productIds.map((id) => m.byId.get(id)).filter((p): p is Product => Boolean(p))
  if (!inCart.length) return []
  const cartCategories = new Set(inCart.map((p) => p.categoryId))
  const list = db.products
    .filter((p) => available(db, p) && !productIds.includes(p.id))
    .map((p) => {
      const sims = inCart.map((c) => hybridSimilarity(db, c, p) + 2 * cfSimilarity(db, c.id, p.id))
      const complement = cartCategories.has(p.categoryId) ? 0 : 0.15
      return { product: p, score: Math.max(...sims) + complement, reason: complement ? 'Phối cùng đồ trong giỏ' : 'Cùng phong cách' }
    })
    .sort((a, b) => b.score - a.score)
  return rerank(db, list.slice(0, limit * 3), limit, 0.7)
}

// ---------- Đánh giá offline ----------

/**
 * Leave-one-out: với mỗi khách có ít nhất 2 sản phẩm đã tương tác, giấu một sản phẩm rồi xem
 * nó có nằm trong top-k gợi ý hay không. Trả về HitRate@k của mô hình lai và của cách
 * gợi ý theo độ phổ biến (để so sánh).
 */
export function evaluateRecommender(db: Database, k = 5) {
  const matrix = interactionMatrix(db)
  let hybridHits = 0
  let popularHits = 0
  let cases = 0
  for (const [user, row] of matrix) {
    const items = [...row.keys()].filter((id) => db.products.some((p) => p.id === id))
    if (items.length < 2) continue
    for (const held of items) {
      // Bỏ tương tác bị giấu khỏi dữ liệu rồi tính lại mô hình.
      const trimmed = new Map(matrix)
      trimmed.set(user, new Map([...row].filter(([id]) => id !== held)))
      const view: Database = { ...db, recoStats: computeStats(trimmed), orders: [], wishlists: {}, carts: {} }
      const others = items.filter((id) => id !== held)
      const ranked = recommendForUser(view, undefined, { viewed: others, limit: k, exclude: others }).map((r) => r.product.id)
      const popular = db.products.filter((p) => p.status === 'active' && !others.includes(p.id)).sort((a, b) => popularity(view, b) - popularity(view, a)).slice(0, k).map((p) => p.id)
      cases += 1
      if (ranked.includes(held)) hybridHits += 1
      if (popular.includes(held)) popularHits += 1
    }
  }
  return { k, cases, hybrid: cases ? hybridHits / cases : 0, popularity: cases ? popularHits / cases : 0 }
}

// ---------- Sản phẩm đã xem (lưu trên trình duyệt) ----------

const VIEWED_KEY = 'panda-viewed'

export function recentlyViewed(): Id[] {
  try {
    return JSON.parse(localStorage.getItem(VIEWED_KEY) ?? '[]') as Id[]
  } catch {
    return []
  }
}

export function recordView(productId: Id) {
  try {
    const list = [productId, ...recentlyViewed().filter((id) => id !== productId)].slice(0, 12)
    localStorage.setItem(VIEWED_KEY, JSON.stringify(list))
  } catch {
    // Trình duyệt chặn localStorage: bỏ qua, gợi ý vẫn chạy theo lịch sử mua/thuê.
  }
}
