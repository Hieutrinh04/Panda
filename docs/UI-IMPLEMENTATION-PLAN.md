# Kế hoạch triển khai UI — Panda + Fashion Admin

> Trạng thái: Prototype tham chiếu, chưa phải đặc tả cuối cùng.
>
> Nguyên tắc: mỗi màn hình phải có log triển khai gồm **đã hoàn thành** và **sẽ triển khai tiếp theo**. Khi prototype thay đổi, cập nhật lại phạm vi và log thay vì cố giữ cứng thiết kế cũ.

## 1. Mục tiêu triển khai

- Chuyển bộ prototype hiện tại thành giao diện quản trị React có thể điều hướng được.
- Ưu tiên đúng cấu trúc và luồng thao tác trước; màu sắc, kích thước, icon và nội dung có thể tinh chỉnh sau.
- Tạo các component dùng chung để tránh mỗi màn hình có một cách triển khai khác nhau.
- Dùng dữ liệu mock trước, nhưng tổ chức kiểu dữ liệu đủ rõ để thay API sau này.
- Đảm bảo các màn hình danh sách, chi tiết và trạng thái đơn hàng có hành vi cơ bản ngay cả khi chưa kết nối backend.

## 2. Phạm vi màn hình từ prototype

| Mã | Màn hình | Loại | Mức ưu tiên | Phụ thuộc |
|---|---|---|---|---|
| AUTH-01 | Đăng nhập | Form | P0 | Auth layout, validation |
| AUTH-02 | Đăng ký | Form | P0 | Auth layout, validation |
| DASH-01 | Tổng quan | Dashboard | P0 | App shell, số liệu mock |
| PROD-01 | Sản phẩm bán — danh sách | List | P0 | Table, search, product model |
| PROD-02 | Sản phẩm bán — chi tiết/thêm | Detail form | P1 | Product model, image placeholder |
| RENT-01 | Sản phẩm thuê — danh sách | List | P0 | Table, search, rental fields |
| RENT-02 | Sản phẩm thuê — chi tiết/thêm | Detail form | P1 | Rental fields |
| CUST-01 | Khách hàng — danh sách | List | P0 | Table, search, customer model |
| CUST-02 | Khách hàng — chi tiết/thêm | Detail form | P1 | Customer model |
| STAFF-01 | Nhân viên — danh sách | List | P1 | Table, permission model |
| STAFF-02 | Nhân viên — chi tiết/thêm | Detail form | P1 | Staff model |
| ORDER-01 | Đơn hàng | List/detail card | P0 | Order status model |
| RENT-ORDER-01 | Đơn thuê | List/detail card | P0 | Rental order status model |
| REPORT-01 | Thống kê | Report | P1 | Date filter, transaction mock |
| SETTING-01 | Cài đặt cá nhân | Profile/settings | P1 | Current-user model |

## 3. Thứ tự triển khai đề xuất

### Phase 0 — Chuẩn hóa nền tảng

- Thay nội dung Vite starter trong `src/App.tsx` bằng app shell của hệ thống.
- Thiết lập TypeScript models cho user, product, rental product, customer, staff, order và transaction.
- Tạo routing cho đăng nhập/đăng ký và nhóm màn hình quản trị.
- Tạo design tokens tối thiểu: màu nền, màu sidebar, màu hành động, typography, spacing, border và trạng thái.
- Tách component dùng chung:
  - `AuthLayout`
  - `AdminLayout`
  - `Sidebar`
  - `PageHeader`
  - `SearchInput`
  - `DataTable`
  - `StatusBadge`
  - `EmptyState`
  - `DetailPanel`/`FormField`
  - `PrimaryButton`/`SecondaryButton`
- Chuẩn bị mock data và trạng thái loading/empty/error.

### Phase 1 — Luồng truy cập và khung quản trị

- Đăng nhập: tài khoản, mật khẩu, ghi nhớ đăng nhập, quên mật khẩu placeholder, chuyển sang đăng ký.
- Đăng ký: họ tên, số điện thoại, tên đăng nhập, mật khẩu, nhập lại mật khẩu.
- App shell: sidebar cố định, active menu, responsive cơ bản, tiêu đề trang và vùng nội dung.
- Tổng quan: ba thẻ chỉ số và vùng biểu đồ/hoạt động gần đây dạng placeholder.

### Phase 2 — Sản phẩm và đơn thuê

- Danh sách sản phẩm bán: tìm kiếm, cột dữ liệu, trạng thái bán, thêm/sửa/xóa.
- Chi tiết sản phẩm bán: ảnh, tên, màu, size, số lượng, giá bán, doanh thu, danh mục.
- Danh sách sản phẩm thuê: bổ sung tiền cọc, giá thuê/ngày và trạng thái.
- Chi tiết sản phẩm thuê: form tương tự sản phẩm bán, thêm trường thuê.
- Kiểm tra các hành động nguy hiểm bằng confirm dialog trước khi xóa.

### Phase 3 — Khách hàng, nhân viên và đơn hàng

- Danh sách/chi tiết khách hàng.
- Danh sách/chi tiết nhân viên.
- Đơn hàng: tìm kiếm, thông tin sản phẩm, khách hàng, địa chỉ và chuỗi trạng thái `Đang chuẩn bị → Đang giao → Đã nhận`.
- Đơn thuê: thêm trạng thái `Đã trả` và thời gian thuê.
- Phân biệt quyền xem/sửa/xóa ở mức UI; quyền thật sẽ chờ backend xác nhận.

### Phase 4 — Thống kê và cài đặt

- Thống kê theo ngày/tháng, danh sách giao dịch và tổng tiền.
- Cài đặt cá nhân: avatar, thông tin cá nhân, sửa thông tin, đăng xuất.
- Bổ sung filter, empty state, lỗi tải dữ liệu và khả năng responsive sau khi luồng chính ổn định.

### Phase 5 — Rà soát prototype và hoàn thiện

- Đối chiếu từng màn hình với prototype mới nhất.
- Điều chỉnh spacing, font, màu, icon và kích thước theo feedback.
- Kiểm tra keyboard navigation, focus state, label form và contrast.
- Kiểm thử các luồng: đăng nhập, thêm/sửa/xóa, chuyển trạng thái đơn, đăng xuất.
- Chốt danh sách khác biệt giữa prototype và bản triển khai.

## 4. Quy ước UI tạm thời

- Sidebar dùng màu tím chủ đạo và luôn hiển thị tên nhóm “QUẢN LÝ / PANDA + FASHION”.
- Nội dung dùng nền sáng, card trắng, bảng có header xám nhạt và trạng thái rõ ràng.
- Nút hành động chính dùng một kiểu thống nhất; không hard-code style riêng trong từng màn hình nếu có thể dùng component chung.
- Ảnh chưa có dữ liệu dùng placeholder có kích thước cố định để layout không nhảy.
- Text và label trong prototype có thể chỉnh sau; không xem nội dung hiện tại là copy cuối cùng.
- Các thao tác xóa, đăng xuất hoặc thay đổi trạng thái phải có phản hồi trực quan.

## 5. Tiêu chí hoàn thành cho từng màn hình

Một màn hình chỉ được đánh dấu hoàn thành khi:

1. Có route hoặc điểm truy cập rõ ràng.
2. Layout khớp cấu trúc prototype ở mức chấp nhận được.
3. Có dữ liệu mock hoặc dữ liệu thật được hiển thị.
4. Các trạng thái loading, empty và error cơ bản đã được xử lý.
5. Các nút chính có hành vi; nút chưa hỗ trợ phải được đánh dấu rõ hoặc để disabled.
6. Không có lỗi TypeScript/lint/build.
7. Log triển khai của màn hình đã được cập nhật.

## 6. Mẫu log bắt buộc cho mỗi màn hình

Đặt log ngay dưới mục màn hình tương ứng hoặc trong `docs/ui-progress.md`:

```md
### [Mã màn hình] Tên màn hình
- Trạng thái: Chưa làm | Đang làm | Hoàn thành | Chờ feedback
- Cập nhật lần cuối: YYYY-MM-DD

#### Đã hoàn thành
- [ ] Route và layout
- [ ] Component giao diện
- [ ] Dữ liệu mock/API
- [ ] Tương tác chính
- [ ] Loading / empty / error
- [ ] Responsive và accessibility cơ bản
- [ ] Kiểm tra build/lint

#### Sẽ triển khai tiếp theo
- [ ] ...

#### Ghi chú / khác biệt so với prototype
- ...
```

## 7. Log khởi tạo

### NỀN-00 — Nền tảng project
- Trạng thái: Hoàn thành (mốc Phase 0–1)
- Đã hoàn thành:
  - [x] Xác nhận project hiện là Vite + React + TypeScript starter.
  - [x] Đã lập danh sách 15 màn hình/nhóm màn hình từ prototype.
  - [x] Đã xác định các component và model dùng chung cần có.
  - [x] Đã thay Vite starter bằng auth layout và admin shell.
  - [x] Đã thêm sidebar điều hướng, dashboard, bảng mock và màn hình cài đặt.
  - [x] Đã thêm responsive cơ bản cho màn hình nhỏ.
- Sẽ triển khai tiếp theo:
  - [x] Xây app shell và điều hướng màn hình.
  - [x] Thay giao diện starter bằng layout quản trị.
  - [x] Tạo log riêng cho từng màn hình khi bắt đầu triển khai.
  - [ ] Chốt routing URL và nối API/backend.
- Ghi chú: Prototype hiện được xem là tài liệu định hướng; mọi thay đổi UI sau này cần cập nhật lại plan và log.

### AUTH-01 — Đăng nhập
- Trạng thái: Đang làm
- Đã hoàn thành:
  - [x] Xác nhận các trường và hành động chính từ prototype.
- Sẽ triển khai tiếp theo:
  - [x] Dựng AuthLayout và form cơ bản.
  - [x] Nối luồng chuyển sang dashboard sau khi submit prototype.
  - [ ] Bổ sung validation và trạng thái submit/loading/error.

### AUTH-02 — Đăng ký
- Trạng thái: Đang làm
- Đã hoàn thành:
  - [x] Xác nhận các trường từ prototype.
- Sẽ triển khai tiếp theo:
  - [x] Dựng form đăng ký dùng chung style với đăng nhập.
  - [x] Nối luồng quay lại đăng nhập.
  - [ ] Validate mật khẩu và nhập lại mật khẩu.

### DASH-01 — Tổng quan
- Trạng thái: Đang làm
- Đã hoàn thành:
  - [x] Xác định ba nhóm thông tin chính: doanh thu hôm nay, sản phẩm bán, sản phẩm cho thuê.
- Sẽ triển khai tiếp theo:
  - [x] Dựng AdminLayout và sidebar.
  - [x] Dựng statistic cards và vùng biểu đồ placeholder.
  - [ ] Xác định dữ liệu dashboard với backend.

### PROD-01 / PROD-02 — Sản phẩm bán
- Trạng thái: Đang làm
- Đã hoàn thành:
  - [x] Xác định list view và detail view.
  - [x] Xác định nhóm field cơ bản từ prototype.
- Sẽ triển khai tiếp theo:
  - [x] Dựng bảng danh sách mock và ô tìm kiếm.
  - [ ] Dựng form chi tiết.
  - [ ] Thêm tìm kiếm thực, thêm, sửa và xóa.
  - [ ] Chốt validation và schema dữ liệu.

### RENT-01 / RENT-02 — Sản phẩm thuê
- Trạng thái: Đang làm
- Đã hoàn thành:
  - [x] Xác định các field khác sản phẩm bán: giá thuê và tiền cọc.
- Sẽ triển khai tiếp theo:
  - [x] Tái sử dụng cấu trúc bảng sản phẩm và hiển thị field thuê.
  - [ ] Thêm cột giá thuê/ngày, tiền cọc và trạng thái.

### CUST-01 / CUST-02 — Khách hàng
- Trạng thái: Chưa làm
- Đã hoàn thành:
  - [x] Xác định list view và thông tin chi tiết chính.
- Sẽ triển khai tiếp theo:
  - [ ] Dựng bảng khách hàng và form chi tiết.
  - [ ] Thêm tìm kiếm và thao tác thêm/sửa.

### STAFF-01 / STAFF-02 — Nhân viên
- Trạng thái: Chưa làm
- Đã hoàn thành:
  - [x] Xác định list view và thông tin nhân viên chính.
- Sẽ triển khai tiếp theo:
  - [ ] Dựng bảng và form nhân viên.
  - [ ] Xác định UI cho quyền nhân viên sau khi có đặc tả backend.

### ORDER-01 / RENT-ORDER-01 — Đơn hàng và đơn thuê
- Trạng thái: Chưa làm
- Đã hoàn thành:
  - [x] Xác định chuỗi trạng thái chính từ prototype.
- Sẽ triển khai tiếp theo:
  - [ ] Dựng order card/list dùng chung.
  - [ ] Thêm cập nhật trạng thái và hiển thị timeline.
  - [ ] Bổ sung thời gian thuê/trả cho đơn thuê.

### REPORT-01 — Thống kê
- Trạng thái: Chưa làm
- Đã hoàn thành:
  - [x] Xác định màn hình cần filter ngày và tổng tiền.
- Sẽ triển khai tiếp theo:
  - [ ] Dựng date filter và bảng giao dịch.
  - [ ] Nối số liệu với dữ liệu đơn hàng.

### SETTING-01 — Cài đặt
- Trạng thái: Chưa làm
- Đã hoàn thành:
  - [x] Xác định khu vực avatar, thông tin cá nhân, sửa và đăng xuất.
- Sẽ triển khai tiếp theo:
  - [ ] Dựng profile panel.
  - [ ] Thêm form sửa thông tin và confirm đăng xuất.

## 9. Log triển khai — mốc hoàn thiện giao diện prototype

- Trạng thái: Hoàn thành giao diện prototype tương tác.
- Đã hoàn thành:
  - [x] Auth: đăng nhập, đăng ký và chuyển màn hình.
  - [x] Admin shell: sidebar, active menu, header, profile shortcut.
  - [x] Dashboard: statistic cards và vùng biểu đồ placeholder.
  - [x] Sản phẩm bán/thuê: danh sách, tìm kiếm placeholder, thêm mới, xem/sửa, form chi tiết.
  - [x] Khách hàng/nhân viên: danh sách, thêm mới, xem/sửa, form chi tiết.
  - [x] Đơn hàng/đơn thuê: danh sách và các trạng thái xử lý cơ bản.
  - [x] Thống kê: bộ lọc ngày placeholder, bảng và tổng tiền.
  - [x] Cài đặt: thông tin cá nhân và đăng xuất.
  - [x] Responsive cơ bản cho sidebar, bảng và form.
  - [x] Build và lint đạt.
- Sẽ triển khai tiếp theo:
  - [ ] Tách component và route thành các module riêng khi chốt API.
  - [ ] Nối backend/auth thật, validation đầy đủ và upload ảnh.
  - [ ] Bổ sung xóa có confirm, thông báo thành công/thất bại và phân trang.
  - [ ] Tinh chỉnh visual theo feedback prototype mới nhất.

## 8. Các điểm cần chốt sau khi có feedback

- Tên route và cấu trúc URL.
- Bộ icon chính thức và quy tắc kích thước icon.
- Màu sắc/font/spacing cuối cùng.
- Trường dữ liệu bắt buộc cho từng form.
- Quyền của admin, nhân viên và khả năng chỉnh sửa từng loại dữ liệu.
- Trạng thái đầy đủ của đơn hàng và đơn thuê.
- Hành vi phân trang, upload ảnh, xác nhận xóa và thông báo thành công/thất bại.
- Breakpoint responsive cần hỗ trợ.
