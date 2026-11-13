// Kho dữ liệu của ứng dụng: giữ toàn bộ dữ liệu trong bộ nhớ để các màn hình
// đọc đồng bộ qua useDb(), còn mọi thao tác ghi đi qua mutate().
// - Chế độ cục bộ (không có .env.local): lưu vào localStorage, dùng dữ liệu mẫu.
// - Chế độ Supabase: tải dữ liệu từ Supabase, mỗi lần mutate() thì ghi các
//   dòng thay đổi lên Supabase (xem remote.ts).
import { useSyncExternalStore } from 'react'
import type { Database } from '../types'
import { createSeed, DB_VERSION, defaultSettings } from './seed'
import { isRemote, supabase, friendlyError } from '../lib/supabase'
import { loadRemote, pushChanges, type RemoteTag } from './remote'

export { isRemote }

const STORAGE_KEY = 'panda-db'

const emptyDb = (): Database => ({
  version: DB_VERSION, users: [], categories: [], suppliers: [], collections: [], products: [], variants: [], movements: [], carts: {}, wishlists: {},
  orders: [], payments: [], requests: [], coupons: [], reviews: [], notifications: [], tickets: [], tasks: [], activity: [], aiLogs: [],
  settings: defaultSettings, resets: [], session: {}, loginAttempts: {},
})

function loadLocal(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed.version === DB_VERSION) return parsed
    }
  } catch {
    // Dữ liệu hỏng hoặc trình duyệt chặn localStorage: dùng dữ liệu mẫu.
  }
  return createSeed()
}

let db: Database = isRemote ? emptyDb() : loadLocal()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Lưu vào localStorage; trả về false nếu bộ nhớ trình duyệt đã đầy. */
function persist(next: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return true
  } catch (error) {
    console.warn('Không thể lưu dữ liệu vào trình duyệt', error)
    return false
  }
}

export const getDb = () => db

// ---------- Đồng bộ với Supabase ----------

/** Lỗi khi ghi lên Supabase (đã được hiển thị bằng thông báo chung). */
export class SyncError extends Error {}

let syncTail: Promise<void> = Promise.resolve()
const syncErrorListeners = new Set<(message: string) => void>()

export const onSyncError = (listener: (message: string) => void) => {
  syncErrorListeners.add(listener)
  return () => syncErrorListeners.delete(listener)
}

let syncCount = 0
/** Số lần đã gửi thay đổi; dùng để biết một thao tác có ghi gì lên máy chủ không. */
export const getSyncCount = () => syncCount

/** Chờ mọi thay đổi đã gửi lên Supabase xong; báo lỗi nếu lần ghi gần nhất thất bại. */
export const waitForSync = () => syncTail

interface Status { ready: boolean; error?: string }
let status: Status = { ready: !isRemote }
const setStatus = (next: Status) => {
  status = next
  emit()
}
export const useStatus = () => useSyncExternalStore(subscribe, () => status)

/** Tải lại toàn bộ dữ liệu từ Supabase và xác định phiên đăng nhập hiện tại. */
export async function reloadRemote() {
  if (!supabase) return
  try {
    const [tables, { data }] = await Promise.all([loadRemote(), supabase.auth.getSession()])
    const authId = data.session?.user.id
    const profile = tables.users.find((u) => u.id === authId && u.isActive)
    db = {
      ...db,
      ...tables,
      settings: tables.settings ?? defaultSettings,
      session: profile ? (profile.role === 'customer' ? { customerId: profile.id } : { adminId: profile.id }) : {},
    }
    setStatus({ ready: true })
  } catch (error) {
    setStatus({ ready: status.ready, error: friendlyError(error instanceof Error ? error.message : String(error)) })
    throw error
  }
}

/**
 * Thay đổi dữ liệu. Hàm `recipe` nhận bản sao có thể sửa trực tiếp; sau khi chạy
 * xong, mọi màn hình đang dùng useDb() được cập nhật ngay. Ở chế độ Supabase,
 * thay đổi được gửi lên máy chủ theo thứ tự; nếu máy chủ từ chối thì dữ liệu
 * được tải lại từ Supabase và lỗi được báo qua onSyncError().
 */
export function mutate<T>(recipe: (draft: Database) => T, options: { remote?: RemoteTag } = {}): T {
  const prev = db
  const draft = structuredClone(db)
  const result = recipe(draft)
  if (!isRemote) {
    // Không lưu được thì giữ nguyên dữ liệu cũ, tránh mất thay đổi sau khi tải lại trang.
    if (!persist(draft)) throw new Error('Bộ nhớ trình duyệt đã đầy (thường do ảnh sản phẩm quá nhiều). Hãy xóa bớt ảnh hoặc khôi phục dữ liệu mẫu.')
    db = draft
    emit()
    return result
  }
  db = draft
  emit()
  syncCount += 1
  syncTail = syncTail
    .catch(() => undefined)
    .then(async () => {
      try {
        await pushChanges(prev, draft, options.remote)
        // Đặt hàng: tải lại để nhận mã đơn, tồn kho và điểm do database tính.
        if (options.remote) await reloadRemote()
      } catch (error) {
        const message = friendlyError(error instanceof Error ? error.message.replace(/^[a-z_]+: /, '') : String(error))
        syncErrorListeners.forEach((l) => l(message))
        await reloadRemote().catch(() => undefined)
        throw new SyncError(message)
      }
    })
  return result
}

/** Khôi phục dữ liệu mẫu (chỉ ở chế độ cục bộ). */
export function resetDb() {
  db = createSeed()
  persist(db)
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

if (isRemote && supabase) {
  void reloadRemote().catch(() => undefined)
  // Đăng xuất ở tab khác hoặc phiên hết hạn: tải lại dữ liệu theo quyền mới.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') void reloadRemote().catch(() => undefined)
  })
  // Quay lại tab thì tải dữ liệu mới nhất (đơn mới, thông báo mới…).
  window.addEventListener('focus', () => {
    if (status.ready) void syncTail.catch(() => undefined).then(() => reloadRemote()).catch(() => undefined)
  })
  // Realtime: khi người khác thay đổi dữ liệu (khách đặt đơn, nhân viên cập nhật trạng thái…),
  // tải lại sau một khoảng ngắn để gộp nhiều thay đổi liên tiếp. Supabase vẫn áp dụng RLS,
  // nên mỗi người chỉ nhận thay đổi của dữ liệu mình được xem.
  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleReload = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (status.ready) void syncTail.catch(() => undefined).then(() => reloadRemote()).catch(() => undefined)
    }, 1200)
  }
  // Gỡ kênh cũ (khi module được nạp lại trong lúc phát triển) trước khi đăng ký mới.
  for (const channel of supabase.getChannels()) if (channel.topic === 'realtime:panda-db') void supabase.removeChannel(channel)
  supabase
    .channel('panda-db')
    .on('postgres_changes', { event: '*', schema: 'public' }, scheduleReload)
    .subscribe()
  // Phiên đăng nhập đổi thì kênh realtime cần token mới để RLS áp đúng quyền.
  const client = supabase
  client.auth.onAuthStateChange((_event, session) => {
    void client.realtime.setAuth(session?.access_token ?? null)
  })
} else {
  // Đồng bộ khi mở nhiều tab (ví dụ: tab quản trị và tab cửa hàng).
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    db = loadLocal()
    emit()
  })
}

export function useDb(): Database
export function useDb<T>(selector: (db: Database) => T): T
export function useDb<T>(selector?: (db: Database) => T) {
  const snapshot = useSyncExternalStore(subscribe, getDb)
  return selector ? selector(snapshot) : snapshot
}
