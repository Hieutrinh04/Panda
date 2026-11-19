-- =====================================================================
-- Thanh toán qua VNPay (môi trường sandbox).
-- Chạy file này một lần trong Supabase Dashboard → SQL Editor, sau schema.sql.
-- Edge Function "vnpay" tạo giao dịch và gọi vnpay_mark_paid khi VNPay báo
-- thanh toán thành công (đã kiểm tra chữ ký). Trình duyệt không tự ghi được.
-- =====================================================================

-- Thêm phương thức thanh toán 'vnpay'.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cod', 'bank', 'cash', 'card', 'vnpay'));
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('cod', 'bank', 'cash', 'card', 'vnpay'));

-- Mỗi lần khách bấm thanh toán là một giao dịch (vnp_TxnRef). Một giao dịch có thể
-- trả cho nhiều đơn, vì giỏ có cả hàng mua và hàng thuê được tách thành 2 đơn.
create table if not exists public.vnpay_transactions (
  txn_ref         text primary key,
  order_ids       text[] not null,
  customer_id     uuid references public.profiles (id) on update cascade on delete set null,
  amount          numeric(14, 0) not null check (amount > 0),
  status          text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  response_code   text,
  transaction_no  text,
  bank_code       text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

alter table public.vnpay_transactions enable row level security;
drop policy if exists "vnpay_select" on public.vnpay_transactions;
create policy "vnpay_select" on public.vnpay_transactions for select
  using (customer_id = auth.uid() or public.is_staff());

-- Ghi nhận thanh toán thành công: thêm các khoản thu (tiền hàng/thuê, phí giao, tiền cọc)
-- cho từng đơn của giao dịch, ghi vào lịch sử đơn và báo cho khách. Gọi nhiều lần
-- (IPN và trang kết quả cùng báo về) vẫn chỉ ghi một lần.
create or replace function public.vnpay_mark_paid(p_txn_ref text, p_transaction_no text, p_bank_code text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  t public.vnpay_transactions%rowtype;
  o public.orders%rowtype;
  v_note text := 'VNPay · mã GD ' || coalesce(p_transaction_no, '');
  v_money text;
begin
  select * into t from public.vnpay_transactions where txn_ref = p_txn_ref for update;
  if not found then return 'not_found'; end if;
  if t.status = 'paid' then return 'already_paid'; end if;

  for o in select * from public.orders where id = any (t.order_ids) for update loop
    if not exists (select 1 from public.payments where order_id = o.id and type in ('sale', 'rental')) then
      insert into public.payments (order_id, type, amount, method, note)
        values (o.id, o.type, o.subtotal - o.discount, 'vnpay', v_note);
      if o.shipping_fee > 0 then
        insert into public.payments (order_id, type, amount, method, note) values (o.id, 'shipping', o.shipping_fee, 'vnpay', v_note);
      end if;
      if o.deposit_total > 0 then
        insert into public.payments (order_id, type, amount, method, note) values (o.id, 'deposit', o.deposit_total, 'vnpay', v_note);
      end if;
      v_money := replace(to_char(o.total, 'FM999,999,999,999'), ',', '.') || 'đ';
      insert into public.order_events (order_id, status, note)
        values (o.id, o.status, 'Đã thanh toán ' || v_money || ' qua VNPay (mã GD ' || coalesce(p_transaction_no, '') || ')');
      if o.customer_id is not null then
        insert into public.notifications (user_id, title, body, link)
          values (o.customer_id, 'Thanh toán thành công #' || o.code, 'Panda đã nhận ' || v_money || ' qua VNPay.', '/tai-khoan/don-hang/' || o.id);
      end if;
    end if;
  end loop;

  update public.vnpay_transactions
    set status = 'paid', response_code = '00', transaction_no = p_transaction_no, bank_code = p_bank_code, paid_at = now()
    where txn_ref = p_txn_ref;
  return 'ok';
end $$;

revoke execute on function public.vnpay_mark_paid(text, text, text) from public, anon, authenticated;
grant execute on function public.vnpay_mark_paid(text, text, text) to service_role;
