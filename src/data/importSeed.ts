// Nạp dữ liệu mẫu (danh mục, sản phẩm, mã giảm giá, khách hàng, đơn hàng 4 tuần…)
// lên Supabase để có dữ liệu demo. Chỉ chạy khi database chưa có sản phẩm.
import type { Database, Id } from '../types'
import { createSeed } from './seed'
import { getDb, mutate, reloadRemote, waitForSync } from './store'
import { fail, log } from '../services/core'

export async function importSeedToRemote(managerId: Id) {
  if (getDb().products.length) fail('Database đã có sản phẩm, chỉ nạp dữ liệu mẫu khi còn trống.')
  const seed = createSeed()

  // Khách mẫu nhận id dạng UUID; mọi thao tác của quản lý/nhân viên mẫu được gán cho quản lý hiện tại.
  const idMap = new Map<string, string>()
  for (const u of seed.users) idMap.set(u.id, u.role === 'customer' ? crypto.randomUUID() : managerId)
  let json = JSON.stringify(seed)
  for (const [from, to] of idMap) json = json.replaceAll(`"${from}"`, `"${to}"`)
  const data = JSON.parse(json) as Database

  mutate((db) => {
    // Khách mẫu là hồ sơ chưa có tài khoản; ai đăng ký bằng đúng email/SĐT đó sẽ nhận lại hồ sơ và lịch sử.
    db.users.push(...data.users.filter((u) => u.role === 'customer'))
    db.categories = data.categories
    db.suppliers = data.suppliers
    db.collections = data.collections
    db.products = data.products
    db.variants = data.variants
    db.movements = data.movements
    db.coupons = data.coupons
    db.settings = data.settings
    db.orders = data.orders
    db.payments = data.payments
    db.requests = data.requests
    db.reviews = data.reviews
    db.tickets = data.tickets
    db.tasks = data.tasks
    db.notifications = [...data.notifications, ...db.notifications]
    log(db, managerId, 'Nạp dữ liệu mẫu')
  })
  await waitForSync()
  await reloadRemote()
}
