import type { Product } from '../types/product'
const sale = (id:string,name:string,category:string,color:string,size:string,gender:Product['gender'],salePrice:string):Product => ({id,name,category,color,size,gender,quantity:8,salePrice,status:'Đang bán'})
const rental = (id:string,name:string,category:string,color:string,size:string,gender:Product['gender'],rentalPrice:string,deposit:string):Product => ({id,name,category,color,size,gender,quantity:5,salePrice:'0',rentalPrice,deposit,status:'Đang bán'})
export const products: Product[] = [
 sale('p1','Áo dài lụa Sen','Áo dài','Trắng ngà','M','Nữ','1.290.000'),sale('p2','Áo dài nhung Hoàng Gia','Áo dài','Đỏ đô','L','Nữ','1.890.000'),
 sale('p3','Vest nam Classic','Vest nam','Đen','L','Nam','2.490.000'),sale('p4','Vest nam Midnight Blue','Vest nam','Xanh navy','M','Nam','2.690.000'),
 sale('p5','Váy dự tiệc Aurora','Váy','Hồng phấn','S','Nữ','1.590.000'),sale('p6','Váy lụa Champagne','Váy','Vàng champagne','M','Nữ','1.790.000'),
 sale('p7','Hanbok Seoul','Hóa trang','Xanh pastel','M','Nữ','1.490.000'),sale('p8','Kimono Sakura','Hóa trang','Đỏ','M','Unisex','1.350.000'),
 sale('p9','Túi cầm tay Pearl','Phụ kiện','Trắng','Free size','Nữ','390.000'),sale('p10','Cà vạt lụa Classic','Phụ kiện','Đen','Free size','Nam','250.000')]
export const rentalProducts: Product[] = [
 rental('r1','Đầm dạ hội Ruby','Dạ tiệc','Đỏ ruby','M','Nữ','300.000','1.000.000'),rental('r2','Đầm dạ hội Galaxy','Dạ tiệc','Đen ánh kim','L','Nữ','380.000','1.500.000'),
 rental('r3','Vest nam Tuxedo','Vest nam','Đen','L','Nam','350.000','1.500.000'),rental('r4','Vest nam Champagne','Vest nam','Be','M','Nam','320.000','1.300.000'),
 rental('r5','Váy công chúa Elia','Váy','Xanh nhạt','S','Nữ','280.000','900.000'),rental('r6','Váy ren Vintage','Váy','Trắng','M','Nữ','260.000','800.000'),
 rental('r7','Áo dài cưới An Nhiên','Áo dài','Đỏ','M','Nữ','450.000','1.800.000'),rental('r8','Áo dài cách tân Mộc Lan','Áo dài','Vàng','L','Nữ','320.000','1.200.000'),
 rental('r9','Kimono Nhật Bản','Hóa trang','Xanh đậm','M','Unisex','290.000','1.000.000'),rental('r10','Hanbok truyền thống','Hóa trang','Hồng','M','Nữ','270.000','900.000'),
 rental('r11','Mấn và khăn đóng','Phụ kiện','Đỏ','Free size','Unisex','120.000','300.000'),rental('r12','Bộ phụ kiện quý ông','Phụ kiện','Đen','Free size','Nam','100.000','250.000')]
