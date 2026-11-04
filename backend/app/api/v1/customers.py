from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...deps import current_user, manager_only, staff_or_manager
from ...models import Customer, User
from ...core.security import hash_password
from ...schemas import CustomerIn, CustomerOut
router=APIRouter(prefix='/customers',tags=['customers'])
@router.get('',response_model=list[CustomerOut])
def list_customers(search:str='',page:int=Query(1,ge=1),page_size:int=Query(20,le=100),db:Session=Depends(get_db),_:User=Depends(current_user)):
    q=db.query(Customer)
    if search:q=q.filter(or_(Customer.name.ilike(f'%{search}%'),Customer.phone.ilike(f'%{search}%'),Customer.username.ilike(f'%{search}%')))
    return q.order_by(Customer.id.desc()).offset((page-1)*page_size).limit(page_size).all()
@router.post('',response_model=CustomerOut)
def create_customer(data:CustomerIn,db:Session=Depends(get_db),_:User=Depends(staff_or_manager)):
    values=data.model_dump();password=values.pop('password',None);c=Customer(**values,password_hash=hash_password(password) if password else None);db.add(c);db.commit();db.refresh(c);return c
@router.get('/{customer_id}',response_model=CustomerOut)
def get_customer(customer_id:int,db:Session=Depends(get_db),_:User=Depends(current_user)):
    c=db.get(Customer,customer_id)
    if not c:raise HTTPException(404,'Không tìm thấy khách hàng')
    return c
@router.patch('/{customer_id}',response_model=CustomerOut)
def update_customer(customer_id:int,data:CustomerIn,db:Session=Depends(get_db),_:User=Depends(manager_only)):
    c=db.get(Customer,customer_id)
    if not c:raise HTTPException(404,'Không tìm thấy khách hàng')
    values=data.model_dump();password=values.pop('password',None)
    for k,v in values.items():setattr(c,k,v)
    if password:c.password_hash=hash_password(password)
    db.commit();db.refresh(c);return c
@router.delete('/{customer_id}',status_code=204)
def delete_customer(customer_id:int,db:Session=Depends(get_db),_:User=Depends(current_user)):
    c=db.get(Customer,customer_id)
    if not c:raise HTTPException(404,'Không tìm thấy khách hàng')
    db.delete(c);db.commit()
