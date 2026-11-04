from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...core.security import create_access_token, hash_password, verify_password
from ...deps import current_user
from ...models import User
from ...schemas import LoginIn, RegisterIn, Token, UserOut
router=APIRouter(prefix='/auth',tags=['auth'])
@router.post('/register',response_model=Token)
def register(data:RegisterIn,db:Session=Depends(get_db)):
    if db.query(User).filter(User.username==data.username).first(): raise HTTPException(409,'Tên đăng nhập đã tồn tại')
    user=User(full_name=data.full_name,username=data.username,phone=data.phone,password_hash=hash_password(data.password),role='staff');db.add(user);db.commit();db.refresh(user)
    return Token(access_token=create_access_token(user.username),user=user)
@router.post('/login',response_model=Token)
def login(data:LoginIn,db:Session=Depends(get_db)):
    user=db.query(User).filter(User.username==data.username).first()
    if not user or not verify_password(data.password,user.password_hash): raise HTTPException(401,'Sai tên đăng nhập hoặc mật khẩu')
    return Token(access_token=create_access_token(user.username),user=user)
@router.get('/me',response_model=UserOut)
def me(user:User=Depends(current_user)): return user
