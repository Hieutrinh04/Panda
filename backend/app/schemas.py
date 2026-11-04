from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

class ORM(BaseModel): model_config=ConfigDict(from_attributes=True)
class UserOut(ORM): id:int; full_name:str; username:str; phone:str|None=None; role:str; is_active:bool
class RegisterIn(BaseModel): full_name:str=Field(min_length=2); username:str=Field(min_length=3); password:str=Field(min_length=6); phone:str|None=None
class LoginIn(BaseModel): username:str; password:str
class Token(BaseModel): access_token:str; token_type:str='bearer'; user:UserOut
class ProductIn(BaseModel): name:str; category_name:str; color:str|None=None; size:str|None=None; quantity:int=Field(ge=0); sale_price:Decimal=Field(ge=0); rental_price:Decimal|None=Field(default=None,ge=0); deposit:Decimal|None=Field(default=None,ge=0); product_type:str='sale'; status:str='available'; image_url:str|None=None
class ProductOut(ProductIn,ORM): id:int; created_at:datetime
class CustomerIn(BaseModel): name:str; gender:str|None=None; birth_date:date|None=None; phone:str|None=None; address:str|None=None; username:str|None=None; password:str|None=None
class CustomerOut(CustomerIn,ORM): id:int; created_at:datetime
class StaffIn(RegisterIn): role:str='staff'
class StaffOut(UserOut): pass
class OrderIn(BaseModel): customer_id:int|None=None; product_id:int; color:str|None=None; size:str|None=None; quantity:int=Field(default=1,ge=1); phone_snapshot:str|None=None; address_snapshot:str|None=None; order_type:str='sale'; rental_due_date:date|None=None
class OrderStatusIn(BaseModel): status:str
class OrderOut(ORM): id:int; order_code:str; product_id:int; product_name_snapshot:str; order_type:str; color:str|None; size:str|None; quantity:int; phone_snapshot:str|None; address_snapshot:str|None; sale_amount:Decimal; rental_amount:Decimal|None; deposit_amount:Decimal|None; status:str; rental_due_date:date|None; returned_at:datetime|None; created_at:datetime
class TransactionOut(ORM): id:int; order_id:int; type:str; amount:Decimal; note:str|None; created_at:datetime
class ProfileUpdate(BaseModel): full_name:str|None=None; phone:str|None=None
class PasswordUpdate(BaseModel): current_password:str; new_password:str=Field(min_length=6)
