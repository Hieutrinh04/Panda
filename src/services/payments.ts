// Thanh toán trực tuyến qua VNPay (sandbox), thông qua Edge Function "vnpay".
// Trình duyệt chỉ xin link thanh toán và chuyển tiếp kết quả VNPay trả về;
// việc kiểm tra chữ ký và ghi khoản thu diễn ra trên máy chủ.
import type { Id } from '../types'
import { isRemote, supabase } from '../lib/supabase'
import { reloadRemote } from '../data/store'
import { fail } from './core'

/** Chỉ dùng được khi ứng dụng kết nối Supabase (cần Edge Function). */
export const vnpayAvailable = isRemote

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) return fail('Thanh toán VNPay cần kết nối Supabase.')
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('vnpay', { body })
  if (error) {
    // Lấy thông báo lỗi tiếng Việt do function trả về (nếu có).
    const context = (error as { context?: Response }).context
    const detail = context ? await context.json().catch(() => null) : null
    fail(detail?.error ?? 'Không kết nối được cổng thanh toán, vui lòng thử lại.')
  }
  if (!data) return fail('Cổng thanh toán không phản hồi.')
  if (data.error) fail(data.error)
  return data
}

/** Tạo giao dịch và trả về link trang thanh toán VNPay cho các đơn. */
export async function startVnpayPayment(orderIds: Id[]) {
  const { url } = await invoke<{ url: string }>({ action: 'create', orderIds, returnUrl: `${window.location.origin}/thanh-toan/ket-qua` })
  return url
}

export interface VnpayResult {
  code: 'paid' | 'failed' | 'invalid_signature' | 'not_found' | 'invalid_amount'
  message: string
  orderIds?: Id[]
  amount?: number
}

/** Gửi tham số VNPay trả về để máy chủ kiểm tra chữ ký và ghi nhận kết quả. */
export async function verifyVnpayReturn(search: string): Promise<VnpayResult> {
  const query = Object.fromEntries(new URLSearchParams(search))
  if (!query.vnp_TxnRef) fail('Không có thông tin giao dịch.')
  const result = await invoke<VnpayResult>({ action: 'verify', query })
  await reloadRemote().catch(() => undefined)
  return result
}
