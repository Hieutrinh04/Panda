import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Có cấu hình Supabase trong .env.local thì dùng Supabase; không thì chạy với dữ liệu cục bộ. */
export const isRemote = Boolean(url && key)

export const supabase: SupabaseClient | null = isRemote ? createClient(url!, key!) : null

/**
 * Client phụ không lưu phiên, dùng khi quản lý tạo tài khoản nhân viên để
 * không làm mất phiên đăng nhập của chính quản lý.
 */
export const createDetachedClient = () =>
  createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'panda-detached' } })

/** Đổi thông báo lỗi kỹ thuật của Supabase sang tiếng Việt dễ hiểu. */
export function friendlyError(message: string) {
  if (/Invalid login credentials/i.test(message)) return 'Tài khoản hoặc mật khẩu không đúng.'
  if (/Email not confirmed/i.test(message)) return 'Email chưa được xác nhận. Vui lòng mở email và bấm liên kết xác nhận.'
  if (/User already registered/i.test(message)) return 'Email đã được sử dụng.'
  if (/row-level security/i.test(message)) return 'Bạn không có quyền thực hiện thao tác này.'
  if (/schema cache|does not exist/i.test(message)) return 'Database chưa được tạo bảng. Hãy chạy file supabase/schema.sql trên Supabase.'
  if (/rate limit/i.test(message)) return 'Thao tác quá nhiều lần, vui lòng thử lại sau ít phút.'
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'
  if (/Database error saving new user/i.test(message)) return 'Không tạo được tài khoản (số điện thoại có thể đã được dùng).'
  return message
}
