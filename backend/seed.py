from app.core.database import Base, SessionLocal, engine
from sqlalchemy import inspect, text
from app.core.security import hash_password
from app.models import Customer, Product, User
Base.metadata.create_all(bind=engine)
with engine.begin() as connection:
    connection.execute(text('ALTER TABLE products MODIFY image_url LONGTEXT NULL'))
    if 'password_hash' not in {column['name'] for column in inspect(connection).get_columns('customers')}:
        connection.execute(text('ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL'))
db=SessionLocal()
if not db.query(User).filter(User.username=='admin').first():db.add(User(full_name='Admin Panda',username='admin',phone='0367403869',password_hash=hash_password('admin123'),role='manager'))
if not db.query(User).filter(User.username=='nhanvien').first():db.add(User(full_name='Nguyễn Hoàng Nam',username='nhanvien',phone='0912345678',password_hash=hash_password('staff123'),role='staff'))
catalog=[
 ('Áo dài lụa Sen','Áo dài','Trắng ngà','M','Nữ',1290000,None,None,'sale'),('Áo dài nhung Hoàng Gia','Áo dài','Đỏ đô','L','Nữ',1890000,None,None,'sale'),('Vest nam Classic','Vest nam','Đen','L','Nam',2490000,None,None,'sale'),('Vest nam Midnight Blue','Vest nam','Xanh navy','M','Nam',2690000,None,None,'sale'),('Váy dự tiệc Aurora','Váy','Hồng phấn','S','Nữ',1590000,None,None,'sale'),('Váy lụa Champagne','Váy','Vàng champagne','M','Nữ',1790000,None,None,'sale'),('Hanbok Seoul','Hóa trang','Xanh pastel','M','Nữ',1490000,None,None,'sale'),('Kimono Sakura','Hóa trang','Đỏ','M','Unisex',1350000,None,None,'sale'),('Túi cầm tay Pearl','Phụ kiện','Trắng','Free size','Nữ',390000,None,None,'sale'),('Cà vạt lụa Classic','Phụ kiện','Đen','Free size','Nam',250000,None,None,'sale'),
 ('Đầm dạ hội Ruby','Dạ tiệc','Đỏ ruby','M','Nữ',0,300000,1000000,'rental'),('Đầm dạ hội Galaxy','Dạ tiệc','Đen ánh kim','L','Nữ',0,380000,1500000,'rental'),('Vest nam Tuxedo','Vest nam','Đen','L','Nam',0,350000,1500000,'rental'),('Vest nam Champagne','Vest nam','Be','M','Nam',0,320000,1300000,'rental'),('Váy công chúa Elia','Váy','Xanh nhạt','S','Nữ',0,280000,900000,'rental'),('Váy ren Vintage','Váy','Trắng','M','Nữ',0,260000,800000,'rental'),('Áo dài cưới An Nhiên','Áo dài','Đỏ','M','Nữ',0,450000,1800000,'rental'),('Áo dài cách tân Mộc Lan','Áo dài','Vàng','L','Nữ',0,320000,1200000,'rental'),('Kimono Nhật Bản','Hóa trang','Xanh đậm','M','Unisex',0,290000,1000000,'rental'),('Hanbok truyền thống','Hóa trang','Hồng','M','Nữ',0,270000,900000,'rental'),('Mấn và khăn đóng','Phụ kiện','Đỏ','Free size','Unisex',0,120000,300000,'rental'),('Bộ phụ kiện quý ông','Phụ kiện','Đen','Free size','Nam',0,100000,250000,'rental')]
for name,category,color,size,gender,sale_price,rental_price,deposit,product_type in catalog:
    if not db.query(Product).filter(Product.name==name,Product.product_type==product_type).first():
        db.add(Product(name=name,category_name=category,color=color,size=size,quantity=8 if product_type=='sale' else 5,sale_price=sale_price,rental_price=rental_price,deposit=deposit,product_type=product_type,status='available'))
if db.query(Customer).count()==0:db.add_all([Customer(name='Nguyễn Văn A',gender='Nam',phone='0367403869',address='Bình Dương',username='khoa123'),Customer(name='Trần Thị B',gender='Nữ',phone='00231312414',address='Bình Dương',username='khach123')])
db.commit();db.close();print('Seed completed')
