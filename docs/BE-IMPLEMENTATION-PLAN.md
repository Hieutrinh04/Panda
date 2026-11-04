# Kế hoạch triển khai Backend cho Panda Fashion Admin

## 1. Mục tiêu

Xây dựng Backend API phục vụ đúng các màn hình đang có trên frontend hiện tại. Backend dùng FastAPI, MySQL, JWT Authentication, RESTful API và Docker. Giai đoạn này chỉ tập trung vào trang quản trị cửa hàng; không triển khai các chức năng khách hàng-facing hoặc các module chưa xuất hiện trên FE.

## 2. Phạm vi được triển khai

| Module | Có trên FE | Phạm vi Backend |
|---|---:|---|
| Xác thực | Có | Đăng nhập, đăng ký, thông tin user hiện tại, JWT, đăng xuất phía FE |
| Dashboard | Có | Tổng doanh thu, số sản phẩm bán, số sản phẩm thuê, hoạt động gần đây |
| Sản phẩm bán | Có | CRUD sản phẩm bán, tìm kiếm, trạng thái, tồn kho cơ bản |
| Sản phẩm thuê | Có | CRUD sản phẩm thuê, giá thuê, tiền cọc, tồn kho cơ bản |
| Khách hàng | Có | CRUD, tìm kiếm, thông tin liên hệ và tài khoản |
| Nhân viên | Có | Danh sách, CRUD hồ sơ, vai trò cơ bản |
| Đơn hàng | Có | Danh sách, chi tiết, cập nhật trạng thái đơn mua |
| Đơn thuê | Có | Danh sách, chi tiết, cập nhật trạng thái và ngày trả |
| Thống kê | Có | Lọc theo ngày, danh sách giao dịch, tổng doanh thu |
| Cài đặt | Có | Xem và cập nhật thông tin cá nhân |

## 3. Phạm vi không triển khai trong phase này

Các nội dung có trong đề cương nhưng chưa có màn hình tương ứng trên FE sẽ không đưa vào API MVP:

- Danh mục nâng cao, nhà cung cấp, bộ sưu tập.
- Lịch sử kho chi tiết, nhiều kho, nhập/xuất/điều chỉnh kho nâng cao.
- Giỏ hàng và website dành cho khách hàng.
- Cổng thanh toán trực tuyến, hoàn tiền tự động.
- Khuyến mãi, mã giảm giá, điểm thưởng, hạng thành viên.
- Banner, bình luận, đánh giá.
- Trợ lý AI.
- Kết nối vận chuyển.
- Quản lý giặt ủi, bảo trì, sửa chữa.

Những module này chỉ được bổ sung sau khi có màn hình FE, yêu cầu nghiệp vụ và quyết định mở rộng phạm vi riêng.

## 4. Kiến trúc Backend đề xuất

```text
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   └── database.py
│   ├── api/
│   │   ├── deps.py
│   │   └── v1/
│   │       ├── auth.py
│   │       ├── dashboard.py
│   │       ├── products.py
│   │       ├── customers.py
│   │       ├── staff.py
│   │       ├── orders.py
│   │       ├── rentals.py
│   │       ├── reports.py
│   │       └── settings.py
│   ├── models/
│   │   ├── user.py
│   │   ├── product.py
│   │   ├── customer.py
│   │   ├── order.py
│   │   └── transaction.py
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── product.py
│   │   ├── customer.py
│   │   ├── order.py
│   │   └── report.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── product_service.py
│   │   ├── customer_service.py
│   │   ├── order_service.py
│   │   └── report_service.py
│   └── repositories/
│       ├── product_repository.py
│       ├── customer_repository.py
│       └── order_repository.py
├── migrations/
├── tests/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

Tầng API chỉ nhận/trả request, service xử lý nghiệp vụ, repository truy cập dữ liệu, model ánh xạ MySQL và schema kiểm tra dữ liệu. Cách tách này giúp FE thay mock data bằng API mà không phụ thuộc trực tiếp vào query database.

## 5. Công nghệ và quy ước

- Python FastAPI: API và dependency injection.
- SQLAlchemy 2.x: ORM.
- Alembic: migration database.
- MySQL: dữ liệu chính.
- Pydantic Settings: quản lý biến môi trường.
- PyJWT hoặc thư viện JWT tương đương: access token.
- Passlib/bcrypt: hash mật khẩu.
- Pytest: unit test và API test.
- Docker Compose: chạy API và MySQL đồng nhất.
- REST JSON: giao tiếp với frontend.

Mọi API nên có prefix `/api/v1`, response có schema rõ ràng, lỗi dùng HTTP status phù hợp và không trả password/hash password về FE.

## 6. Thiết kế dữ liệu MVP

### `users`

- `id`, `full_name`, `username`, `phone`, `email` nullable.
- `password_hash`, `role`, `is_active`.
- `created_at`, `updated_at`.
- `role`: `manager` hoặc `staff` trong phase này.

### `products`

- `id`, `name`, `category_name`.
- `color`, `size`, `quantity`.
- `sale_price`, `rental_price` nullable, `deposit` nullable.
- `product_type`: `sale` hoặc `rental`.
- `status`: `available`, `out_of_stock`, `inactive`.
- `image_url` nullable, `created_at`, `updated_at`.

Thiết kế gộp sản phẩm bán và sản phẩm thuê vào cùng bảng, phân biệt bằng `product_type`, phù hợp với hai màn hình FE hiện tại và tránh trùng logic CRUD.

### `customers`

- `id`, `name`, `gender`, `birth_date` nullable.
- `phone`, `address`, `username` nullable.
- `created_at`, `updated_at`.

### `orders`

- `id`, `order_code`, `customer_id` nullable.
- `order_type`: `sale` hoặc `rental`.
- `product_id`, `product_name_snapshot`, `color`, `size`, `quantity`.
- `phone_snapshot`, `address_snapshot`.
- `sale_amount`, `rental_amount`, `deposit_amount`.
- `status`, `rental_due_date` nullable, `returned_at` nullable.
- `created_at`, `updated_at`.

Lưu snapshot tên sản phẩm và thông tin giao nhận để lịch sử đơn không bị thay đổi khi bản ghi gốc được chỉnh sửa.

### `transactions`

- `id`, `order_id`, `type`, `amount`, `note`, `created_at`.
- `type`: `sale`, `rental`, `deposit`, `refund`, `late_fee`.

Bảng này phục vụ dashboard và reports trong phạm vi dữ liệu hiện có; chưa phải module thanh toán online.

## 7. API contract dự kiến

### Authentication

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

`login` trả `{ access_token, token_type, user }`. FE lưu access token và gửi `Authorization: Bearer <token>` cho các request cần xác thực.

### Dashboard

```text
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/recent-activities?limit=10
```

Response summary gồm `today_revenue`, `sold_product_count`, `rented_product_count`.

### Products

```text
GET    /api/v1/products?type=sale&search=&page=1&page_size=20
POST   /api/v1/products
GET    /api/v1/products/{id}
PATCH  /api/v1/products/{id}
DELETE /api/v1/products/{id}
```

Validation bắt buộc: tên sản phẩm, loại sản phẩm, số lượng không âm, giá không âm. Với `type=rental`, `rental_price` và `deposit` phải hợp lệ.

### Customers

```text
GET    /api/v1/customers?search=&page=1&page_size=20
POST   /api/v1/customers
GET    /api/v1/customers/{id}
PATCH  /api/v1/customers/{id}
DELETE /api/v1/customers/{id}
```

Tìm kiếm theo tên, số điện thoại hoặc username giống hành vi mock hiện tại của FE.

### Staff

```text
GET    /api/v1/staff?search=&page=1&page_size=20
POST   /api/v1/staff
GET    /api/v1/staff/{id}
PATCH  /api/v1/staff/{id}
PATCH  /api/v1/staff/{id}/status
```

Chỉ manager được tạo, sửa hoặc khóa staff. Staff chỉ được xem/sửa thông tin cá nhân theo quyền.

### Orders and rentals

```text
GET   /api/v1/orders?type=sale&status=&search=&page=1&page_size=20
GET   /api/v1/orders/{id}
PATCH /api/v1/orders/{id}/status
PATCH /api/v1/orders/{id}/return
```

Luồng status tối thiểu:

- Đơn mua: `preparing → shipping → received → cancelled`.
- Đơn thuê: `preparing → shipping → received → returned → overdue`.

Backend phải kiểm tra chuyển trạng thái hợp lệ và cập nhật tồn kho trong transaction database.

### Reports

```text
GET /api/v1/reports/summary?from=&to=
GET /api/v1/reports/transactions?from=&to=&page=1&page_size=20
```

### Settings

```text
GET   /api/v1/settings/profile
PATCH /api/v1/settings/profile
PATCH /api/v1/settings/password
```

## 8. Phân quyền MVP

| Hành động | Manager | Staff |
|---|---:|---:|
| Xem dashboard, sản phẩm, khách hàng, đơn hàng | Có | Có |
| Tạo/sửa sản phẩm | Có | Có theo phân quyền |
| Xóa sản phẩm | Có | Không mặc định |
| Quản lý nhân viên | Có | Không |
| Cập nhật trạng thái đơn | Có | Có |
| Xem báo cáo | Có | Có, có thể giới hạn |
| Sửa profile cá nhân | Có | Có |

JWT chỉ xác thực danh tính; quyền phải được kiểm tra ở backend bằng dependency `require_role`, không dựa vào việc ẩn nút trên FE.

## 9. Kế hoạch triển khai theo phase

### Phase BE-0 — Khởi tạo

- Tạo service FastAPI và cấu trúc thư mục.
- Cấu hình `.env`, MySQL và Docker Compose.
- Thiết lập SQLAlchemy, Alembic, CORS cho origin của Vite.
- Tạo health check `GET /health`.
- Tạo response/error format thống nhất.

### Phase BE-1 — Auth và user

- Migration `users`.
- Register/login/me.
- Hash password, JWT access token.
- Role manager/staff.
- Seed một manager và một staff cho môi trường dev.
- Thay mock auth FE bằng API.

### Phase BE-2 — Product và customer

- Migration `products`, `customers`.
- CRUD và search/pagination.
- Seed sản phẩm bán, sản phẩm thuê và khách hàng.
- Nối hai màn hình sản phẩm và khách hàng với API.

### Phase BE-3 — Orders và rental orders

- Migration `orders`, `transactions`.
- API danh sách/chi tiết/cập nhật status.
- Kiểm tra tồn kho khi tạo/cập nhật đơn.
- Luồng trả sản phẩm và hoàn trạng thái thuê.
- Nối màn hình đơn hàng/đơn thuê.

### Phase BE-4 — Dashboard, reports và settings

- Query summary dashboard.
- Query transactions theo khoảng ngày.
- Profile và đổi mật khẩu.
- Nối dashboard, thống kê và cài đặt.

### Phase BE-5 — Kiểm thử và bàn giao

- Unit test service quan trọng.
- API test bằng Pytest/Postman.
- Kiểm tra permission manager/staff.
- Kiểm thử các status transition.
- Seed data dev và tài liệu API OpenAPI.
- Chạy toàn bộ hệ thống bằng Docker Compose.

## 10. Thứ tự thay mock trên frontend

1. Tạo `src/services/apiClient.ts` và xử lý base URL/token.
2. Thay auth mock bằng `auth.service.ts`.
3. Thay products/customers bằng service có loading, error, empty, pagination.
4. Thay orders/rentals và cập nhật status.
5. Thay dashboard/reports/settings.
6. Xóa mock data chỉ sau khi API integration test đạt; giữ seed data cho local development.

## 11. Tiêu chí hoàn thành Backend MVP

- API chạy được bằng Docker Compose với FastAPI và MySQL.
- FE đăng nhập được bằng tài khoản seed.
- CRUD sản phẩm, khách hàng và nhân viên hoạt động qua API.
- Đơn mua và đơn thuê hiển thị dữ liệu thật, cập nhật status được.
- Dashboard và reports trả đúng dữ liệu theo ngày.
- API bảo vệ bằng JWT và kiểm tra role ở server.
- Có migration, seed data, OpenAPI và hướng dẫn chạy local.
- Không triển khai ngoài phạm vi FE hiện tại nếu chưa có phê duyệt mở rộng.

## 12. Log triển khai bắt buộc

Mỗi module cập nhật theo mẫu:

```md
### [BE-module] Tên module
- Trạng thái: Chưa làm | Đang làm | Hoàn thành | Chờ FE

#### Đã hoàn thành
- [ ] Migration/model
- [ ] Schema validation
- [ ] Repository/service
- [ ] API endpoint
- [ ] Permission
- [ ] Unit/API test
- [ ] Nối frontend

#### Sẽ triển khai tiếp theo
- [ ] ...

#### Ghi chú / thay đổi contract
- ...
```

## 13. Log khởi tạo

### BE-00 — Phạm vi và kiến trúc

- Trạng thái: Hoàn thành kế hoạch và đã dựng Backend MVP
- Đã hoàn thành:
  - [x] Đối chiếu đề cương với các màn hình FE hiện tại.
  - [x] Khóa phạm vi vào auth, dashboard, sản phẩm, khách hàng, nhân viên, đơn hàng, đơn thuê, thống kê và cài đặt.
  - [x] Chọn FastAPI, MySQL, JWT, RESTful API và Docker theo đề cương.
  - [x] Đã tạo cấu trúc backend, models, schemas, dependencies và routers.
  - [x] Đã tạo seed manager/staff, sản phẩm và khách hàng mẫu.
  - [x] Đã tạo Docker Compose cho API và MySQL.
  - [x] Đã kiểm tra syntax Python cho toàn bộ backend.
- Sẽ triển khai tiếp theo:
  - [x] Khởi tạo repository backend.
  - [x] Tạo health check và database bootstrap.
  - [ ] Bổ sung Alembic migration chính thức trước khi production.
  - [ ] Chốt API contract với FE trước khi thay mock data.
