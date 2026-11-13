# Hướng dẫn kết nối Supabase

Tài liệu này gồm hai phần:

- **Phần A — việc bạn làm trên Supabase** (khoảng 15 phút): tạo dự án, chạy lược đồ, lấy khóa kết nối, tạo tài khoản quản lý.
- **Phần B — việc làm trong mã nguồn**: thay lớp dữ liệu cục bộ bằng Supabase. Phần này mình (Claude) làm sau khi bạn xong phần A.

---

## Phần A — Thiết lập trên Supabase

### A1. Tạo dự án

1. Vào https://supabase.com → **Start your project** → đăng nhập bằng GitHub hoặc email.
2. **New project**:
   - **Name**: `panda-fashion`
   - **Database Password**: bấm *Generate* và lưu lại ở nơi an toàn (không dán vào chat, không đưa vào code).
   - **Region**: `Southeast Asia (Singapore)` — gần Việt Nam nhất.
   - Gói **Free** là đủ cho đồ án.
3. Chờ 1–2 phút để dự án khởi tạo xong.

### A2. Tạo bảng, phân quyền và kho ảnh

1. Mở **SQL Editor** (thanh bên trái) → **New query**.
2. Mở file [`supabase/schema.sql`](../supabase/schema.sql) trong dự án, sao chép **toàn bộ** nội dung, dán vào và bấm **Run**.
3. Kết quả phải báo `Success. No rows returned`. Kiểm tra lại ở **Table Editor**: có 24 bảng (`profiles`, `products`, `variants`, `orders`, …). Ở **Storage** có 2 bucket `product-images` và `avatars`.

File này tạo:

| Nhóm | Nội dung |
|---|---|
| Bảng dữ liệu | Tài khoản, địa chỉ, danh mục, nhà cung cấp, bộ sưu tập, sản phẩm, biến thể, phiếu kho, giỏ hàng, yêu thích, đơn hàng, chi tiết đơn, lịch sử đơn, thanh toán, yêu cầu hủy/đổi trả/gia hạn, mã giảm giá, đánh giá, thông báo, hỗ trợ, công việc, nhật ký, nhật ký AI, cài đặt |
| Phân quyền (RLS) | Khách chỉ thấy dữ liệu của mình; nhân viên xử lý đơn và kho; quản lý toàn quyền. Khách không tự đổi được vai trò hay tự cộng điểm |
| Trigger | Tự tạo hồ sơ khách hàng khi có người đăng ký |
| Hàm `email_for_login` | Cho phép đăng nhập trang quản trị bằng tên đăng nhập/SĐT như hiện tại |
| Storage | Bucket ảnh sản phẩm (chỉ quản lý tải lên) và ảnh đại diện (mỗi người một thư mục) |

### A3. Cấu hình đăng nhập

Vào **Authentication → Sign In / Providers → Email**:

- Bật **Enable Email provider**.
- Trong lúc phát triển, **tắt** *Confirm email* để đăng ký xong dùng được ngay. Khi nộp/chạy thật thì bật lại.
- **Minimum password length**: `6` (khớp với kiểm tra trong giao diện).

Vào **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:5173`
- **Redirect URLs**: thêm `http://localhost:5173/**` (dùng cho email khôi phục mật khẩu).

### A4. Lấy khóa kết nối

Vào **Project Settings → API** (hoặc nút **Connect** ở đầu trang), lấy 2 giá trị:

- **Project URL** — dạng `https://abcdxyz.supabase.co`
- **anon / publishable key** — chuỗi dài bắt đầu bằng `eyJ…` hoặc `sb_publishable_…`

Tạo file **`.env.local`** ở thư mục gốc dự án (cùng chỗ với `package.json`), theo mẫu [`.env.example`](../.env.example):

```env
VITE_SUPABASE_URL=https://abcdxyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> ⚠️ **Không bao giờ** dùng khóa `service_role` / `secret` trong frontend, trong file `.env.local` hay dán vào chat. Khóa đó bỏ qua mọi phân quyền. Khóa `anon` thì an toàn để nằm ở frontend vì dữ liệu đã được RLS bảo vệ.
>
> File `.env.local` đã nằm trong `.gitignore` (mẫu `*.local`) nên sẽ không bị đẩy lên GitHub.

### A5. Tạo tài khoản quản lý đầu tiên

1. **Authentication → Users → Add user → Create new user**: nhập email và mật khẩu của bạn, tích **Auto Confirm User**.
2. Quay lại **SQL Editor**, chạy (thay email của bạn):

   ```sql
   update public.profiles
   set role = 'manager', full_name = 'Quản lý Panda', username = 'admin'
   where email = 'email-cua-ban@example.com';
   ```

3. Kiểm tra ở **Table Editor → profiles**: dòng của bạn có `role = manager`.

Tài khoản nhân viên sau này do quản lý tạo trong trang quản trị (cần Edge Function ở bước B4, vì tạo tài khoản cho người khác đòi hỏi quyền quản trị của Supabase).

### A6. Báo cho mình

Khi xong, bạn chỉ cần nhắn **"đã tạo xong Supabase"**. Không cần gửi khóa vào chat — mình đọc từ `.env.local` trên máy bạn.

---

## Phần B — Thay lớp dữ liệu trong mã nguồn

> **Trạng thái:** đã làm xong. Có `.env.local` thì ứng dụng tự chạy với Supabase; xóa file đó thì quay về dữ liệu cục bộ (bộ kiểm thử `npm test` luôn chạy cục bộ).
>
> | Phần | File |
> |---|---|
> | Client Supabase, dịch lỗi sang tiếng Việt | `src/lib/supabase.ts` |
> | Tải dữ liệu và ghi thay đổi lên các bảng | `src/data/remote.ts`, `src/data/store.ts` |
> | Đặt hàng trong một giao dịch trên database | hàm `place_order` trong `supabase/schema.sql` |
> | Đăng nhập, đăng ký, quên mật khẩu, đổi mật khẩu | `src/services/auth.ts`, trang `/dat-lai-mat-khau` |
> | Tạo tài khoản nhân viên | `createStaffAccount` trong `src/services/people.ts` (không cần Edge Function) |
> | Ảnh lên Storage | `src/lib/images.ts` |
> | Nạp dữ liệu mẫu | Quản trị → Nội dung & cài đặt → "Nạp dữ liệu mẫu lên Supabase" |
>
> Khách vãng lai do nhân viên tạo tại quầy có hồ sơ nhưng chưa có tài khoản; khi họ tự đăng ký bằng cùng SĐT/email, hồ sơ và lịch sử mua/thuê được gắn vào tài khoản mới.
>
> Phần dưới đây giữ lại làm tài liệu thiết kế.

Ứng dụng đã được tổ chức để việc chuyển chỉ chạm vào hai chỗ:

```
Giao diện (admin/, shop/)  ──đọc──▶  useDb()            (src/data/store.ts)
                           ──ghi──▶  services/*.ts  ──▶  mutate()
```

Giao diện không gọi thẳng localStorage, nên khi thay `store.ts` và phần ghi trong `services/` sang Supabase thì các màn hình giữ nguyên.

### B1. Cài thư viện và tạo client

```bash
npm install @supabase/supabase-js
```

Tạo `src/lib/supabase.ts` khởi tạo client từ `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.

### B2. Đăng nhập bằng Supabase Auth

| Hiện tại (`services/auth.ts`) | Sau khi chuyển |
|---|---|
| So mật khẩu băm trong localStorage | `supabase.auth.signInWithPassword` |
| Đăng nhập admin bằng tên đăng nhập | Gọi `rpc('email_for_login')` lấy email rồi đăng nhập |
| Mã khôi phục hiện trên màn hình | `supabase.auth.resetPasswordForEmail` gửi email thật |
| Khóa tạm sau 5 lần sai | Supabase tự giới hạn số lần thử; giữ thêm bộ đếm phía giao diện |
| Phiên lưu trong `db.session` | Phiên của Supabase (`onAuthStateChange`) |

Lưu ý: Supabase chỉ có **một phiên đăng nhập mỗi trình duyệt**, nên không thể vừa đăng nhập trang khách vừa trang quản trị cùng lúc bằng hai tài khoản như bản cục bộ. Muốn thử cả hai thì dùng một cửa sổ ẩn danh.

### B3. Đọc và ghi dữ liệu

Cách làm theo hai giai đoạn để ít rủi ro:

1. **Đồng bộ ghi (write-through):** khi mở ứng dụng, tải các bảng người dùng được phép xem vào bộ nhớ; `useDb()` vẫn đọc như cũ. Sau mỗi `mutate()`, so sánh dữ liệu trước/sau và `upsert`/`delete` đúng những dòng thay đổi lên Supabase. Bộ kiểm thử `npm test` vẫn dùng được để kiểm tra nghiệp vụ.
2. **Chuyển nghiệp vụ quan trọng xuống database:** các thao tác cần chống gian lận và tranh chấp khi nhiều người đặt cùng lúc được viết thành hàm Postgres gọi qua `supabase.rpc(...)`:
   - `place_order` — kiểm tra tồn kho/lịch thuê, trừ kho, tính giảm giá, ghi lượt dùng mã, trừ điểm, tạo đơn trong **một giao dịch**. Bắt buộc phải có, vì theo phân quyền khách hàng không được tự sửa tồn kho hay mã giảm giá.
   - `advance_order`, `resolve_request` — đổi trạng thái đơn, thu/hoàn tiền, cộng/thu hồi điểm.

### B4. Edge Functions

| Function | Dùng cho |
|---|---|
| `create-staff` | Quản lý tạo tài khoản nhân viên (dùng khóa `service_role` trên máy chủ Supabase, không lộ ra frontend) |
| `assistant` | Trợ lý AI dùng mô hình ngôn ngữ thật thay cho bộ quy tắc hiện tại, giữ nguyên định dạng `AiReply` |

Khóa API của dịch vụ AI được lưu bằng **Project Settings → Edge Functions → Secrets**, không đặt trong frontend.

### B5. Ảnh

Ảnh sản phẩm và ảnh đại diện chuyển từ base64 sang Storage: tải lên bucket rồi lưu URL công khai vào `products.images` / `profiles.avatar_url`. Lỗi "bộ nhớ trình duyệt đầy" sẽ không còn.

### B6. Nạp dữ liệu mẫu

Một script đọc `src/data/seed.ts` và ghi danh mục, sản phẩm, biến thể, mã giảm giá, cài đặt cửa hàng lên Supabase để có dữ liệu demo. Đơn hàng mẫu cần tài khoản khách thật, nên chỉ nạp nếu bạn muốn có biểu đồ doanh thu khi bảo vệ đồ án.

### B7. Kiểm tra sau khi chuyển

- `npm test` vẫn đạt.
- Chạy tay các luồng: đăng ký → đặt mua và đặt thuê → nhân viên xử lý → trả đồ trễ → hoàn cọc → đánh giá.
- Đăng nhập bằng tài khoản khách rồi thử gọi API đọc đơn của người khác: phải bị chặn (kiểm tra RLS).

---

## Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| `Invalid API key` | Sai `VITE_SUPABASE_ANON_KEY`, hoặc chưa khởi động lại `npm run dev` sau khi sửa `.env.local` |
| `new row violates row-level security policy` | Tài khoản không đủ quyền với thao tác đó; kiểm tra `role` trong bảng `profiles` |
| Đăng ký xong không đăng nhập được | *Confirm email* đang bật; tắt ở bước A3 hoặc xác nhận email |
| Đăng nhập được nhưng không vào được trang quản trị | `role` của tài khoản vẫn là `customer`; chạy lại câu lệnh ở bước A5 |
| Chạy `schema.sql` lần hai báo `already exists` | Lược đồ đã được tạo; không cần chạy lại. Muốn làm lại từ đầu thì dùng **Project Settings → General → Reset/Pause** hoặc tạo dự án mới |
| Dự án gói Free bị tạm dừng | Supabase tạm dừng dự án không hoạt động sau 7 ngày; vào Dashboard bấm **Restore** |

---

## Phần C — Cập nhật tức thời và trợ lý AI

### C1. Realtime

Chạy [`supabase/realtime.sql`](../supabase/realtime.sql) trong SQL Editor. Sau đó, khi khách đặt đơn hay nhân viên đổi trạng thái, các màn hình đang mở tự tải lại sau khoảng 1 giây. Supabase vẫn áp dụng phân quyền: mỗi người chỉ nhận thay đổi của dữ liệu mình được xem. Chưa chạy file này thì ứng dụng vẫn dùng được, chỉ cập nhật khi bạn quay lại tab.

### C2. Trợ lý AI dùng Claude (Edge Function `assistant`)

Mã nằm ở [`supabase/functions/assistant/index.ts`](../supabase/functions/assistant/index.ts). Trình duyệt gửi câu hỏi kèm dữ liệu người dùng được phép xem; function gọi Claude (`claude-opus-5-5`, effort `low`) và trả về câu trả lời có cấu trúc: lời đáp, sản phẩm gợi ý, liên kết, bảng số liệu. Trợ lý quản trị kiểm tra tài khoản là nhân viên/quản lý trước khi trả lời.

Triển khai trên Dashboard:

1. **Edge Functions → Deploy a new function → Via Editor**, đặt tên `assistant`, dán nội dung file `index.ts`, bấm **Deploy**.
2. Trong cài đặt của function, **tắt "Verify JWT with legacy secret"**. Khóa `sb_publishable_…` không phải JWT nên khách chưa đăng nhập sẽ bị chặn nếu để bật; function tự kiểm tra quyền cho trợ lý quản trị.
3. **Edge Functions → Secrets → Add new secret**: tên `ANTHROPIC_API_KEY`, giá trị là khóa API của bạn từ console.anthropic.com. Khóa chỉ nằm trên máy chủ Supabase, không đưa vào frontend hay `.env.local`.

Chưa triển khai function hoặc chưa có khóa thì trợ lý tự dùng bộ quy tắc cục bộ như trước. Các câu lệnh nhập liệu ("Thêm sản phẩm …", "Nhập kho …") luôn dùng bộ quy tắc vì cần bản nháp chính xác.

Chi phí: mỗi câu hỏi gửi kèm danh mục sản phẩm (khoảng vài nghìn token). Function chưa giới hạn số lần hỏi theo người dùng; nếu đưa website lên mạng công khai nên thêm giới hạn tần suất.
