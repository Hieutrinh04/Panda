from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...deps import current_user, manager_only, staff_or_manager
from ...models import Product, User
from ...schemas import ProductIn, ProductOut
router=APIRouter(prefix='/products',tags=['products'])
@router.get('',response_model=list[ProductOut])
def list_products(type:str|None=None,search:str='',page:int=Query(1,ge=1),page_size:int=Query(20,le=100),db:Session=Depends(get_db),_:User=Depends(current_user)):
    q=db.query(Product)
    if type:q=q.filter(Product.product_type==type)
    if search:q=q.filter(or_(Product.name.ilike(f'%{search}%'),Product.category_name.ilike(f'%{search}%')))
    return q.order_by(Product.id.desc()).offset((page-1)*page_size).limit(page_size).all()
@router.post('',response_model=ProductOut)
def create_product(data:ProductIn,db:Session=Depends(get_db),_:User=Depends(staff_or_manager)):
    p=Product(**data.model_dump());db.add(p);db.commit();db.refresh(p);return p
@router.get('/{product_id}',response_model=ProductOut)
def get_product(product_id:int,db:Session=Depends(get_db),_:User=Depends(current_user)):
    p=db.get(Product,product_id)
    if not p:raise HTTPException(404,'Không tìm thấy sản phẩm')
    return p
@router.patch('/{product_id}',response_model=ProductOut)
def update_product(product_id:int,data:ProductIn,db:Session=Depends(get_db),_:User=Depends(current_user)):
    p=db.get(Product,product_id)
    if not p:raise HTTPException(404,'Không tìm thấy sản phẩm')
    for k,v in data.model_dump().items():setattr(p,k,v)
    db.commit();db.refresh(p);return p
@router.delete('/{product_id}',status_code=204)
def delete_product(product_id:int,db:Session=Depends(get_db),_:User=Depends(manager_only)):
    p=db.get(Product,product_id)
    if not p:raise HTTPException(404,'Không tìm thấy sản phẩm')
    db.delete(p);db.commit()
