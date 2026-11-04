from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...deps import current_user
from ...models import Transaction, User
from ...schemas import TransactionOut
router=APIRouter(prefix='/reports',tags=['reports'])
@router.get('/summary')
def report_summary(from_date:date|None=Query(None,alias='from'),to_date:date|None=Query(None,alias='to'),db:Session=Depends(get_db),_:User=Depends(current_user)):
    q=db.query(Transaction)
    if from_date:q=q.filter(Transaction.created_at>=from_date)
    if to_date:q=q.filter(Transaction.created_at<to_date)
    rows=q.all();return {'total':sum((r.amount for r in rows),Decimal('0')),'transaction_count':len(rows)}
@router.get('/transactions',response_model=list[TransactionOut])
def transactions(from_date:date|None=Query(None,alias='from'),to_date:date|None=Query(None,alias='to'),db:Session=Depends(get_db),_:User=Depends(current_user)):
    q=db.query(Transaction)
    if from_date:q=q.filter(Transaction.created_at>=from_date)
    if to_date:q=q.filter(Transaction.created_at<to_date)
    return q.order_by(Transaction.created_at.desc()).all()
