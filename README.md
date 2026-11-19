# Panda Fashion — Website bán & cho thuê thời trang tích hợp AI

Đồ án tốt nghiệp: *Xây dựng website kinh doanh cửa hàng thời trang Panda tích hợp AI hỗ trợ khách hàng.*

Gồm hai phần trong cùng một ứng dụng React + TypeScript (Vite):

- **Trang khách hàng** (`/`): xem, tìm kiếm, lọc sản phẩm; mua hoặc thuê; giỏ hàng, thanh toán; tài khoản cá nhân; trợ lý AI tư vấn.
- **Trang quản trị** (`/admin`): dành cho quản lý và nhân viên, phân quyền theo vai trò.

> **Trạng thái backend:** dữ liệu hiện được lưu trong trình duyệt (`localStorage`) qua lớp `src/data/store.ts`, để hoàn thiện giao diện và nghiệp vụ trước. Backend sẽ chuyển sang **Supabase** (Auth, Postgres + RLS, Storage, Edge Functions). Thư mục `backend/` (FastAPI + MySQL) là bản cũ, không còn được frontend sử dụng. Hướng dẫn kết nối: [docs/SUPABASE.md](docs/SUPABASE.md); lược đồ database: [supabase/schema.sql](supabase/schema.sql).

## Chạy dự án

```bash
npm install
npm run dev
```

Mở http://localhost:5173 (trang khách) và http://localhost:5173/admin (quản trị).

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản lý | `admin` | `admin123` |
| Nhân viên | `nhanvien` | `staff123` |
| Khách hàng | `khachhang@panda.vn` | `123456` |

Kiểm thử tự động các luồng nghiệp vụ (đặt hàng, hủy/hoàn tiền, thuê–trả–phí trễ–hoàn cọc, gia hạn, đổi trả, mã giảm giá, điểm thưởng, khóa đăng nhập, duyệt kho):

```bash
npm test
```

Dữ liệu mẫu (38 sản phẩm có ảnh chụp thật, 104 biến thể, đơn mua/thuê 4 tuần gần nhất, khách hàng, mã giảm giá…) được tạo lần đầu. Muốn làm lại từ đầu: **Quản trị → Nội dung & cài đặt → Khôi phục dữ liệu mẫu**.

## Chức năng theo đề cương

### Khách hàng chưa đăng nhập
- Trang chủ, danh mục, bộ sưu tập, danh sách sản phẩm.
- Tìm kiếm từ khóa (không phân biệt dấu); lọc theo giá, kích thước, màu, giới tính, mua/thuê, còn hàng; sắp xếp.
- Chi tiết sản phẩm: ảnh, biến thể (màu/size/SKU), giá bán, giá thuê, tiền cọc, tình trạng tồn kho/lịch thuê theo ngày.
- Xem bình luận, đánh giá (điểm trung bình, phân bố sao, phản hồi của shop).
- Đăng ký, đăng nhập (khóa tạm sau 5 lần sai), khôi phục mật khẩu bằng mã xác nhận.
- Trợ lý AI: gợi ý sản phẩm theo dịp, ngân sách, màu, size, mua/thuê; giải đáp cọc, phí trễ, đổi trả, giao hàng, khuyến mãi.

### Khách hàng đã đăng nhập
- Hồ sơ, ảnh đại diện, đổi mật khẩu, sổ địa chỉ.
- Danh sách yêu thích; giỏ hàng (thêm/sửa/xóa, chọn biến thể, số lượng, ngày thuê).
- Đặt hàng: giao tận nơi / nhận tại cửa hàng, mã giảm giá, dùng điểm thưởng, thanh toán COD hoặc qua cổng **VNPay sandbox** (khi chạy với Supabase; bản cục bộ dùng cổng giả lập). Giỏ có cả hàng mua và hàng thuê được tách thành 2 đơn.
- Theo dõi trạng thái, mã vận đơn, chi tiết đơn mua/đơn thuê; in hóa đơn; mua lại đơn cũ; yêu cầu hủy, đổi trả, hoàn tiền, gia hạn thuê.
- Theo dõi tiền cọc, hạn trả, phí phát sinh; lịch sử thanh toán, hoàn tiền, hoàn cọc.
- Đánh giá sản phẩm sau khi đơn hoàn tất; nhận thông báo (đơn hàng, nhắc hạn trả, khuyến mãi); gửi góp ý/khiếu nại/hỗ trợ.

### Nhân viên
- Tra cứu khách hàng, sản phẩm, tồn kho, lịch thuê.
- Tạo đơn mua/thuê tại quầy (khách vãng lai được lưu hồ sơ).
- In hóa đơn / phiếu thuê; ghi nhận yêu cầu hủy, đổi trả, gia hạn thay khách tại quầy.
- Xử lý đơn: xác nhận, giao cho đơn vị vận chuyển (kèm mã vận đơn), giao đồ thuê (ghi tình trạng), nhận lại đồ (tự tính phí trễ, nhập phí bồi thường), hoàn tất & hoàn cọc.
- Ghi nhận các khoản thu/chi; tiếp nhận yêu cầu hủy/đổi trả/hoàn tiền/gia hạn và chuyển quản lý duyệt; đề xuất điều chỉnh kho.
- Hỗ trợ khách, công việc được phân công, hồ sơ cá nhân.

### Quản lý
- Toàn bộ quyền của nhân viên, cộng thêm:
- Nhân viên: tạo, sửa, khóa tài khoản, phân quyền, phân công đơn/công việc/hỗ trợ.
- Sản phẩm, biến thể, giá; danh mục, nhà cung cấp, bộ sưu tập; nhập/xuất/điều chỉnh kho, duyệt điều chỉnh.
- Phê duyệt hủy đơn, đổi trả, hoàn tiền, gia hạn.
- Khuyến mãi (mã giảm giá theo loại đơn, đơn tối thiểu, hạng thành viên, thời hạn, số lượt), điểm thưởng, hạng thành viên.
- Nội dung website, bình luận & đánh giá (ẩn, xóa, phản hồi), góp ý/khiếu nại.
- Báo cáo doanh thu, đơn hàng, khách hàng, tiền cọc, phí phát sinh, tồn kho (xuất CSV); nhật ký hoạt động và nhật ký trợ lý AI.
- Trợ lý AI: tra cứu doanh thu, tồn kho, khách hàng, đơn hàng, đơn quá hạn; nhập nhanh sản phẩm/nhập kho bằng câu lệnh.

## Cấu trúc mã nguồn

```
src/
├── types/          Kiểu dữ liệu nghiệp vụ (tương ứng các bảng sẽ tạo trên Supabase)
├── data/           Kho dữ liệu cục bộ (store.ts) và dữ liệu mẫu (seed.ts)
├── services/       Nghiệp vụ: auth, catalog, inventory, orders, promotions, people,
│                   engagement (đánh giá, thông báo, hỗ trợ), reports, ai
├── components/     Thành phần giao diện dùng chung, trợ lý AI, thông báo
├── admin/          Trang quản trị (layout, menu phân quyền, các trang)
├── shop/           Trang khách hàng và khu vực tài khoản
├── lib/            Định dạng tiền/ngày, hình minh họa sản phẩm
└── styles/         CSS trang quản trị và trang khách hàng
```

Các màn hình chỉ đọc dữ liệu qua `useDb()` và ghi qua hàm trong `src/services`. Khi chuyển sang Supabase, chỉ cần thay `src/data/store.ts` và phần truy cập dữ liệu trong `src/services`. Trợ lý AI (`services/ai.ts`) hiện hiểu tiếng Việt bằng bộ quy tắc; hàm `askAssistant()` có thể chuyển sang gọi Edge Function dùng mô hình ngôn ngữ mà không cần đổi giao diện.

## Giới hạn của bản hiện tại

- Dữ liệu nằm trong trình duyệt: mỗi trình duyệt có dữ liệu riêng, xóa dữ liệu trang web là mất.
- Mật khẩu chỉ được băm đơn giản; email khôi phục mật khẩu, cổng thanh toán và đơn vị vận chuyển là giả lập.
- Ảnh tải lên được thu nhỏ và lưu dạng base64; sản phẩm chưa có ảnh dùng hình minh họa tự vẽ.
