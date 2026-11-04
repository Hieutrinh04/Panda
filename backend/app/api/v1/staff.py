from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...core.security import hash_password
from ...deps import current_user, manager_only
from ...models import User
from ...schemas import StaffIn, StaffOut
router=APIRouter(prefix='/staff',tags=['staff'])
@router.get('',response_model=list[StaffOut])
def list_staff(db:Session=Depends(get_db),_:User=Depends(current_user)):return db.query(User).order_by(User.id.desc()).all()
@router.post('',response_model=StaffOut)
def create_staff(data:StaffIn,db:Session=Depends(get_db),_:User=Depends(manager_only)):
    if db.query(User).filter(User.username==data.username).first():raise HTTPException(409,'Tên đăng nhập đã tồn tại')
    u=User(full_name=data.full_name,username=data.username,phone=data.phone,password_hash=hash_password(data.password),role=data.role);db.add(u);db.commit();db.refresh(u);return u
@router.patch('/{staff_id}',response_model=StaffOut)
def update_staff(staff_id:int,data:StaffIn,db:Session=Depends(get_db),_:User=Depends(manager_only)):
    u=db.get(User,staff_id)
    if not u:raise HTTPException(404,'Không tìm thấy nhân viên')
    u.full_name=data.full_name;u.phone=data.phone;u.role=data.role
    if data.password:u.password_hash=hash_password(data.password)
    db.commit();db.refresh(u);return u
@router.patch('/{staff_id}/status',response_model=StaffOut)
def toggle_staff(staff_id:int,db:Session=Depends(get_db),_:User=Depends(manager_only)):
    u=db.get(User,staff_id)
    if not u:raise HTTPException(404,'Không tìm thấy nhân viên')
    u.is_active=not u.is_active;db.commit();db.refresh(u);return u
