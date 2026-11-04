# Panda Fashion Backend

## Chạy bằng Docker

```powershell
Copy-Item .env.example .env
docker-compose up --build
```

Nếu image cũ đã được build trước khi khóa phiên bản bcrypt, hãy rebuild sạch:

```powershell
docker-compose down
docker-compose build --no-cache api
docker-compose up
```

API: `http://localhost:8000`  
Swagger: `http://localhost:8000/docs`

Tài khoản seed:

- Manager: `admin` / `admin123`
- Staff: `nhanvien` / `staff123`

## Chạy local

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Đặt `DATABASE_URL` trong `.env` trỏ tới MySQL đang chạy. Các endpoint nằm dưới prefix `/api/v1`.
