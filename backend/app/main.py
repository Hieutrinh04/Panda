from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.database import Base, engine
from .api.v1 import auth, customers, dashboard, orders, products, reports, settings as settings_router, staff
Base.metadata.create_all(bind=engine)
app=FastAPI(title=settings.app_name,version='1.0.0')
# Vite may be opened as localhost or 127.0.0.1, and may choose the next
# port when 5173 is already occupied. Keep the configured origin supported
# while allowing the common local development origins.
frontend_origins = {
    settings.frontend_origin,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
}
app.add_middleware(CORSMiddleware,allow_origins=list(frontend_origins),allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
@app.get('/health',tags=['system'])
def health():return {'status':'ok'}
for router in (auth.router,dashboard.router,products.router,customers.router,staff.router,orders.router,reports.router,settings_router.router):app.include_router(router,prefix='/api/v1')
