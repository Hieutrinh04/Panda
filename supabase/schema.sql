-- =====================================================================
-- Panda Fashion — lược đồ cơ sở dữ liệu cho Supabase (PostgreSQL)
-- Chạy toàn bộ file này một lần trong Supabase Dashboard → SQL Editor.
-- Tên bảng/cột tương ứng với kiểu dữ liệu trong src/types/index.ts
-- (camelCase trong code ↔ snake_case trong database).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tài khoản ----------

-- Hồ sơ người dùng. Người có tài khoản đăng nhập dùng chung id với auth.users;
-- khách vãng lai do nhân viên tạo tại quầy có hồ sơ nhưng chưa có tài khoản
-- (khi họ tự đăng ký bằng cùng SĐT/email, hồ sơ được gắn với tài khoản mới).
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  role        text not null default 'customer' check (role in ('manager', 'staff', 'customer')),
  full_name   text not null,
  email       text unique,
  phone       text unique,
  username    text unique,
  avatar_url  text,
  gender      text check (gender in ('Nam', 'Nữ', 'Khác')),
  birth_date  date,
  is_active   boolean not null default true,
  points      integer not null default 0 check (points >= 0),
  note        text,
  position    text,
  created_at  timestamptz not null default now()
);

create table public.addresses (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references public.profiles (id) on update cascade on delete cascade,
  label       text not null,
  receiver    text not null,
  phone       text not null,
  line        text not null,
  is_default  boolean not null default false
);

-- ---------- Danh mục & sản phẩm ----------

create table public.categories  (id text primary key default gen_random_uuid()::text, name text not null unique, description text);
create table public.suppliers   (id text primary key default gen_random_uuid()::text, name text not null unique, phone text, email text, address text);
create table public.collections (id text primary key default gen_random_uuid()::text, name text not null unique, description text);

create table public.products (
  id                    text primary key default gen_random_uuid()::text,
  name                  text not null,
  category_id           text not null references public.categories (id),
  supplier_id           text references public.suppliers (id),
  collection_id         text references public.collections (id),
  description           text not null default '',
  material              text not null default '',
  gender                text not null check (gender in ('Nam', 'Nữ', 'Unisex')),
  images                text[] not null default '{}',
  mode                  text not null check (mode in ('sale', 'rental', 'both')),
  sale_price            numeric(14, 0) not null default 0 check (sale_price >= 0),
  rental_price_per_day  numeric(14, 0) not null default 0 check (rental_price_per_day >= 0),
  deposit               numeric(14, 0) not null default 0 check (deposit >= 0),
  status                text not null default 'active' check (status in ('active', 'hidden')),
  featured              boolean not null default false,
  created_at            timestamptz not null default now()
);

create table public.variants (
  id          text primary key default gen_random_uuid()::text,
  product_id  text not null references public.products (id) on delete cascade,
  sku         text not null unique,
  size        text not null,
  color       text not null,
  stock       integer not null default 0 check (stock >= 0)
);

create table public.stock_movements (
  id           text primary key default gen_random_uuid()::text,
  variant_id   text not null references public.variants (id) on delete cascade,
  type         text not null check (type in ('import', 'export', 'adjust', 'sale', 'rental_out', 'rental_return', 'cancel_return')),
  quantity     integer not null,
  note         text,
  status       text not null default 'approved' check (status in ('approved', 'pending', 'rejected')),
  user_id      uuid references public.profiles (id) on update cascade,
  approved_by  uuid references public.profiles (id) on update cascade,
  created_at   timestamptz not null default now()
);

-- ---------- Giỏ hàng & yêu thích ----------

create table public.cart_items (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references public.profiles (id) on update cascade on delete cascade,
  variant_id    text not null references public.variants (id) on delete cascade,
  mode          text not null check (mode in ('sale', 'rental')),
  quantity      integer not null check (quantity > 0),
  rental_start  date,
  rental_end    date
);

create table public.wishlists (
  user_id     uuid not null references public.profiles (id) on update cascade on delete cascade,
  product_id  text not null references public.products (id) on delete cascade,
  primary key (user_id, product_id)
);

-- ---------- Đơn hàng ----------

create table public.orders (
  id                text primary key default gen_random_uuid()::text,
  code              text not null unique,
  type              text not null check (type in ('sale', 'rental')),
  channel           text not null check (channel in ('online', 'store')),
  customer_id       uuid references public.profiles (id) on update cascade,
  customer_name     text not null,
  phone             text not null,
  address           text not null,
  delivery_method   text not null check (delivery_method in ('delivery', 'pickup')),
  subtotal          numeric(14, 0) not null,
  discount          numeric(14, 0) not null default 0,
  points_used       integer not null default 0,
  points_earned     integer not null default 0,
  shipping_fee      numeric(14, 0) not null default 0,
  deposit_total     numeric(14, 0) not null default 0,
  total             numeric(14, 0) not null,
  coupon_code       text,
  payment_method    text not null check (payment_method in ('cod', 'bank', 'cash', 'card')),
  status            text not null check (status in ('pending', 'confirmed', 'shipping', 'renting', 'returned', 'completed', 'cancelled')),
  note              text,
  assigned_to       uuid references public.profiles (id) on update cascade,
  carrier           text,
  tracking_code     text,
  -- Thông tin thuê (null với đơn mua)
  rental_start      date,
  rental_end        date,
  delivered_at      timestamptz,
  returned_at       timestamptz,
  condition_out     text,
  condition_in      text,
  late_fee          numeric(14, 0) not null default 0,
  damage_fee        numeric(14, 0) not null default 0,
  deposit_refunded  numeric(14, 0) not null default 0,
  extended_days     integer not null default 0,
  created_by        uuid references public.profiles (id) on update cascade,
  created_at        timestamptz not null default now()
);

create table public.order_items (
  id          text primary key default gen_random_uuid()::text,
  order_id    text not null references public.orders (id) on delete cascade,
  product_id  text references public.products (id) on delete set null,
  variant_id  text references public.variants (id) on delete set null,
  name        text not null,
  sku         text not null,
  size        text not null,
  color       text not null,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(14, 0) not null,
  deposit     numeric(14, 0) not null default 0,
  days        integer not null default 0
);

-- Lịch sử xử lý đơn (timeline)
create table public.order_events (
  id        text primary key default gen_random_uuid()::text,
  order_id  text not null references public.orders (id) on delete cascade,
  status    text not null,
  at        timestamptz not null default now(),
  "by"      uuid references public.profiles (id) on update cascade,
  note      text
);

create table public.payments (
  id          text primary key default gen_random_uuid()::text,
  order_id    text not null references public.orders (id) on delete cascade,
  type        text not null check (type in ('sale', 'rental', 'deposit', 'deposit_refund', 'refund', 'late_fee', 'damage_fee', 'shipping')),
  amount      numeric(14, 0) not null,  -- dương: cửa hàng thu; âm: cửa hàng trả
  method      text not null check (method in ('cod', 'bank', 'cash', 'card')),
  note        text,
  user_id     uuid references public.profiles (id) on update cascade,
  created_at  timestamptz not null default now()
);

create table public.order_requests (
  id             text primary key default gen_random_uuid()::text,
  order_id       text not null references public.orders (id) on delete cascade,
  customer_id    uuid references public.profiles (id) on update cascade,
  type           text not null check (type in ('cancel', 'return', 'refund', 'extend')),
  reason         text not null,
  extend_days    integer,
  refund_amount  numeric(14, 0),
  status         text not null default 'pending' check (status in ('pending', 'forwarded', 'approved', 'rejected')),
  staff_note     text,
  handled_by     uuid references public.profiles (id) on update cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- Khuyến mãi, đánh giá, thông báo, hỗ trợ ----------

create table public.coupons (
  id            text primary key default gen_random_uuid()::text,
  code          text not null unique,
  description   text not null default '',
  kind          text not null check (kind in ('percent', 'fixed')),
  value         numeric(14, 0) not null check (value > 0),
  max_discount  numeric(14, 0),
  min_order     numeric(14, 0) not null default 0,
  applies_to    text not null default 'all' check (applies_to in ('all', 'sale', 'rental')),
  min_tier      text,
  start_at      date not null,
  end_at        date not null,
  usage_limit   integer not null,
  used          integer not null default 0,
  active        boolean not null default true
);

create table public.reviews (
  id           text primary key default gen_random_uuid()::text,
  product_id   text not null references public.products (id) on delete cascade,
  customer_id  uuid not null references public.profiles (id) on update cascade on delete cascade,
  order_id     text not null references public.orders (id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  comment      text not null,
  hidden       boolean not null default false,
  reply        text,
  created_at   timestamptz not null default now(),
  unique (order_id, product_id)
);

create table public.notifications (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references public.profiles (id) on update cascade on delete cascade,
  title       text not null,
  body        text not null,
  link        text,
  read        boolean not null default false,
  key         text unique,  -- chống tạo trùng thông báo nhắc hạn trả
  created_at  timestamptz not null default now()
);

create table public.tickets (
  id           text primary key default gen_random_uuid()::text,
  customer_id  uuid not null references public.profiles (id) on update cascade on delete cascade,
  type         text not null check (type in ('feedback', 'complaint', 'support')),
  subject      text not null,
  order_id     text references public.orders (id) on delete set null,
  status       text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  assigned_to  uuid references public.profiles (id) on update cascade,
  created_at   timestamptz not null default now()
);

create table public.ticket_messages (
  id         text primary key default gen_random_uuid()::text,
  ticket_id  text not null references public.tickets (id) on delete cascade,
  "from"     uuid not null references public.profiles (id) on update cascade,
  text       text not null,
  at         timestamptz not null default now()
);

create table public.tasks (
  id           text primary key default gen_random_uuid()::text,
  title        text not null,
  description  text,
  assignee_id  uuid not null references public.profiles (id) on update cascade,
  due_date     date,
  status       text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by   uuid not null references public.profiles (id) on update cascade,
  created_at   timestamptz not null default now()
);

create table public.activity_logs (
  id       text primary key default gen_random_uuid()::text,
  user_id  uuid references public.profiles (id) on update cascade on delete set null,
  action   text not null,
  target   text,
  at       timestamptz not null default now()
);

create table public.ai_logs (
  id        text primary key default gen_random_uuid()::text,
  user_id   uuid references public.profiles (id) on update cascade on delete set null,
  scope     text not null check (scope in ('shop', 'admin')),
  question  text not null,
  answer    text not null,
  at        timestamptz not null default now()
);

-- Cài đặt cửa hàng: một dòng duy nhất (id = 1)
create table public.store_settings (
  id        integer primary key default 1 check (id = 1),
  settings  jsonb not null
);

create index on public.variants (product_id);
create index on public.orders (customer_id);
create index on public.orders (status);
create index on public.order_items (order_id);
create index on public.order_items (variant_id);
create index on public.payments (order_id);
create index on public.payments (created_at);
create index on public.notifications (user_id, read);

-- =====================================================================
-- Hàm hỗ trợ phân quyền
-- =====================================================================

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() in ('manager', 'staff'), false) $$;

create or replace function public.is_manager() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() = 'manager', false) $$;

-- Khi có người đăng ký tài khoản: nếu đã có hồ sơ khách vãng lai trùng SĐT/email
-- (chưa gắn tài khoản) thì gắn hồ sơ đó với tài khoản mới, giữ nguyên lịch sử mua/thuê;
-- nếu không thì tạo hồ sơ khách hàng mới.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := nullif(new.raw_user_meta_data ->> 'phone', '');
  v_name text := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1));
  v_username text := split_part(new.email, '@', 1);
  v_existing uuid;
begin
  select p.id into v_existing from public.profiles p
  where p.role = 'customer'
    and not exists (select 1 from auth.users u where u.id = p.id)
    and ((v_phone is not null and p.phone = v_phone) or lower(p.email) = lower(new.email))
  limit 1;

  if v_existing is not null then
    update public.profiles set id = new.id, email = new.email, full_name = v_name where id = v_existing;
    return new;
  end if;

  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '-' || substr(new.id::text, 1, 4);
  end if;
  if v_phone is not null and exists (select 1 from public.profiles where phone = v_phone) then
    raise exception 'Số điện thoại đã được sử dụng';
  end if;

  insert into public.profiles (id, full_name, email, phone, username)
  values (new.id, v_name, new.email, v_phone, v_username);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chỉ quản lý được đổi vai trò, trạng thái khóa; chỉ nhân viên/quản lý được cộng điểm thưởng.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if not public.is_manager() and auth.uid() is not null then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      raise exception 'Bạn không có quyền thay đổi vai trò hoặc trạng thái tài khoản';
    end if;
    -- Khách chỉ được giảm điểm (dùng điểm khi thanh toán), không tự cộng điểm.
    if not public.is_staff() and new.points > old.points then
      raise exception 'Bạn không có quyền cộng điểm thưởng';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Cho phép đăng nhập trang quản trị bằng tên đăng nhập hoặc SĐT:
-- trả về email tương ứng để gọi supabase.auth.signInWithPassword.
create or replace function public.email_for_login(identifier text) returns text
language sql stable security definer set search_path = public as $$
  select email from public.profiles
  where lower(email) = lower(identifier) or lower(username) = lower(identifier) or phone = identifier
  limit 1
$$;
grant execute on function public.email_for_login(text) to anon, authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.profiles         enable row level security;
alter table public.addresses        enable row level security;
alter table public.categories       enable row level security;
alter table public.suppliers        enable row level security;
alter table public.collections      enable row level security;
alter table public.products         enable row level security;
alter table public.variants         enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.cart_items       enable row level security;
alter table public.wishlists        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.order_events     enable row level security;
alter table public.payments         enable row level security;
alter table public.order_requests   enable row level security;
alter table public.coupons          enable row level security;
alter table public.reviews          enable row level security;
alter table public.notifications    enable row level security;
alter table public.tickets          enable row level security;
alter table public.ticket_messages  enable row level security;
alter table public.tasks            enable row level security;
alter table public.activity_logs    enable row level security;
alter table public.ai_logs          enable row level security;
alter table public.store_settings   enable row level security;

-- Hồ sơ: tự xem/sửa của mình; nhân viên xem tất cả; quản lý sửa tất cả.
create policy "profiles_select" on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid());
create policy "profiles_staff_write" on public.profiles for update using (public.is_staff());
-- Nhân viên tạo hồ sơ khách tại quầy; chỉ quản lý tạo được hồ sơ nhân viên.
create policy "profiles_staff_insert" on public.profiles for insert with check (public.is_manager() or (public.is_staff() and role = 'customer'));

create policy "addresses_own" on public.addresses for all using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid() or public.is_staff());

-- Danh mục, sản phẩm, biến thể, mã giảm giá, cài đặt: ai cũng xem được; nhân viên/quản lý ghi.
create policy "categories_read"  on public.categories  for select using (true);
create policy "suppliers_read"   on public.suppliers   for select using (public.is_staff());
create policy "collections_read" on public.collections for select using (true);
create policy "categories_write"  on public.categories  for all using (public.is_manager()) with check (public.is_manager());
create policy "suppliers_write"   on public.suppliers   for all using (public.is_manager()) with check (public.is_manager());
create policy "collections_write" on public.collections for all using (public.is_manager()) with check (public.is_manager());

create policy "products_read" on public.products for select using (status = 'active' or public.is_staff());
create policy "products_write" on public.products for all using (public.is_manager()) with check (public.is_manager());
create policy "variants_read" on public.variants for select using (true);
-- Nhân viên cần cập nhật tồn kho khi bán tại quầy; sửa thông tin sản phẩm chỉ quản lý.
create policy "variants_write" on public.variants for all using (public.is_staff()) with check (public.is_staff());

create policy "movements_staff" on public.stock_movements for all using (public.is_staff()) with check (public.is_staff());

create policy "coupons_read" on public.coupons for select using (true);
create policy "coupons_write" on public.coupons for all using (public.is_manager()) with check (public.is_manager());
-- Nhân viên hủy đơn thì trả lại lượt dùng mã.
create policy "coupons_staff_update" on public.coupons for update using (public.is_staff());

create policy "settings_read" on public.store_settings for select using (true);
create policy "settings_write" on public.store_settings for all using (public.is_manager()) with check (public.is_manager());

-- Giỏ hàng, yêu thích: của chính khách.
create policy "cart_own" on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "wishlist_own" on public.wishlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Đơn hàng và dữ liệu đi kèm: khách xem đơn của mình; nhân viên toàn quyền.
create policy "orders_select" on public.orders for select using (customer_id = auth.uid() or public.is_staff());
create policy "orders_insert" on public.orders for insert with check (customer_id = auth.uid() or public.is_staff());
create policy "orders_update" on public.orders for update using (public.is_staff());

create policy "order_items_select" on public.order_items for select
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "order_items_insert" on public.order_items for insert
  with check (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "order_items_update" on public.order_items for update using (public.is_staff());

create policy "order_events_select" on public.order_events for select
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "order_events_insert" on public.order_events for insert
  with check (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create policy "payments_select" on public.payments for select
  using (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
-- Khách chỉ ghi được khoản thanh toán online lúc đặt hàng (cổng thanh toán giả lập).
create policy "payments_insert" on public.payments for insert
  with check (public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'pending'));

create policy "requests_select" on public.order_requests for select using (customer_id = auth.uid() or public.is_staff());
create policy "requests_insert" on public.order_requests for insert with check (customer_id = auth.uid() or public.is_staff());
create policy "requests_update" on public.order_requests for update using (public.is_staff());

create policy "reviews_read" on public.reviews for select using (not hidden or customer_id = auth.uid() or public.is_staff());
create policy "reviews_insert" on public.reviews for insert with check (customer_id = auth.uid());
create policy "reviews_moderate" on public.reviews for all using (public.is_manager()) with check (public.is_manager());

create policy "notifications_own" on public.notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update using (user_id = auth.uid());
-- Thông báo được tạo bởi người dùng đang đăng nhập (đặt hàng, nhân viên cập nhật đơn…)
create policy "notifications_insert" on public.notifications for insert with check (auth.uid() is not null);

create policy "tickets_select" on public.tickets for select using (customer_id = auth.uid() or public.is_staff());
create policy "tickets_insert" on public.tickets for insert with check (customer_id = auth.uid() or public.is_staff());
create policy "tickets_update" on public.tickets for update using (customer_id = auth.uid() or public.is_staff());
create policy "ticket_messages_select" on public.ticket_messages for select
  using (public.is_staff() or exists (select 1 from public.tickets t where t.id = ticket_id and t.customer_id = auth.uid()));
create policy "ticket_messages_insert" on public.ticket_messages for insert
  with check ("from" = auth.uid() or public.is_staff());

create policy "tasks_select" on public.tasks for select using (assignee_id = auth.uid() or public.is_manager());
create policy "tasks_update" on public.tasks for update using (assignee_id = auth.uid() or public.is_manager());
create policy "tasks_manage" on public.tasks for all using (public.is_manager()) with check (public.is_manager());

create policy "activity_insert" on public.activity_logs for insert with check (auth.uid() is not null);
create policy "activity_read" on public.activity_logs for select using (public.is_manager());
create policy "ai_logs_insert" on public.ai_logs for insert with check (true);
create policy "ai_logs_read" on public.ai_logs for select using (public.is_manager());

-- =====================================================================
-- Lưu trữ ảnh (Supabase Storage)
-- =====================================================================

insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;

create policy "product_images_read" on storage.objects for select using (bucket_id = 'product-images');
create policy "product_images_write" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_manager());
create policy "product_images_delete" on storage.objects for delete using (bucket_id = 'product-images' and public.is_manager());
create policy "avatars_read" on storage.objects for select using (bucket_id = 'avatars');
-- Mỗi người chỉ tải ảnh vào thư mục mang id của mình: avatars/<user-id>/...
create policy "avatars_write" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Đặt hàng: chạy trong một giao dịch, kiểm tra lại giá, tồn kho, lịch thuê,
-- mã giảm giá và điểm thưởng trên dữ liệu thật rồi mới ghi. Khách hàng không
-- có quyền sửa trực tiếp tồn kho/mã giảm giá nên mọi đơn đều đi qua hàm này.
-- payload: { customer_id, coupon_code, points_used,
--            orders[], items[], events[], payments[], movements[] }  (cột snake_case)
-- Trả về [{ id, code }] với mã đơn do database cấp.
-- =====================================================================
create or replace function public.place_order(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean := public.is_staff();
  v_customer uuid := nullif(payload ->> 'customer_id', '')::uuid;
  v_points_used integer := coalesce((payload ->> 'points_used')::int, 0);
  v_points_earned integer := 0;
  v_coupon text := nullif(payload ->> 'coupon_code', '');
  v_prefix text := 'PD' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD');
  v_seq integer;
  v_code text;
  v_result jsonb := '[]'::jsonb;
  o jsonb;
  it jsonb;
  r jsonb;
  prod public.products%rowtype;
  var public.variants%rowtype;
  v_qty integer;
  v_days integer;
  v_booked integer;
  v_sub numeric;
  v_dep numeric;
begin
  if v_uid is null then raise exception 'Vui lòng đăng nhập để đặt hàng'; end if;
  if not v_staff and v_customer is distinct from v_uid then raise exception 'Không thể đặt hàng thay người khác'; end if;
  if v_points_used < 0 then raise exception 'Điểm thưởng không hợp lệ'; end if;

  -- Khóa để hai người đặt cùng lúc không lấy trùng mã đơn hay vượt tồn kho.
  perform pg_advisory_xact_lock(hashtext('panda_place_order'));
  select coalesce(max(nullif(regexp_replace(substr(code, length(v_prefix) + 1), '[^0-9]', '', 'g'), '')::int), 0)
    into v_seq from public.orders where code like v_prefix || '%';

  for o in select value from jsonb_array_elements(payload -> 'orders') loop
    if not v_staff and ((o ->> 'channel') <> 'online' or (o ->> 'status') <> 'pending' or (o ->> 'customer_id')::uuid is distinct from v_uid) then
      raise exception 'Đơn hàng không hợp lệ';
    end if;
    if not v_staff and coalesce((o ->> 'points_earned')::int, 0) > 0 then raise exception 'Đơn hàng không hợp lệ'; end if;
    v_points_earned := v_points_earned + coalesce((o ->> 'points_earned')::int, 0);

    v_seq := v_seq + 1;
    v_code := v_prefix || lpad(v_seq::text, 3, '0');
    insert into public.orders select * from jsonb_populate_record(null::public.orders, o || jsonb_build_object('code', v_code));

    v_sub := 0;
    v_dep := 0;
    for it in select value from jsonb_array_elements(payload -> 'items') where value ->> 'order_id' = o ->> 'id' loop
      v_qty := (it ->> 'quantity')::int;
      if v_qty is null or v_qty < 1 then raise exception 'Số lượng không hợp lệ'; end if;
      select * into prod from public.products where id = it ->> 'product_id';
      if not found or prod.status <> 'active' then raise exception '% hiện đã ngừng kinh doanh', it ->> 'name'; end if;
      select * into var from public.variants where id = it ->> 'variant_id' and product_id = prod.id for update;
      if not found then raise exception 'Biến thể của % không còn tồn tại', prod.name; end if;

      if (o ->> 'type') = 'sale' then
        if prod.mode = 'rental' or (it ->> 'unit_price')::numeric <> prod.sale_price then
          raise exception 'Giá của % đã thay đổi, vui lòng tải lại trang', prod.name;
        end if;
        if var.stock < v_qty then raise exception '% (%/%) chỉ còn % sản phẩm', prod.name, var.size, var.color, var.stock; end if;
        update public.variants set stock = stock - v_qty where id = var.id;
        v_sub := v_sub + prod.sale_price * v_qty;
      else
        v_days := (it ->> 'days')::int;
        if prod.mode = 'sale' or (it ->> 'unit_price')::numeric <> prod.rental_price_per_day or (it ->> 'deposit')::numeric <> prod.deposit then
          raise exception 'Giá thuê của % đã thay đổi, vui lòng tải lại trang', prod.name;
        end if;
        if v_days is null or v_days < 1 then raise exception 'Số ngày thuê không hợp lệ'; end if;
        -- Đồ đang ở chỗ khách mà quá hạn vẫn bị giữ cho tới khi trả.
        select coalesce(sum(oi.quantity), 0) into v_booked
        from public.order_items oi join public.orders x on x.id = oi.order_id
        where oi.variant_id = var.id and x.type = 'rental' and x.status in ('pending', 'confirmed', 'renting')
          and x.rental_start <= (o ->> 'rental_end')::date
          and (case when x.status = 'renting' and x.rental_end < current_date then current_date else x.rental_end end) >= (o ->> 'rental_start')::date;
        if v_booked + v_qty > var.stock then
          raise exception '% (%/%) đã kín lịch thuê trong khoảng ngày này', prod.name, var.size, var.color;
        end if;
        v_sub := v_sub + prod.rental_price_per_day * v_qty * v_days;
        v_dep := v_dep + prod.deposit * v_qty;
      end if;
      insert into public.order_items select * from jsonb_populate_record(null::public.order_items, it);
    end loop;

    if v_sub <> (o ->> 'subtotal')::numeric or v_dep <> (o ->> 'deposit_total')::numeric then
      raise exception 'Tổng tiền đơn hàng không khớp, vui lòng tải lại trang';
    end if;
    if (o ->> 'discount')::numeric < 0 or (o ->> 'discount')::numeric > v_sub
       or ((o ->> 'discount')::numeric > 0 and v_coupon is null and v_points_used = 0) then
      raise exception 'Giảm giá không hợp lệ';
    end if;
    if (o ->> 'total')::numeric <> v_sub - (o ->> 'discount')::numeric + (o ->> 'shipping_fee')::numeric + v_dep then
      raise exception 'Tổng tiền đơn hàng không khớp, vui lòng tải lại trang';
    end if;

    v_result := v_result || jsonb_build_object('id', o ->> 'id', 'code', v_code);
  end loop;

  for r in select value from jsonb_array_elements(coalesce(payload -> 'events', '[]')) loop
    insert into public.order_events select * from jsonb_populate_record(null::public.order_events, r);
  end loop;
  for r in select value from jsonb_array_elements(coalesce(payload -> 'payments', '[]')) loop
    -- Khách chỉ ghi được khoản trả trước online (chuyển khoản/thẻ).
    if not v_staff and ((r ->> 'method') not in ('bank', 'card') or (r ->> 'type') not in ('sale', 'rental', 'shipping', 'deposit')) then
      raise exception 'Thanh toán không hợp lệ';
    end if;
    insert into public.payments select * from jsonb_populate_record(null::public.payments, r);
  end loop;
  for r in select value from jsonb_array_elements(coalesce(payload -> 'movements', '[]')) loop
    insert into public.stock_movements select * from jsonb_populate_record(null::public.stock_movements, r || jsonb_build_object('type', 'sale', 'status', 'approved'));
  end loop;

  if v_coupon is not null then
    update public.coupons set used = used + 1
    where code = v_coupon and active and current_date between start_at and end_at and used < usage_limit;
    if not found then raise exception 'Mã giảm giá đã hết hạn hoặc hết lượt sử dụng'; end if;
  end if;

  if v_customer is not null and (v_points_used > 0 or v_points_earned > 0) then
    update public.profiles set points = points - v_points_used + v_points_earned
    where id = v_customer and points >= v_points_used;
    if not found then raise exception 'Điểm thưởng không đủ'; end if;
  end if;

  return v_result;
end $$;

revoke execute on function public.place_order(jsonb) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;
