-- Bật Realtime cho các bảng mà màn hình cần cập nhật tức thời.
-- Supabase vẫn áp dụng Row Level Security: mỗi người chỉ nhận thay đổi của dòng mình được xem.
alter publication supabase_realtime add table
  public.orders,
  public.order_events,
  public.order_requests,
  public.payments,
  public.products,
  public.variants,
  public.notifications,
  public.tickets,
  public.ticket_messages,
  public.tasks,
  public.stock_movements,
  public.reviews,
  public.coupons;
