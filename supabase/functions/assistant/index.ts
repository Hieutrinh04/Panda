// Edge Function "assistant": trợ lý AI của Panda Fashion dùng Claude.
// Trình duyệt gửi câu hỏi kèm dữ liệu cửa hàng mà người dùng đó được phép xem
// (đã lọc bởi RLS ở phía client), function gọi Claude và trả về câu trả lời có cấu trúc.
// Khóa ANTHROPIC_API_KEY lưu trong Supabase → Edge Functions → Secrets, không nằm ở frontend.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod'
import { z } from 'npm:zod'
import { createClient } from 'npm:@supabase/supabase-js@2'

const client = new Anthropic()

const Reply = z.object({
  text: z.string(),
  productIds: z.array(z.string()),
  links: z.array(z.object({ label: z.string(), to: z.string() })),
  table: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }).nullable(),
})

const SHARED = `Bạn là trợ lý AI của cửa hàng thời trang Panda Fashion (bán và cho thuê áo dài, vest, đầm dạ hội, trang phục hóa trang, phụ kiện).
Luôn trả lời bằng tiếng Việt, ngắn gọn, thân thiện. Chỉ dùng dữ liệu trong phần "Dữ liệu cửa hàng"; nếu không có thông tin thì nói rõ là không có, không bịa.
Giá viết theo dạng 1.290.000đ. Trường "text" là câu trả lời chính, có thể xuống dòng.`

const SYSTEM = {
  shop: `${SHARED}
Bạn tư vấn cho khách mua sắm: gợi ý trang phục theo dịp, ngân sách, màu, size, giới tính, mua hay thuê; giải thích tiền cọc, phí trả trễ, đổi trả, giao hàng, mã giảm giá, điểm thưởng.
Khi gợi ý sản phẩm, đưa tối đa 4 id sản phẩm phù hợp nhất vào "productIds" (chỉ id có trong dữ liệu). Với khách đã đăng nhập có thể tra đơn của chính họ.
"links" chỉ dùng các đường dẫn: /san-pham, /san-pham/<id>, /tai-khoan/don-hang/<id>, /tai-khoan/uu-dai, /tai-khoan/ho-tro. Không dùng "table" trừ khi liệt kê đơn hàng.`,
  admin: `${SHARED}
Bạn hỗ trợ quản lý/nhân viên tra cứu số liệu: doanh thu, đơn hàng, đơn thuê quá hạn, tồn kho, khách hàng, sản phẩm bán chạy.
Khi có nhiều dòng số liệu, trình bày trong "table" (headers + rows, mọi ô là chuỗi). "productIds" để trống trừ khi nói về sản phẩm cụ thể.
"links" chỉ dùng các đường dẫn quản trị: /admin, /admin/don-mua?id=<id>, /admin/don-thue?id=<id>, /admin/kho, /admin/khach-hang?id=<id>, /admin/bao-cao, /admin/san-pham.
Nếu dữ liệu không có số liệu doanh thu thì người hỏi không có quyền xem doanh thu: nói rõ điều đó.`,
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { scope?: string; question?: string; context?: unknown; history?: { role: 'user' | 'assistant'; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Dữ liệu gửi lên không hợp lệ' }, 400)
  }
  const scope = body.scope === 'admin' ? 'admin' : 'shop'
  const question = String(body.question ?? '').trim()
  const context = JSON.stringify(body.context ?? {})
  if (!question || question.length > 1000) return json({ error: 'Câu hỏi trống hoặc quá dài' }, 400)
  if (context.length > 200_000) return json({ error: 'Dữ liệu ngữ cảnh quá lớn' }, 400)

  // Trợ lý quản trị chỉ dành cho tài khoản nhân viên/quản lý đang đăng nhập.
  if (scope === 'admin') {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return json({ error: 'Vui lòng đăng nhập' }, 401)
    const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', userData.user.id).single()
    if (!profile || !profile.is_active || profile.role === 'customer') return json({ error: 'Không có quyền' }, 403)
  }

  const history = (body.history ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  // Lịch sử phải bắt đầu bằng lượt của người dùng.
  while (history.length && history[0].role !== 'user') history.shift()

  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM[scope], cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: zodOutputFormat(Reply) },
      messages: [...history, { role: 'user', content: `Dữ liệu cửa hàng (JSON):\n${context}\n\nCâu hỏi: ${question}` }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output)
      return json({ text: 'Xin lỗi, mình chưa trả lời được câu này. Bạn thử hỏi cách khác hoặc liên hệ hotline cửa hàng nhé.', productIds: [], links: [], table: null })
    return json(response.parsed_output)
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY cho Edge Function' }, 500)
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'Trợ lý đang quá tải, thử lại sau' }, 429)
    if (error instanceof Anthropic.APIError) return json({ error: `Lỗi dịch vụ AI (${error.status})` }, 502)
    return json({ error: 'Lỗi không xác định' }, 500)
  }
})
