// Kiểm thử hệ gợi ý trên dữ liệu mẫu cục bộ.
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, mutate, resetDb } from '../data/store'
import {
  alsoChosen, cfSimilarity, computeStats, contentSimilarity, evaluateRecommender, interactionMatrix, recommendForCart, recommendForUser, similarProducts, tokenize,
} from './recommend'
import { categoryName } from './catalog'

const product = (id: string) => getDb().products.find((p) => p.id === id)!

beforeEach(() => resetDb())

describe('Lọc theo nội dung', () => {
  it('tách từ tiếng Việt không dấu và giữ cụm 2 từ', () => {
    expect(tokenize('Áo dài lụa Sen')).toEqual(expect.arrayContaining(['ao', 'dai', 'ao_dai', 'lua']))
  })

  it('vest giống vest hơn giống phụ kiện', () => {
    const vest = product('p-3') // Vest nam Classic
    expect(contentSimilarity(getDb(), vest, product('p-29'))).toBeGreaterThan(contentSimilarity(getDb(), vest, product('p-37')))
  })

  it('sản phẩm tương tự không chứa chính nó và ưu tiên cùng danh mục', () => {
    const list = similarProducts(getDb(), 'p-11', 4) // Đầm dạ hội Ruby
    expect(list).toHaveLength(4)
    expect(list.map((r) => r.product.id)).not.toContain('p-11')
    expect(categoryName(getDb(), list[0].product.categoryId)).toBe('Dạ tiệc')
  })
})

describe('Lọc cộng tác', () => {
  it('tích vô hướng đối xứng và đếm đúng số khách chung', () => {
    const matrix = new Map([
      ['u1', new Map([['a', 3], ['b', 2]])],
      ['u2', new Map([['a', 3], ['b', 3]])],
    ])
    const stats = computeStats(matrix)
    const ab = stats.pairs.find(([x, y]) => x === 'a' && y === 'b')!
    const ba = stats.pairs.find(([x, y]) => x === 'b' && y === 'a')!
    expect(ab[2]).toBe(3 * 2 + 3 * 3)
    expect(ab[2]).toBe(ba[2])
    expect(ab[3]).toBe(2)
  })

  it('khách cùng mua hai mẫu thì hai mẫu được gợi ý cho nhau', () => {
    // Hai khách đều yêu thích Tuxedo (p-13) và Nơ nhung (p-38).
    mutate((db) => {
      db.wishlists['u-cus1'] = ['p-13', 'p-38']
      db.wishlists['u-cus2'] = ['p-13', 'p-38']
    })
    expect(cfSimilarity(getDb(), 'p-13', 'p-38')).toBeGreaterThan(cfSimilarity(getDb(), 'p-13', 'p-9'))
    expect(cfSimilarity(getDb(), 'p-13', 'p-38')).toBe(cfSimilarity(getDb(), 'p-38', 'p-13'))
    expect(alsoChosen(getDb(), 'p-38').map((r) => r.product.id)).toContain('p-13')
  })
})

describe('Gợi ý cá nhân', () => {
  it('không gợi ý lại đồ khách đã mua hoặc đang có trong giỏ', () => {
    const userId = 'u-cus1'
    const bought = new Set(getDb().orders.filter((o) => o.customerId === userId && o.type === 'sale' && o.status !== 'cancelled').flatMap((o) => o.items.map((i) => i.productId)))
    const list = recommendForUser(getDb(), userId, { limit: 8 })
    expect(list.length).toBeGreaterThan(0)
    for (const r of list) expect(bought.has(r.product.id)).toBe(false)
  })

  it('khách mới (chưa có lịch sử) nhận gợi ý theo độ phổ biến', () => {
    const list = recommendForUser(getDb(), undefined, { limit: 4 })
    expect(list).toHaveLength(4)
    expect(list[0].reason).toBe('Được nhiều khách chọn')
  })

  it('xem vest thì gợi ý nghiêng về vest / đồ nam', () => {
    const list = recommendForUser(getDb(), undefined, { viewed: ['p-3', 'p-4'], limit: 4 })
    expect(list.filter((r) => r.product.gender !== 'Nữ').length).toBeGreaterThanOrEqual(3)
  })

  it('giỏ hàng có vest thì gợi ý phối thêm phụ kiện', () => {
    const list = recommendForCart(getDb(), ['p-13'], 4)
    expect(list.some((r) => categoryName(getDb(), r.product.categoryId) === 'Phụ kiện')).toBe(true)
  })
})

it('đánh giá leave-one-out trả về tỉ lệ trong khoảng [0, 1]', () => {
  expect(interactionMatrix(getDb()).size).toBeGreaterThan(0)
  const result = evaluateRecommender(getDb(), 5)
  expect(result.cases).toBeGreaterThan(0)
  expect(result.hybrid).toBeGreaterThanOrEqual(0)
  expect(result.hybrid).toBeLessThanOrEqual(1)
})
