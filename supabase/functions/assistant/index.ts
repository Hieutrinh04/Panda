// Edge Function "assistant": trợ lý AI của Panda Fashion theo kiến trúc RAG
// (Retrieval-Augmented Generation), dùng Google Gemini.
//
//  POST { action: 'index', documents }          — nhân viên/quản lý: nhúng (embedding) tài liệu sản phẩm,
//                                                 chính sách vào bảng kb_documents (pgvector). Chỉ nhúng lại
//                                                 tài liệu có nội dung thay đổi.
//  POST { scope, question, history, context }   — trả lời câu hỏi:
//        1. Nhúng câu hỏi (kèm câu hỏi trước đó để hiểu câu hỏi nối tiếp).
//        2. Truy xuất các tài liệu gần nhất bằng cosine (match_documents).
//        3. Đưa tài liệu truy xuất + dữ liệu riêng của người hỏi (đơn hàng, gợi ý cá nhân từ
//           hệ gợi ý) vào prompt, gọi Gemini, trả về câu trả lời có cấu trúc kèm nguồn.
//
// Secrets: GEMINI_API_KEY (bắt buộc); tùy chọn GEMINI_MODEL, GEMINI_EMBED_MODEL.
import { z } from 'npm:zod'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Thử lần lượt: mô hình cấu hình (hoặc mặc định), rồi các mô hình dự phòng
// khi tên không tồn tại (404) hoặc mô hình đang quá tải (503).
const MODELS = [...new Set([Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])]
const EMBED_MODEL = Deno.env.get('GEMINI_EMBED_MODEL') || 'gemini-embedding-001'
const EMBED_DIM = 768
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const Reply = z.object({
  text: z.string(),
  productIds: z.array(z.string()),
  links: z.array(z.object({ label: z.string(), to: z.string() })),
  table: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }).nullable(),
})

// JSON Schema tương ứng với Reply, gửi cho Gemini để mô hình trả đúng cấu trúc.
const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'productIds', 'links', 'table'],
  properties: {
    text: { type: 'string' },
    productIds: { type: 'array', items: { type: 'string' } },
    links: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['label', 'to'], properties: { label: { type: 'string' }, to: { type: 'string' } } },
    },
    table: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false, required: ['headers', 'rows'],
          properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } },
        },
      ],
    },
  },
}

const SHARED = `Bạn là trợ lý AI của cửa hàng thời trang Panda Fashion (bán và cho thuê áo dài, vest, đầm dạ hội, trang phục hóa trang, phụ kiện).
Luôn trả lời bằng tiếng Việt, ngắn gọn, thân thiện.
Thông tin về sản phẩm và chính sách CHỈ lấy từ phần "Tài liệu truy xuất" (mỗi tài liệu có mã nguồn trong ngoặc vuông). Nếu tài liệu không có thông tin thì nói rõ là không có, không bịa.
Giá viết theo dạng 1.290.000đ. Trường "text" là câu trả lời chính, có thể xuống dòng.
Chỉ trả về một đối tượng JSON gồm các trường text, productIds, links, table.`

const SYSTEM = {
  shop: `${SHARED}
Bạn tư vấn cho khách mua sắm: gợi ý trang phục theo dịp, ngân sách, màu, size, giới tính, mua hay thuê; giải thích tiền cọc, phí trả trễ, đổi trả, giao hàng, mã giảm giá, điểm thưởng.
Khi gợi ý sản phẩm, đưa tối đa 4 mã sản phẩm phù hợp nhất vào "productIds" (chỉ dùng mã p-... xuất hiện trong tài liệu truy xuất hoặc trong personalRecommendations).
Nếu khách hỏi chung chung ("gợi ý cho tôi", "nên mặc gì"), ưu tiên personalRecommendations — đó là kết quả của hệ gợi ý dựa trên lịch sử mua/thuê, yêu thích, giỏ hàng và sản phẩm khách đã xem; có thể nêu lý do gợi ý.
Với khách đã đăng nhập có thể tra đơn của chính họ trong myOrders.
"links" chỉ dùng các đường dẫn: /san-pham, /san-pham/<id>, /tai-khoan/don-hang/<id>, /tai-khoan/uu-dai, /tai-khoan/ho-tro. Không dùng "table" trừ khi liệt kê đơn hàng.`,
  admin: `${SHARED}
Bạn hỗ trợ quản lý/nhân viên tra cứu số liệu: doanh thu, đơn hàng, đơn thuê quá hạn, tồn kho, khách hàng, sản phẩm bán chạy (số liệu nằm trong phần "Dữ liệu nội bộ").
Khi có nhiều dòng số liệu, trình bày trong "table" (headers + rows, mọi ô là chuỗi). "productIds" để trống trừ khi nói về sản phẩm cụ thể.
"links" chỉ dùng các đường dẫn quản trị: /admin, /admin/don-mua?id=<id>, /admin/don-thue?id=<id>, /admin/kho, /admin/khach-hang?id=<id>, /admin/bao-cao, /admin/san-pham.
Nếu dữ liệu không có số liệu doanh thu thì người hỏi không có quyền xem doanh thu: nói rõ điều đó.`,
}

const FALLBACK = { text: 'Xin lỗi, mình chưa trả lời được câu này. Bạn thử hỏi cách khác hoặc liên hệ hotline cửa hàng nhé.', productIds: [], links: [], table: null }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Lấy đối tượng JSON từ câu trả lời, kể cả khi mô hình bọc trong ```json ... ```. */
function parseReply(content: string) {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const result = Reply.safeParse(JSON.parse(content.slice(start, end + 1)))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// ---------- Embedding ----------

async function gemini(path: string, body: unknown) {
  const res = await fetch(`${GEMINI}/${path}`, {
    method: 'POST',
    headers: { 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('Gemini error', path, res.status, detail.slice(0, 500))
    throw new HttpError(res.status, detail)
  }
  return res.json()
}

type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

/** Nhúng nhiều đoạn văn bản (tối đa 100 mỗi lần gọi), trả về vector 768 chiều đã chuẩn hóa. */
async function embed(texts: { text: string; title?: string }[], taskType: TaskType): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100)
    const data = await gemini(`${EMBED_MODEL}:batchEmbedContents`, {
      requests: batch.map((t) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t.text }] },
        taskType,
        ...(t.title && taskType === 'RETRIEVAL_DOCUMENT' ? { title: t.title } : {}),
        outputDimensionality: EMBED_DIM,
      })),
    })
    for (const e of data.embeddings as { values: number[] }[]) {
      const norm = Math.sqrt(e.values.reduce((s, v) => s + v * v, 0)) || 1
      out.push(e.values.map((v) => v / norm))
    }
  }
  return out
}

const toVector = (v: number[]) => `[${v.join(',')}]`

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- Phân quyền ----------

async function currentRole(req: Request) {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return undefined
  const { data: profile } = await admin.from('profiles').select('role, is_active').eq('id', userData.user.id).single()
  return profile?.is_active ? (profile.role as string) : undefined
}

// ---------- Lập chỉ mục ----------

interface KnowledgeDocument { id: string; kind: 'product' | 'policy'; refId?: string; title: string; content: string }

async function indexDocuments(documents: KnowledgeDocument[]) {
  const docs = documents
    .filter((d) => d && typeof d.id === 'string' && (d.kind === 'product' || d.kind === 'policy') && d.content?.trim())
    .slice(0, 1000)
    .map((d) => ({ ...d, title: String(d.title).slice(0, 200), content: String(d.content).slice(0, 4000) }))
  const hashes = await Promise.all(docs.map((d) => sha256(`${d.title}\n${d.content}`)))
  const { data: existing, error } = await admin.from('kb_documents').select('id, content_hash')
  if (error) throw error
  const known = new Map((existing ?? []).map((r) => [r.id as string, r.content_hash as string]))
  const changed = docs.map((d, i) => ({ ...d, hash: hashes[i] })).filter((d) => known.get(d.id) !== d.hash)

  if (changed.length) {
    const vectors = await embed(changed.map((d) => ({ text: d.content, title: d.title })), 'RETRIEVAL_DOCUMENT')
    const rows = changed.map((d, i) => ({
      id: d.id, kind: d.kind, ref_id: d.refId ?? null, title: d.title, content: d.content, content_hash: d.hash, embedding: toVector(vectors[i]), updated_at: new Date().toISOString(),
    }))
    const { error: upsertError } = await admin.from('kb_documents').upsert(rows)
    if (upsertError) throw upsertError
  }
  // Tài liệu không còn (sản phẩm bị ẩn/xóa) thì gỡ khỏi kho tri thức.
  const keep = new Set(docs.map((d) => d.id))
  const stale = [...known.keys()].filter((id) => !keep.has(id))
  if (stale.length) {
    const { error: deleteError } = await admin.from('kb_documents').delete().in('id', stale)
    if (deleteError) throw deleteError
  }
  return { total: docs.length, embedded: changed.length, removed: stale.length }
}

// ---------- Truy xuất ----------

interface Retrieved { id: string; kind: 'product' | 'policy'; ref_id: string | null; title: string; content: string; similarity: number }

async function retrieve(query: string): Promise<Retrieved[]> {
  const [vector] = await embed([{ text: query }], 'RETRIEVAL_QUERY')
  const call = (kinds: string[], count: number) => admin.rpc('match_documents', { query_embedding: toVector(vector), match_count: count, kinds })
  const [products, policies] = await Promise.all([call(['product'], 8), call(['policy'], 3)])
  if (products.error) throw products.error
  if (policies.error) throw policies.error
  // Ngưỡng tương đối: chỉ giữ tài liệu gần bằng tài liệu tốt nhất (điểm cosine của embedding
  // thường dồn trong khoảng hẹp nên ngưỡng tuyệt đối không lọc được).
  const productRows: Retrieved[] = products.data ?? []
  const policyRows: Retrieved[] = policies.data ?? []
  const best = (rows: Retrieved[]) => rows[0]?.similarity ?? 0
  const relevant = (rows: Retrieved[], margin: number, keep: number) => rows.filter((r, i) => i < keep || r.similarity >= best(rows) - margin)
  // Câu hỏi về chính sách (tài liệu chính sách gần hơn sản phẩm) chỉ cần ít sản phẩm.
  const policyQuestion = best(policyRows) > best(productRows)
  return [...relevant(productRows, policyQuestion ? 0 : 0.03, policyQuestion ? 2 : 4), ...relevant(policyRows, 0.03, 1)]
}

// ---------- Gọi mô hình ----------

async function generate(scope: 'shop' | 'admin', history: { role: string; content: string }[], prompt: string) {
  const request = {
    systemInstruction: { parts: [{ text: SYSTEM[scope] }] },
    contents: [
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: prompt }] },
    ],
    generationConfig: { maxOutputTokens: 4000, responseMimeType: 'application/json', responseJsonSchema: REPLY_SCHEMA },
  }
  let lastError: HttpError | undefined
  for (const model of MODELS) {
    try {
      const data = await gemini(`${model}:generateContent`, request)
      const parts = data?.candidates?.[0]?.content?.parts as { text?: string; thought?: boolean }[] | undefined
      const content = parts?.filter((p) => !p.thought && p.text).map((p) => p.text).join('')
      return content ? parseReply(content) ?? FALLBACK : FALLBACK
    } catch (error) {
      if (!(error instanceof HttpError) || (error.status !== 404 && error.status !== 503)) throw error
      console.warn('Gemini', model, error.status, '→ thử mô hình kế tiếp')
      lastError = error
    }
  }
  throw lastError ?? new HttpError(503, 'Không có mô hình khả dụng')
}

// ---------- Định tuyến ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!Deno.env.get('GEMINI_API_KEY')) return json({ error: 'Chưa cấu hình GEMINI_API_KEY cho Edge Function' }, 500)

  let body: { action?: string; documents?: KnowledgeDocument[]; scope?: string; question?: string; context?: unknown; history?: { role: 'user' | 'assistant'; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Dữ liệu gửi lên không hợp lệ' }, 400)
  }

  try {
    if (body.action === 'index') {
      const role = await currentRole(req)
      if (role !== 'manager' && role !== 'staff') return json({ error: 'Chỉ nhân viên/quản lý được cập nhật kho tri thức' }, 403)
      return json(await indexDocuments(Array.isArray(body.documents) ? body.documents : []))
    }

    const scope = body.scope === 'admin' ? 'admin' : 'shop'
    const question = String(body.question ?? '').trim()
    const context = JSON.stringify(body.context ?? {})
    if (!question || question.length > 1000) return json({ error: 'Câu hỏi trống hoặc quá dài' }, 400)
    if (context.length > 200_000) return json({ error: 'Dữ liệu ngữ cảnh quá lớn' }, 400)

    // Trợ lý quản trị chỉ dành cho tài khoản nhân viên/quản lý đang đăng nhập.
    if (scope === 'admin') {
      const role = await currentRole(req)
      if (!role) return json({ error: 'Vui lòng đăng nhập' }, 401)
      if (role === 'customer') return json({ error: 'Không có quyền' }, 403)
    }

    const history = (body.history ?? [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    // Lịch sử phải bắt đầu bằng lượt của người dùng.
    while (history.length && history[0].role !== 'user') history.shift()

    // Câu hỏi nối tiếp ("còn màu khác không?") cần câu hỏi trước để truy xuất đúng.
    const previous = history.filter((m) => m.role === 'user').at(-1)?.content ?? ''
    let documents: Retrieved[] = []
    try {
      documents = await retrieve(`${previous}\n${question}`.trim())
    } catch (error) {
      // Chưa chạy supabase/ai.sql hoặc lỗi embedding: vẫn trả lời bằng dữ liệu riêng của người hỏi.
      console.warn('RAG retrieval failed', error)
    }

    const knowledge = documents.length
      ? documents.map((d) => `[${d.ref_id ?? d.id}] ${d.content}`).join('\n\n')
      : '(Không truy xuất được tài liệu nào.)'
    const prompt = `Tài liệu truy xuất:\n${knowledge}\n\n${scope === 'admin' ? 'Dữ liệu nội bộ' : 'Dữ liệu của khách'} (JSON):\n${context}\n\nCâu hỏi: ${question}`
    const reply = await generate(scope, history, prompt)
    return json({ ...reply, sources: documents.map((d) => ({ title: d.title, kind: d.kind, similarity: Math.round(d.similarity * 1000) / 1000 })) })
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 400 && /API_KEY_INVALID|API key not valid/i.test(error.message)) return json({ error: 'GEMINI_API_KEY không hợp lệ' }, 500)
      if (error.status === 403) return json({ error: 'Khóa Gemini không có quyền dùng mô hình này' }, 500)
      if (error.status === 429) return json({ error: 'Trợ lý đã hết lượt miễn phí hoặc đang quá tải, thử lại sau' }, 429)
      return json({ error: `Lỗi dịch vụ AI (${error.status})` }, 502)
    }
    console.error('assistant error', error)
    return json({ error: 'Lỗi không xác định' }, 500)
  }
})
