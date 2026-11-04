from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...core.security import hash_password, verify_password
from ...deps import current_user
from ...models import User
from ...schemas import PasswordUpdate, ProfileUpdate, UserOut
router=APIRouter(prefix='/settings',tags=['settings'])
@router.get('/profile',response_model=UserOut)
def profile(user:User=Depends(current_user)):return user
@router.patch('/profile',response_model=UserOut)
def update_profile(data:ProfileUpdate,db:Session=Depends(get_db),user:User=Depends(current_user)):
    for key,value in data.model_dump(exclude_none=True).items():setattr(user,key,value)
    db.commit();db.refresh(user);return user
@router.patch('/password',status_code=204)
def change_password(data:PasswordUpdate,db:Session=Depends(get_db),user:User=Depends(current_user)):
    if not verify_password(data.current_password,user.password_hash):raise HTTPException(400,'Mật khẩu hiện tại không đúng')
    user.password_hash=hash_password(data.new_password);db.commit()
