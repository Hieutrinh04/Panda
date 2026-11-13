// Kiểm thử lớp ánh xạ Supabase bằng một client giả: dữ liệu đi một vòng
// (Database → các dòng trong bảng → Database) phải giữ nguyên.
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../types'
import { createSeed } from './seed'

const tables = new Map<string, Record<string, unknown>[]>()

vi.mock('../lib/supabase', () => ({
  isRemote: false,
  supabase: {
    from: (table: string) => {
      const result = { data: tables.get(table) ?? [], error: null }
      const query = { order: () => query, limit: () => Promise.resolve(result), then: (resolve: (v: typeof result) => void) => resolve(result) }
      return { select: () => query }
    },
  },
}))

const { TABLES, diff, loadRemote } = await import('./remote')

describe('Ánh xạ dữ liệu Supabase', () => {
  it('Tải lên rồi đọc về không làm thay đổi dữ liệu', async () => {
    const seed = createSeed()
    // Thông báo/nhật ký được sắp mới nhất trước như khi tải từ máy chủ.
    for (const spec of TABLES) tables.set(spec.table, JSON.parse(JSON.stringify(spec.rows(seed))))
    const loaded = { ...seed, ...(await loadRemote()) } as Database
    const changes = diff(seed, loaded).filter((c) => c.inserts.length + c.updates.length + c.deletes.length > 0)
    expect(changes.map((c) => ({ table: c.spec.table, inserts: c.inserts.length, updates: c.updates.length, deletes: c.deletes.length }))).toEqual([])
  })

  it('Chỉ ghi đúng những dòng thay đổi', () => {
    const before = createSeed()
    const after = structuredClone(before)
    after.variants[0].stock += 3
    after.orders[0].timeline.push({ status: 'confirmed', at: new Date().toISOString() })
    after.carts['u-cus1'] = []
    after.coupons = after.coupons.filter((c) => c.code !== 'TET2026')
    const changes = Object.fromEntries(diff(before, after).map((c) => [c.spec.table, c]))
    expect(changes.variants.updates).toHaveLength(1)
    expect(changes.order_events.inserts).toHaveLength(1)
    expect(changes.coupons.deletes).toHaveLength(1)
    expect(changes.orders.updates).toHaveLength(0)
    expect(changes.products.updates).toHaveLength(0)
  })
})
