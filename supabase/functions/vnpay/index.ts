// Edge Function "vnpay": thanh toán đơn hàng qua cổng VNPay (sandbox).
//
//  POST { action: 'create', orderIds, returnUrl }  — khách đã đăng nhập: tạo giao dịch, trả về link sang VNPay.
//  POST { action: 'verify', query }                — trang /thanh-toan/ket-qua gửi lại tham số VNPay trả về.
//  GET  ?vnp_...                                   — IPN: máy chủ VNPay báo kết quả (cấu hình URL này ở trang merchant).
//
// Kết quả chỉ được ghi khi chữ ký vnp_SecureHash khớp với khóa bí mật, nên khách không thể tự
// đánh dấu đơn là đã trả. Secrets cần có: VNPAY_TMN_CODE, VNPAY_HASH_SECRET
// (tùy chọn VNPAY_URL, mặc định là cổng sandbox).
import { createClient } from 'npm:@supabase/supabase-js@2'

const VNPAY_URL = Deno.env.get('VNPAY_URL') || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
const TMN_CODE = Deno.env.get('VNPAY_TMN_CODE') ?? ''
const HASH_SECRET = Deno.env.get('VNPAY_HASH_SECRET') ?? ''

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Ý nghĩa một số mã vnp_ResponseCode thường gặp.
const RESPONSE_MESSAGE: Record<string, string> = {
  '00': 'Giao dịch thành công',
  '07': 'Trừ tiền thành công nhưng giao dịch bị nghi ngờ',
  '09': 'Thẻ/tài khoản chưa đăng ký Internet Banking',
  '10': 'Xác thực thông tin thẻ/tài khoản không đúng quá 3 lần',
  '11': 'Đã hết hạn chờ thanh toán',
  '12': 'Thẻ/tài khoản bị khóa',
  '13': 'Nhập sai mật khẩu xác thực giao dịch (OTP)',
  '24': 'Bạn đã hủy giao dịch',
  '51': 'Tài khoản không đủ số dư',
  '65': 'Tài khoản đã vượt quá hạn mức giao dịch trong ngày',
  '75': 'Ngân hàng thanh toán đang bảo trì',
  '79': 'Nhập sai mật khẩu thanh toán quá số lần quy định',
}

// ---------- Chữ ký ----------

/** Chuỗi ký theo chuẩn VNPay: sắp xếp theo tên tham số, mã hóa URL, khoảng trắng thành '+'. */
function signData(params: Record<string, string>) {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+')
  return Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join('&')
}

async function hmacSha512(data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(HASH_SECRET), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(query: Record<string, string>) {
  const { vnp_SecureHash, vnp_SecureHashType: _type, ...rest } = query
  const vnpParams = Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith('vnp_')))
  if (!vnp_SecureHash) return false
  return (await hmacSha512(signData(vnpParams))).toLowerCase() === vnp_SecureHash.toLowerCase()
}

/** Thời gian theo giờ Việt Nam (GMT+7), dạng yyyyMMddHHmmss. */
function vnTime(date: Date) {
  const d = new Date(date.getTime() + 7 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

// ---------- Ghi nhận kết quả (dùng chung cho IPN và trang kết quả) ----------

type Outcome = { code: 'paid' | 'failed' | 'invalid_signature' | 'not_found' | 'invalid_amount'; message: string; orderIds?: string[]; amount?: number }

async function applyResult(query: Record<string, string>): Promise<Outcome> {
  if (!(await verifySignature(query))) return { code: 'invalid_signature', message: 'Chữ ký không hợp lệ' }
  const { data: txn } = await admin.from('vnpay_transactions').select('*').eq('txn_ref', query.vnp_TxnRef).maybeSingle()
  if (!txn) return { code: 'not_found', message: 'Không tìm thấy giao dịch' }
  const amount = Number(txn.amount)
  if (Number(query.vnp_Amount) !== amount * 100) return { code: 'invalid_amount', message: 'Số tiền không khớp', orderIds: txn.order_ids }

  const success = query.vnp_ResponseCode === '00' && (query.vnp_TransactionStatus ?? '00') === '00'
  if (success) {
    const { error } = await admin.rpc('vnpay_mark_paid', { p_txn_ref: txn.txn_ref, p_transaction_no: query.vnp_TransactionNo ?? null, p_bank_code: query.vnp_BankCode ?? null })
    if (error) throw error
    return { code: 'paid', message: RESPONSE_MESSAGE['00'], orderIds: txn.order_ids, amount }
  }
  if (txn.status === 'pending')
    await admin.from('vnpay_transactions').update({ status: 'failed', response_code: query.vnp_ResponseCode ?? null }).eq('txn_ref', txn.txn_ref)
  // Trang kết quả có thể được mở lại sau khi IPN đã ghi nhận thành công.
  if (txn.status === 'paid') return { code: 'paid', message: RESPONSE_MESSAGE['00'], orderIds: txn.order_ids, amount }
  return { code: 'failed', message: RESPONSE_MESSAGE[query.vnp_ResponseCode] ?? `Thanh toán không thành công (mã ${query.vnp_ResponseCode})`, orderIds: txn.order_ids, amount }
}

// ---------- Tạo link thanh toán ----------

async function createPayment(req: Request, body: { orderIds?: unknown; returnUrl?: unknown }) {
  const user = await createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  }).auth.getUser()
  const userId = user.data.user?.id
  if (!userId) return json({ error: 'Vui lòng đăng nhập để thanh toán' }, 401)

  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String).slice(0, 5) : []
  const returnUrl = String(body.returnUrl ?? '')
  if (!orderIds.length) return json({ error: 'Thiếu đơn hàng cần thanh toán' }, 400)
  if (!/^https?:\/\/[^/?#]+\/thanh-toan\/ket-qua$/.test(returnUrl)) return json({ error: 'Địa chỉ trả về không hợp lệ' }, 400)

  const { data: orders, error } = await admin.from('orders').select('id, code, customer_id, status, payment_method, total').in('id', orderIds)
  if (error) throw error
  if (!orders || orders.length !== orderIds.length) return json({ error: 'Không tìm thấy đơn hàng' }, 404)
  for (const o of orders) {
    if (o.customer_id !== userId) return json({ error: 'Không thể thanh toán đơn của người khác' }, 403)
    if (o.payment_method !== 'vnpay') return json({ error: `Đơn ${o.code} không chọn thanh toán VNPay` }, 400)
    if (o.status === 'cancelled') return json({ error: `Đơn ${o.code} đã bị hủy` }, 400)
  }
  const { data: paid } = await admin.from('payments').select('order_id').in('order_id', orderIds).in('type', ['sale', 'rental'])
  if (paid?.length) return json({ error: 'Đơn hàng đã được thanh toán' }, 400)

  const amount = orders.reduce((s, o) => s + Number(o.total), 0)
  if (amount < 5000) return json({ error: 'VNPay chỉ nhận giao dịch từ 5.000đ' }, 400)
  const txnRef = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
  const { error: insertError } = await admin.from('vnpay_transactions').insert({ txn_ref: txnRef, order_ids: orderIds, customer_id: userId, amount })
  if (insertError) throw insertError

  const now = new Date()
  const params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: TMN_CODE,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Thanh toan don hang ${orders.map((o) => o.code).join(' ')}`,
    vnp_OrderType: 'other',
    vnp_Amount: String(amount * 100),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: (req.headers.get('x-forwarded-for') ?? '127.0.0.1').split(',')[0].trim(),
    vnp_CreateDate: vnTime(now),
    vnp_ExpireDate: vnTime(new Date(now.getTime() + 15 * 60_000)),
  }
  const data = signData(params)
  return json({ url: `${VNPAY_URL}?${data}&vnp_SecureHash=${await hmacSha512(data)}`, txnRef, amount })
}

// ---------- Định tuyến ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!TMN_CODE || !HASH_SECRET) return json({ error: 'Chưa cấu hình VNPAY_TMN_CODE / VNPAY_HASH_SECRET cho Edge Function' }, 500)

  try {
    // IPN: VNPay gọi GET kèm tham số kết quả; phải trả RspCode theo quy ước của VNPay.
    if (req.method === 'GET') {
      const query = Object.fromEntries(new URL(req.url).searchParams)
      if (!query.vnp_TxnRef) return json({ RspCode: '99', Message: 'Missing params' })
      const { data: before } = await admin.from('vnpay_transactions').select('status').eq('txn_ref', query.vnp_TxnRef).maybeSingle()
      const result = await applyResult(query)
      if (result.code === 'invalid_signature') return json({ RspCode: '97', Message: 'Invalid signature' })
      if (result.code === 'not_found') return json({ RspCode: '01', Message: 'Order not found' })
      if (result.code === 'invalid_amount') return json({ RspCode: '04', Message: 'Invalid amount' })
      if (before?.status && before.status !== 'pending') return json({ RspCode: '02', Message: 'Order already confirmed' })
      return json({ RspCode: '00', Message: 'Confirm Success' })
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const body = await req.json().catch(() => ({}))
    if (body.action === 'create') return await createPayment(req, body)
    if (body.action === 'verify') {
      const query = Object.fromEntries(Object.entries(body.query ?? {}).map(([k, v]) => [k, String(v)]))
      return json(await applyResult(query))
    }
    return json({ error: 'Thao tác không hợp lệ' }, 400)
  } catch (error) {
    console.error('vnpay error', error)
    return json({ error: 'Lỗi xử lý thanh toán, vui lòng thử lại' }, 500)
  }
})
