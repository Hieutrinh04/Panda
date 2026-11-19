-- =====================================================================
-- Hệ gợi ý và RAG cho trợ lý AI.
-- Chạy file này một lần trong Supabase Dashboard → SQL Editor, sau schema.sql.
-- =====================================================================

-- ---------- 1. Thống kê cho lọc cộng tác (recommendation system) ----------
-- Khách hàng chỉ đọc được đơn của chính mình (RLS), nên trình duyệt không tự tính
-- được ma trận khách × sản phẩm. Hàm này trả số liệu TỔNG HỢP theo cặp sản phẩm
-- (không có id khách hay thông tin cá nhân), cùng trọng số với src/services/recommend.ts:
-- mua/thuê = 3, yêu thích = 2, trong giỏ = 1.
create or replace function public.recommendation_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  with raw as (
    select o.customer_id as u, oi.product_id as p, 3 as w
      from public.orders o join public.order_items oi on oi.order_id = o.id
      where o.status <> 'cancelled' and o.customer_id is not null and oi.product_id is not null
    union all
    select user_id, product_id, 2 from public.wishlists
    union all
    select c.user_id, v.product_id, 1 from public.cart_items c join public.variants v on v.id = c.variant_id
  ),
  agg as (select u, p, sum(w)::numeric as w from raw group by u, p),
  pairs as (
    select a.p as a, b.p as b, sum(a.w * b.w) as dot, count(*) as co
    from agg a join agg b on a.u = b.u and a.p <> b.p
    group by a.p, b.p
  ),
  items as (select p, sum(w * w) as sq, count(*) as n from agg group by p)
  select jsonb_build_object(
    'pairs', coalesce((select jsonb_agg(jsonb_build_array(a, b, dot, co)) from pairs), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_array(p, sq, n)) from items), '[]'::jsonb)
  )
$$;
grant execute on function public.recommendation_stats() to anon, authenticated;

-- ---------- 2. Kho tri thức cho RAG (Retrieval-Augmented Generation) ----------
-- Mỗi sản phẩm / chính sách là một tài liệu, kèm vector embedding 768 chiều
-- (Gemini gemini-embedding-001). Edge Function "assistant" nhúng câu hỏi, tìm các tài
-- liệu gần nhất bằng cosine rồi đưa vào ngữ cảnh cho mô hình.
create extension if not exists vector with schema extensions;

create table if not exists public.kb_documents (
  id            text primary key,              -- 'product:p-1', 'policy:shipping', ...
  kind          text not null check (kind in ('product', 'policy')),
  ref_id        text,                          -- id sản phẩm (nếu là sản phẩm)
  title         text not null,
  content       text not null,
  content_hash  text not null,                 -- nội dung đổi thì mới nhúng lại
  embedding     extensions.vector(768) not null,
  updated_at    timestamptz not null default now()
);

-- Chỉ Edge Function (service role) đọc/ghi; trình duyệt không truy cập trực tiếp.
alter table public.kb_documents enable row level security;

create index if not exists kb_documents_embedding_idx on public.kb_documents
  using hnsw (embedding extensions.vector_cosine_ops);

-- Tìm k tài liệu gần câu hỏi nhất (độ giống = 1 − khoảng cách cosine).
create or replace function public.match_documents(query_embedding extensions.vector(768), match_count int default 8, kinds text[] default null)
returns table (id text, kind text, ref_id text, title text, content text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.kind, d.ref_id, d.title, d.content, 1 - (d.embedding <=> query_embedding) as similarity
  from public.kb_documents d
  where kinds is null or d.kind = any (kinds)
  order by d.embedding <=> query_embedding
  limit match_count
$$;
revoke execute on function public.match_documents(extensions.vector, int, text[]) from public, anon, authenticated;
grant execute on function public.match_documents(extensions.vector, int, text[]) to service_role;
