from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...deps import current_user
from ...models import Order, Product, Transaction, User
router=APIRouter(prefix='/dashboard',tags=['dashboard'])
@router.get('/summary')
def summary(db:Session=Depends(get_db),_:User=Depends(current_user)):
    revenue=db.query(func.coalesce(func.sum(Transaction.amount),0)).filter(func.date(Transaction.created_at)==date.today()).scalar()
    sold=db.query(func.coalesce(func.sum(Product.quantity),0)).filter(Product.product_type=='sale').scalar()
    rented=db.query(func.coalesce(func.sum(Product.quantity),0)).filter(Product.product_type=='rental').scalar()
    return {'today_revenue':Decimal(revenue or 0),'sold_product_count':sold or 0,'rented_product_count':rented or 0}
@router.get('/recent-activities')
def recent(limit:int=10,db:Session=Depends(get_db),_:User=Depends(current_user)):return db.query(Order).order_by(Order.created_at.desc()).limit(limit).all()
