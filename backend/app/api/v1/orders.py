from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...deps import current_user, staff_or_manager
from ...models import Order, Product, Transaction, User
from ...schemas import OrderIn, OrderOut, OrderStatusIn
router=APIRouter(prefix='/orders',tags=['orders'])
allowed={'sale':{'preparing','shipping','received','cancelled'},'rental':{'preparing','shipping','received','returned','overdue'}}
def to_out(o:Order):return o
@router.get('',response_model=list[OrderOut])
def list_orders(type:str|None=None,status:str|None=None,search:str='',page:int=Query(1,ge=1),page_size:int=Query(20,le=100),db:Session=Depends(get_db),user:User=Depends(staff_or_manager)):
    q=db.query(Order)
    if type:q=q.filter(Order.order_type==type)
    if user.role == 'staff': q=q.filter(Order.order_type=='sale')
    if status:q=q.filter(Order.status==status)
    if search:q=q.filter(Order.product_name_snapshot.ilike(f'%{search}%'))
    return q.order_by(Order.id.desc()).offset((page-1)*page_size).limit(page_size).all()
@router.post('',response_model=OrderOut)
def create_order(data:OrderIn,db:Session=Depends(get_db),_:User=Depends(current_user)):
    p=db.get(Product,data.product_id)
    if not p or p.quantity<data.quantity:raise HTTPException(400,'Sản phẩm không đủ tồn kho')
    if data.order_type not in ('sale','rental'):raise HTTPException(400,'Loại đơn không hợp lệ')
    p.quantity-=data.quantity
    o=Order(order_code=f'PD-{datetime.now().strftime("%y%m%d%H%M%S")}',product_id=p.id,product_name_snapshot=p.name,order_type=data.order_type,color=data.color or p.color,size=data.size or p.size,quantity=data.quantity,phone_snapshot=data.phone_snapshot,address_snapshot=data.address_snapshot,sale_amount=p.sale_price if data.order_type=='sale' else 0,rental_amount=p.rental_price if data.order_type=='rental' else None,deposit_amount=p.deposit if data.order_type=='rental' else None,rental_due_date=data.rental_due_date);db.add(o);db.flush();db.add(Transaction(order_id=o.id,type='sale' if data.order_type=='sale' else 'rental',amount=o.sale_amount or o.rental_amount or 0));db.commit();db.refresh(o);return o
@router.get('/{order_id}',response_model=OrderOut)
def get_order(order_id:int,db:Session=Depends(get_db),_:User=Depends(current_user)):
    o=db.get(Order,order_id)
    if not o:raise HTTPException(404,'Không tìm thấy đơn hàng')
    return o
@router.patch('/{order_id}/status',response_model=OrderOut)
def update_status(order_id:int,data:OrderStatusIn,db:Session=Depends(get_db),_:User=Depends(current_user)):
    o=db.get(Order,order_id)
    if not o:raise HTTPException(404,'Không tìm thấy đơn hàng')
    if data.status not in allowed.get(o.order_type,set()):raise HTTPException(400,'Trạng thái không hợp lệ')
    o.status=data.status
    if data.status=='returned':o.returned_at=datetime.now(timezone.utc)
    db.commit();db.refresh(o);return o
