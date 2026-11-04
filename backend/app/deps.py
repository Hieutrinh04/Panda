from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from .core.config import settings
from .core.database import get_db
from .core.security import ALGORITHM
from .models import User

oauth2=OAuth2PasswordBearer(tokenUrl='/api/v1/auth/login')
def current_user(token:str=Depends(oauth2),db:Session=Depends(get_db)) -> User:
    try: username=jwt.decode(token,settings.secret_key,algorithms=[ALGORITHM]).get('sub')
    except JWTError: raise HTTPException(status_code=401,detail='Token không hợp lệ')
    user=db.query(User).filter(User.username==username,User.is_active==True).first()
    if not user: raise HTTPException(status_code=401,detail='Tài khoản không tồn tại')
    return user
def manager_only(user:User=Depends(current_user)) -> User:
    if user.role!='manager': raise HTTPException(status_code=403,detail='Bạn không có quyền thực hiện thao tác này')
    return user

def staff_or_manager(user:User=Depends(current_user)) -> User:
    if user.role not in ('manager', 'staff'): raise HTTPException(status_code=403,detail='Bạn không có quyền thực hiện thao tác này')
    return user

def staff_only(user:User=Depends(current_user)) -> User:
    if user.role != 'staff': raise HTTPException(status_code=403,detail='Bạn không có quyền thực hiện thao tác này')
    return user
