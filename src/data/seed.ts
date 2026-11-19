import type {
  Category, Collection, Coupon, Database, Gender, Order, OrderItem, Payment, Product, ProductMode,
  Review, StockMovement, StoreSettings, Supplier, Task, Ticket, User, Variant,
} from '../types'
import { addDays, hashPassword, normalize, toDateInput } from '../lib/format'

export const DB_VERSION = 6

// Bộ sinh số ngẫu nhiên cố định để dữ liệu mẫu giống nhau mỗi lần khởi tạo.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const daysAgo = (n: number, hour = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, Math.floor(n * 7) % 60, 0, 0)
  return d.toISOString()
}

export const defaultSettings: StoreSettings = {
  storeName: 'Panda Fashion',
  address: '195 Nguyễn Văn Thương, Bình Thạnh, TP.HCM',
  hotline: '093 490 7714',
  email: 'hello@pandafashion.vn',
  openHours: '9:00 – 20:00 mỗi ngày',
  heroTitle: 'Tỏa sáng theo cách của bạn',
  heroSubtitle: 'Mua hoặc thuê trang phục cho những khoảnh khắc đáng nhớ — áo dài, vest, đầm dạ hội và trang phục hóa trang.',
  announcement: 'Miễn phí giao hàng cho đơn từ 1.000.000đ · Nhập PANDA10 giảm 10% đơn đầu tiên',
  shippingFee: 30000,
  freeShippingFrom: 1000000,
  lateFeePercentPerDay: 50,
  pointsPerAmount: 10000,
  pointValue: 100,
  tiers: [
    { name: 'Thành viên', minSpent: 0 },
    { name: 'Bạc', minSpent: 2000000 },
    { name: 'Vàng', minSpent: 6000000 },
    { name: 'Kim cương', minSpent: 15000000 },
  ],
}

const categories: Category[] = [
  { id: 'cat-aodai', name: 'Áo dài', description: 'Áo dài truyền thống và cách tân' },
  { id: 'cat-vest', name: 'Vest nam', description: 'Vest, tuxedo cho nam' },
  { id: 'cat-vay', name: 'Váy', description: 'Váy dự tiệc, váy công chúa' },
  { id: 'cat-datiec', name: 'Dạ tiệc', description: 'Đầm dạ hội' },
  { id: 'cat-hoatrang', name: 'Hóa trang', description: 'Kimono, hanbok, trang phục lễ hội' },
  { id: 'cat-phukien', name: 'Phụ kiện', description: 'Túi, cà vạt, mấn, khăn đóng' },
]

const suppliers: Supplier[] = [
  { id: 'sup-1', name: 'Xưởng may Sen Việt', phone: '0283 888 1122', email: 'senviet@xuong.vn', address: 'Tân Bình, TP.HCM' },
  { id: 'sup-2', name: 'Lụa Bảo Lộc Silk', phone: '0263 777 2233', email: 'contact@baoloc-silk.vn', address: 'Bảo Lộc, Lâm Đồng' },
  { id: 'sup-3', name: 'Gentleman Tailor', phone: '0909 456 789', email: 'order@gentleman.vn', address: 'Quận 3, TP.HCM' },
]

const collections: Collection[] = [
  { id: 'col-tet', name: 'Xuân Tết 2027', description: 'Áo dài và phụ kiện đón Tết' },
  { id: 'col-wedding', name: 'Mùa cưới', description: 'Trang phục cưới hỏi, dạ tiệc' },
  { id: 'col-festival', name: 'Lễ hội & hóa trang', description: 'Trang phục các nước, lễ hội' },
]

type SeedProduct = [
  name: string, categoryId: string, collectionId: string | undefined, supplierId: string, gender: Gender, mode: ProductMode,
  salePrice: number, rentalPrice: number, deposit: number, sizes: string[], colors: string[], material: string, featured: boolean, description: string,
]

const catalog: SeedProduct[] = [
  ['Áo dài lụa Sen', 'cat-aodai', 'col-tet', 'sup-2', 'Nữ', 'sale', 1290000, 0, 0, ['S', 'M', 'L'], ['Trắng ngà', 'Hồng phấn'], 'Lụa tơ tằm', true, 'Áo dài lụa mềm, tà dài thướt tha, thêu hoa sen tinh tế ở vạt trước.'],
  ['Áo dài nhung Hoàng Gia', 'cat-aodai', 'col-tet', 'sup-2', 'Nữ', 'both', 1890000, 350000, 1200000, ['S', 'M', 'L'], ['Đỏ đô'], 'Nhung', true, 'Nhung cao cấp, cổ cao, phù hợp dịp lễ Tết và chụp ảnh gia đình.'],
  ['Vest nam Classic', 'cat-vest', undefined, 'sup-3', 'Nam', 'sale', 2490000, 0, 0, ['M', 'L', 'XL'], ['Đen', 'Xám'], 'Wool pha', true, 'Vest hai cúc dáng slim, phù hợp công sở và sự kiện.'],
  ['Vest nam Midnight Blue', 'cat-vest', 'col-wedding', 'sup-3', 'Nam', 'both', 2690000, 380000, 1500000, ['M', 'L', 'XL'], ['Xanh navy'], 'Wool', false, 'Màu xanh đêm sang trọng, ve sa-tanh.'],
  ['Váy dự tiệc Aurora', 'cat-vay', 'col-wedding', 'sup-1', 'Nữ', 'sale', 1590000, 0, 0, ['S', 'M', 'L'], ['Hồng phấn', 'Xanh nhạt'], 'Voan lụa', true, 'Váy xòe nhẹ, eo chiết, nhiều lớp voan bay bổng.'],
  ['Váy lụa Champagne', 'cat-vay', undefined, 'sup-2', 'Nữ', 'sale', 1790000, 0, 0, ['S', 'M'], ['Vàng champagne'], 'Lụa satin', false, 'Váy lụa suông, cổ đổ, ánh champagne nhẹ.'],
  ['Hanbok Seoul', 'cat-hoatrang', 'col-festival', 'sup-1', 'Nữ', 'both', 1490000, 270000, 900000, ['S', 'M', 'L'], ['Xanh pastel', 'Hồng'], 'Lụa organza', false, 'Hanbok cách tân màu pastel, áo jeogori ngắn.'],
  ['Kimono Sakura', 'cat-hoatrang', 'col-festival', 'sup-1', 'Unisex', 'sale', 1350000, 0, 0, ['M', 'L'], ['Đỏ'], 'Cotton lụa', false, 'Kimono họa tiết hoa anh đào kèm đai obi.'],
  ['Ví cầm tay da Milano', 'cat-phukien', 'col-wedding', 'sup-3', 'Unisex', 'sale', 590000, 0, 0, ['Free size'], ['Nâu sô-cô-la'], 'Da bò thật', false, 'Ví cầm tay dáng phong bì, khóa kéo kim loại, đủ chỗ cho điện thoại và giấy tờ khi dự tiệc.'],
  ['Cà vạt lụa Classic', 'cat-phukien', undefined, 'sup-3', 'Nam', 'sale', 250000, 0, 0, ['Free size'], ['Xanh navy', 'Tím họa tiết'], 'Lụa', false, 'Cà vạt bản 7cm, lụa dệt họa tiết nhỏ, hợp vest tối màu.'],
  ['Đầm dạ hội Ruby', 'cat-datiec', 'col-wedding', 'sup-1', 'Nữ', 'rental', 0, 300000, 1000000, ['S', 'M', 'L'], ['Đỏ ruby'], 'Satin', true, 'Đầm đuôi cá ôm dáng, xẻ tà, phù hợp tiệc tối.'],
  ['Đầm dạ hội Galaxy', 'cat-datiec', 'col-wedding', 'sup-1', 'Nữ', 'rental', 0, 380000, 1500000, ['S', 'M', 'L'], ['Đen ánh kim'], 'Sequin', true, 'Đính sequin lấp lánh như dải ngân hà.'],
  ['Vest nam Tuxedo', 'cat-vest', 'col-wedding', 'sup-3', 'Nam', 'rental', 0, 350000, 1500000, ['M', 'L', 'XL'], ['Đen'], 'Wool', true, 'Tuxedo ve bóng, kèm nơ cổ.'],
  ['Vest nam Champagne', 'cat-vest', 'col-wedding', 'sup-3', 'Nam', 'rental', 0, 320000, 1300000, ['M', 'L'], ['Be'], 'Linen pha', false, 'Vest màu be cho tiệc cưới ngoài trời.'],
  ['Váy công chúa Elia', 'cat-vay', undefined, 'sup-1', 'Nữ', 'rental', 0, 280000, 900000, ['S', 'M'], ['Hồng tím'], 'Tulle', false, 'Váy cúp ngực đính kết, chân váy xòe bồng nhiều lớp tulle, hợp tiệc sinh nhật và chụp ảnh.'],
  ['Váy ren Vintage', 'cat-vay', undefined, 'sup-1', 'Nữ', 'both', 1450000, 260000, 800000, ['S', 'M', 'L'], ['Trắng'], 'Ren', false, 'Váy ren cổ điển tay lỡ.'],
  ['Áo dài cưới An Nhiên', 'cat-aodai', 'col-wedding', 'sup-2', 'Nữ', 'rental', 0, 450000, 1800000, ['S', 'M', 'L'], ['Đỏ'], 'Gấm', true, 'Áo dài cưới gấm đỏ thêu phượng, kèm mấn.'],
  ['Áo dài Mộc Lan', 'cat-aodai', 'col-tet', 'sup-2', 'Nữ', 'both', 1150000, 320000, 1200000, ['S', 'M', 'L'], ['Trắng'], 'Lụa Hà Đông', false, 'Áo dài trắng lụa mềm, phối khăn choàng đỏ, hợp chụp ảnh kỷ yếu và dạo phố ngày lễ.'],
  ['Kimono Nhật Bản', 'cat-hoatrang', 'col-festival', 'sup-1', 'Unisex', 'rental', 0, 290000, 1000000, ['M', 'L'], ['Xanh đậm'], 'Cotton', false, 'Kimono truyền thống, kèm guốc geta.'],
  ['Hanbok truyền thống', 'cat-hoatrang', 'col-festival', 'sup-1', 'Nữ', 'rental', 0, 270000, 900000, ['S', 'M'], ['Hồng'], 'Lụa', false, 'Hanbok truyền thống chima dài.'],
  ['Mấn và khăn đóng', 'cat-phukien', 'col-tet', 'sup-2', 'Unisex', 'rental', 0, 120000, 300000, ['Free size'], ['Đỏ', 'Vàng'], 'Gấm', false, 'Mấn cô dâu và khăn đóng chú rể.'],
  ['Bộ phụ kiện quý ông', 'cat-phukien', 'col-wedding', 'sup-3', 'Nam', 'rental', 0, 100000, 250000, ['Free size'], ['Đen'], 'Lụa', false, 'Nơ, khăn cài túi, khuy măng sét.'],
  // Bổ sung theo bộ ảnh chụp thật (PD023 … PD038)
  ['Đầm dạ hội Scarlet', 'cat-datiec', 'col-wedding', 'sup-1', 'Nữ', 'rental', 0, 350000, 1200000, ['S', 'M', 'L'], ['Đỏ'], 'Satin lụa', true, 'Đầm satin đỏ cổ chữ V, chân váy xòe rộng xẻ tà, chuyển động mềm mại khi bước đi.'],
  ['Đầm tua rua Gatsby', 'cat-datiec', undefined, 'sup-1', 'Nữ', 'both', 1690000, 300000, 1000000, ['S', 'M'], ['Vàng ánh kim'], 'Sequin tua rua', false, 'Đầm ngắn phong cách thập niên 20, tua rua ánh kim nhiều tầng, hợp tiệc chủ đề và year-end party.'],
  ['Đầm dạ hội Violet', 'cat-datiec', 'col-wedding', 'sup-1', 'Nữ', 'rental', 0, 380000, 1300000, ['S', 'M', 'L'], ['Tím'], 'Satin, ren đính đá', false, 'Thân trên ren đính đá, chân váy satin tím xẻ cao, dáng chữ A tôn eo.'],
  ['Đầm dạ hội Emerald', 'cat-datiec', 'col-wedding', 'sup-1', 'Nữ', 'rental', 0, 400000, 1500000, ['S', 'M', 'L'], ['Xanh lục bảo'], 'Tulle kim tuyến', true, 'Đầm xòe hai dây, tulle phủ kim tuyến lấp lánh, phù hợp prom và tiệc cưới buổi tối.'],
  ['Đầm sequin Ocean', 'cat-datiec', undefined, 'sup-1', 'Nữ', 'rental', 0, 320000, 1200000, ['S', 'M'], ['Xanh dương'], 'Sequin', false, 'Đầm đuôi cá hai dây đính sequin xanh biển, ôm dáng, dành cho tiệc tối và sự kiện.'],
  ['Vest kẻ sọc Gentleman', 'cat-vest', undefined, 'sup-3', 'Nam', 'both', 2890000, 400000, 1500000, ['M', 'L', 'XL'], ['Xám nhạt kẻ sọc'], 'Wool', true, 'Vest hai hàng khuy, kẻ sọc mảnh, ve nhọn, đi kèm quần cùng màu.'],
  ['Vest nam Business Grey', 'cat-vest', undefined, 'sup-3', 'Nam', 'sale', 2290000, 0, 0, ['M', 'L', 'XL'], ['Xám'], 'Wool pha', false, 'Vest một hàng khuy dáng regular, màu xám dễ phối, dùng hằng ngày ở công sở.'],
  ['Vest nam Petrol', 'cat-vest', 'col-wedding', 'sup-3', 'Nam', 'both', 2590000, 350000, 1300000, ['M', 'L'], ['Xanh cổ vịt'], 'Wool', false, 'Vest xanh cổ vịt mặt vải vân chéo, kèm khăn cài túi, nổi bật trong tiệc cưới.'],
  ['Áo dài cưới Hỷ Phúc', 'cat-aodai', 'col-wedding', 'sup-2', 'Nữ', 'rental', 0, 420000, 1600000, ['S', 'M', 'L'], ['Đỏ'], 'Gấm thêu', true, 'Áo dài cưới gấm đỏ, thêu chữ Hỷ ở ngực, cổ cao, dùng cho lễ ăn hỏi và rước dâu.'],
  ['Áo dài cưới đôi Song Hỷ', 'cat-aodai', 'col-wedding', 'sup-2', 'Unisex', 'rental', 0, 700000, 2500000, ['Bộ S/M', 'Bộ M/L'], ['Đỏ'], 'Gấm', false, 'Trọn bộ áo dài cô dâu và chú rể cùng tông đỏ, đồng bộ họa tiết, kèm khăn đóng.'],
  ['Váy cưới ren Bohemian', 'cat-vay', 'col-wedding', 'sup-1', 'Nữ', 'rental', 0, 600000, 3000000, ['S', 'M', 'L'], ['Trắng'], 'Ren, tulle', true, 'Váy cưới lưng ren khoét, chân váy tulle bồng nhẹ, hợp tiệc cưới ngoài trời.'],
  ['Đầm lụa hai dây Noir', 'cat-vay', undefined, 'sup-2', 'Nữ', 'both', 1390000, 250000, 800000, ['S', 'M', 'L'], ['Đen'], 'Lụa satin', false, 'Đầm lụa hai dây cổ đổ, dáng suông dài, tối giản và sang trọng.'],
  ['Hanbok Gyeongbok', 'cat-hoatrang', 'col-festival', 'sup-1', 'Nữ', 'rental', 0, 280000, 900000, ['S', 'M'], ['Xanh navy'], 'Lụa', false, 'Hanbok chima xanh navy phối áo trắng, kèm túi nhỏ, hợp chụp ảnh lễ hội Hàn Quốc.'],
  ['Kimono Yukata Hoa', 'cat-hoatrang', 'col-festival', 'sup-1', 'Nữ', 'rental', 0, 300000, 1000000, ['M', 'L'], ['Xanh rêu hoa'], 'Cotton lụa', false, 'Kimono nền xanh rêu họa tiết hoa, kèm đai obi và trâm cài tóc.'],
  ['Ví cầm tay vân cá sấu', 'cat-phukien', 'col-wedding', 'sup-1', 'Nữ', 'sale', 690000, 0, 0, ['Free size'], ['Hồng'], 'Da PU vân cá sấu', false, 'Clutch hồng vân cá sấu, nắp gập, phối đẹp với đầm trắng và pastel.'],
  ['Nơ đeo cổ nhung', 'cat-phukien', undefined, 'sup-3', 'Nam', 'sale', 190000, 0, 0, ['Free size'], ['Xanh rêu'], 'Nhung', false, 'Nơ nhung thắt sẵn, dây điều chỉnh, đi cùng tuxedo hoặc vest tối màu.'],
]

/** Ảnh chụp thật từ Unsplash (giấy phép miễn phí, xem docs/IMAGE_SOURCES.md), theo thứ tự sản phẩm trong catalog. */
const PHOTOS: string[][] = [
  ['1787588647846-16c054fa2bdc', '1787588647731-e47792a468e8'], // p-1
  ['1793345242627-6b831e2a763c'], // p-2
  ['1768809248422-b5a82fef6b15', '1617113930975-f9c7243ae527'], // p-3
  ['1617137968427-85924c800a22', '1617137984095-74e4e5e3613f'], // p-4
  ['1768767112566-dc12dbe40aae', '1763959952596-1512ebea8eb1'], // p-5
  ['1793363953729-fc79753f8bf2'], // p-6
  ['1767977005045-94eb8d80b833', '1761500996989-30752a7f35ed'], // p-7
  ['1712669085636-7ceb31b23924', '1608451994760-ea44a25e80a0'], // p-8
  ['1749294435693-4f39ec7e0ab2', '1749294435697-386a322bab8d'], // p-9
  ['1782789086467-06ccb25a8509', '1589756823695-278bc923f962'], // p-10
  ['1583039949165-96ee24b0d8de', '1765229279946-f265fa703385'], // p-11
  ['1779763320789-95c30a3c0943', '1779763320462-a60f48e56b03'], // p-12
  ['1539025828301-b314ca222fa9', '1786467470383-cfc7d19f7644'], // p-13
  ['1772404245903-d374e4aa0312', '1766104800514-409da295c71b'], // p-14
  ['1774537211395-0377d957cfbc'], // p-15
  ['1788456696341-a6d6b35f12ff', '1631233999975-3d559f0526e1'], // p-16
  ['1793345242589-05614e52f39a', '1793345243005-c90bd84dd471'], // p-17
  ['1787588647858-1f8cac07462f', '1787588647874-5dbae7f38d80'], // p-18
  ['1777646109007-b6b54da7719b'], // p-19
  ['1785656572930-7e900dd76065'], // p-20
  ['1793345242426-d496a6bb8ff3'], // p-21
  ['1777606310856-5f1fe3113dfb', '1784822041270-7cc959c33cbb'], // p-22
  ['1765229279773-b10038a84425', '1774460699436-c408cc1408c3'], // p-23
  ['1789972181238-624c83e47cd4', '1789423476802-ec050cb926de'], // p-24
  ['1765229277457-dd2f9f259f17', '1765229277389-3a4a0de325c2'], // p-25
  ['1765871421513-452fe03d15cc', '1765871422489-a244dbc9c3d1'], // p-26
  ['1759349394750-f85f5c3fc4b2', '1779406273746-8aef6abde6de'], // p-27
  ['1480429370139-e0132c086e2a'], // p-28
  ['1622497170185-5d668f816a56'], // p-29
  ['1611937663641-5cef5189d71b'], // p-30
  ['1793345242175-bb41700abc5e', '1793345243093-b7b30c9473d1'], // p-31
  ['1793345242547-9a953a6ae2d9'], // p-32
  ['1603796846900-d61a14c890ef', '1777353131725-02975738e03c'], // p-33
  ['1765870974280-ca1fc4642bd7', '1704775991534-563c1d548f88'], // p-34
  ['1785656572916-55e501e58574'], // p-35
  ['1603418784678-7ecd0709f216'], // p-36
  ['1789110854562-6bff8f621b3b'], // p-37
  ['1697335638994-f5f4599f93c6'], // p-38
]
const photoUrl = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&h=1125&fit=crop&crop=entropy&auto=format&q=80`

const plain = (password: string) => hashPassword(password)

function buildUsers(): User[] {
  const base = { isActive: true, addresses: [], points: 0 }
  return [
    { ...base, id: 'u-admin', role: 'manager', fullName: 'Admin Panda', email: 'admin@pandafashion.vn', phone: '0367403869', username: 'admin', passwordHash: plain('admin123'), position: 'Chủ cửa hàng', createdAt: daysAgo(120) },
    { ...base, id: 'u-staff1', role: 'staff', fullName: 'Nguyễn Hoàng Nam', email: 'nam@pandafashion.vn', phone: '0912345678', username: 'nhanvien', passwordHash: plain('staff123'), gender: 'Nam', position: 'Bán hàng', createdAt: daysAgo(90) },
    { ...base, id: 'u-staff2', role: 'staff', fullName: 'Trần Ngọc Mai', email: 'mai@pandafashion.vn', phone: '0987654321', username: 'ngocmai', passwordHash: plain('staff123'), gender: 'Nữ', position: 'Kho & giao nhận', createdAt: daysAgo(60) },
    {
      ...base, id: 'u-cus1', role: 'customer', fullName: 'Nguyễn Văn An', email: 'khachhang@panda.vn', phone: '0901234567', username: 'khachhang', passwordHash: plain('123456'), gender: 'Nam', birthDate: '1999-06-10', createdAt: daysAgo(80), points: 320,
      addresses: [{ id: 'addr-1', label: 'Nhà riêng', receiver: 'Nguyễn Văn An', phone: '0901234567', line: '12 Nguyễn Huệ, Quận 1, TP.HCM', isDefault: true }],
      note: 'Khách quen, thích vest tối màu.',
    },
    {
      ...base, id: 'u-cus2', role: 'customer', fullName: 'Trần Thị Bích', email: 'bich.tran@gmail.com', phone: '0938111222', username: 'bichtran', passwordHash: plain('123456'), gender: 'Nữ', birthDate: '2001-11-28', createdAt: daysAgo(50), points: 150,
      addresses: [{ id: 'addr-2', label: 'Nhà', receiver: 'Trần Thị Bích', phone: '0938111222', line: '45 Lê Lợi, Thủ Dầu Một, Bình Dương', isDefault: true }],
    },
    {
      ...base, id: 'u-cus3', role: 'customer', fullName: 'Lê Minh Châu', email: 'chau.le@gmail.com', phone: '0977333444', username: 'minhchau', passwordHash: plain('123456'), gender: 'Nữ', createdAt: daysAgo(30), points: 40,
      addresses: [{ id: 'addr-3', label: 'Công ty', receiver: 'Lê Minh Châu', phone: '0977333444', line: '88 Điện Biên Phủ, Bình Thạnh, TP.HCM', isDefault: true }],
    },
    {
      ...base, id: 'u-cus4', role: 'customer', fullName: 'Phạm Quốc Dũng', email: 'dung.pham@gmail.com', phone: '0966555777', username: 'quocdung', passwordHash: plain('123456'), gender: 'Nam', createdAt: daysAgo(12),
      addresses: [{ id: 'addr-4', label: 'Nhà', receiver: 'Phạm Quốc Dũng', phone: '0966555777', line: '7 Phan Văn Trị, Gò Vấp, TP.HCM', isDefault: true }],
    },
  ]
}

function buildProducts() {
  const products: Product[] = []
  const variants: Variant[] = []
  catalog.forEach((row, index) => {
    const [name, categoryId, collectionId, supplierId, gender, mode, salePrice, rentalPrice, deposit, sizes, colors, material, featured, description] = row
    const id = `p-${index + 1}`
    products.push({
      id, name, categoryId, collectionId, supplierId, gender, mode, salePrice, rentalPricePerDay: rentalPrice, deposit,
      material, featured, description, images: (PHOTOS[index] ?? []).map(photoUrl), status: 'active', createdAt: daysAgo(100 - index),
    })
    colors.forEach((color, ci) =>
      sizes.forEach((size, si) => {
        variants.push({
          id: `v-${index + 1}-${ci}-${si}`,
          productId: id,
          sku: `PD${String(index + 1).padStart(3, '0')}-${normalize(color).slice(0, 2).toUpperCase()}${ci}-${normalize(size).replace(/[^a-z0-9]/g, '').toUpperCase()}`,
          size,
          color,
          stock: mode === 'sale' ? 4 + ((index + si) % 5) : 3 + ((index + si) % 3),
        })
      }),
    )
  })
  // Vài mẫu sắp hết hàng để màn hình cảnh báo tồn kho có dữ liệu.
  variants[0].stock = 1
  variants[7].stock = 0
  return { products, variants }
}

function buildOrders(products: Product[], variants: Variant[], users: User[]) {
  const random = rng(42)
  const customers = users.filter((u) => u.role === 'customer')
  const orders: Order[] = []
  const payments: Payment[] = []
  const saleProducts = products.filter((p) => p.mode !== 'rental')
  const rentalProducts = products.filter((p) => p.mode !== 'sale')
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  let seq = 1

  for (let day = 28; day >= 0; day--) {
    const count = day % 3 === 0 ? 2 : 1
    for (let k = 0; k < count; k++) {
      const rental = random() < 0.45
      const product = pick(rental ? rentalProducts : saleProducts)
      const variant = pick(variants.filter((v) => v.productId === product.id))
      const customer = pick(customers)
      const address = customer.addresses[0]
      const createdAt = daysAgo(day, 9 + k * 4)
      const code = `PD${toDateInput(new Date(createdAt)).slice(2).replace(/-/g, '')}${String(k + 1).padStart(3, '0')}`
      const days = rental ? 1 + Math.floor(random() * 3) : 0
      const item: OrderItem = {
        productId: product.id, variantId: variant.id, name: product.name, sku: variant.sku, size: variant.size, color: variant.color,
        quantity: 1, unitPrice: rental ? product.rentalPricePerDay : product.salePrice, deposit: rental ? product.deposit : 0, days,
      }
      const subtotal = rental ? item.unitPrice * days : item.unitPrice
      const shippingFee = subtotal >= defaultSettings.freeShippingFrom ? 0 : defaultSettings.shippingFee
      const depositTotal = item.deposit
      const id = `o-${seq}`
      const startDate = toDateInput(new Date(createdAt))
      const endDate = addDays(startDate, Math.max(days - 1, 0))

      let status: Order['status']
      if (rental) {
        if (day > 6) status = random() < 0.9 ? 'completed' : 'cancelled'
        else if (day > 2) status = 'renting'
        else status = day === 0 ? 'pending' : 'confirmed'
      } else {
        if (day > 5) status = random() < 0.92 ? 'completed' : 'cancelled'
        else if (day > 2) status = 'shipping'
        else status = day === 0 ? 'pending' : 'confirmed'
      }

      const order: Order = {
        id, code, type: rental ? 'rental' : 'sale', channel: random() < 0.7 ? 'online' : 'store',
        customerId: customer.id, customerName: customer.fullName, phone: customer.phone, address: address.line,
        deliveryMethod: random() < 0.7 ? 'delivery' : 'pickup', items: [item], subtotal, discount: 0, pointsUsed: 0,
        shippingFee, depositTotal, total: subtotal + shippingFee + depositTotal, paymentMethod: random() < 0.6 ? 'cod' : 'bank',
        status, createdAt, createdBy: undefined,
        timeline: [{ status: 'pending', at: createdAt, note: 'Đơn hàng được tạo' }],
      }
      if (status !== 'pending') order.timeline.push({ status: status === 'cancelled' ? 'cancelled' : 'confirmed', at: daysAgo(day, 12 + k), by: 'u-staff1' })
      if (rental) {
        order.rental = { startDate, endDate, lateFee: 0, damageFee: 0, depositRefunded: 0, extendedDays: 0 }
        if (status === 'renting' || status === 'completed') {
          order.rental.deliveredAt = daysAgo(day, 14)
          order.rental.conditionOut = 'Nguyên vẹn, đã giặt ủi'
          order.timeline.push({ status: 'renting', at: daysAgo(day, 14), by: 'u-staff2' })
        }
        // Một đơn thuê đang ở ngoài và đã quá hạn trả.
        if (status === 'renting' && day >= 5) {
          order.rental.endDate = addDays(startDate, 1)
          item.days = 2
          order.subtotal = item.unitPrice * 2
          order.total = order.subtotal + order.shippingFee + depositTotal
        }
      }

      const paid = !['pending', 'cancelled'].includes(status) && (order.paymentMethod === 'bank' || ['completed', 'renting'].includes(status))
      if (paid) {
        payments.push({ id: `pay-${seq}-a`, orderId: id, type: rental ? 'rental' : 'sale', amount: order.subtotal, method: order.paymentMethod, createdAt: daysAgo(day, 12 + k) })
        if (shippingFee) payments.push({ id: `pay-${seq}-s`, orderId: id, type: 'shipping', amount: shippingFee, method: order.paymentMethod, createdAt: daysAgo(day, 12 + k) })
        if (rental) payments.push({ id: `pay-${seq}-d`, orderId: id, type: 'deposit', amount: depositTotal, method: order.paymentMethod, createdAt: daysAgo(day, 12 + k) })
      }
      if (status === 'completed') {
        order.timeline.push({ status: rental ? 'returned' : 'shipping', at: daysAgo(day - 1, 10) })
        order.timeline.push({ status: 'completed', at: daysAgo(day - 2, 10) })
        if (rental && order.rental) {
          const late = random() < 0.2 ? 1 : 0
          order.rental.returnedAt = daysAgo(Math.max(day - days - late, 0), 17)
          order.rental.conditionIn = late ? 'Trả trễ 1 ngày, đồ nguyên vẹn' : 'Nguyên vẹn'
          order.rental.lateFee = late ? Math.round((item.unitPrice * defaultSettings.lateFeePercentPerDay) / 100) : 0
          order.rental.depositRefunded = depositTotal
          if (order.rental.lateFee) payments.push({ id: `pay-${seq}-l`, orderId: id, type: 'late_fee', amount: order.rental.lateFee, method: 'cash', createdAt: order.rental.returnedAt })
          payments.push({ id: `pay-${seq}-r`, orderId: id, type: 'deposit_refund', amount: -depositTotal, method: 'cash', createdAt: order.rental.returnedAt })
        }
      }
      orders.push(order)
      seq++
    }
  }
  return { orders: orders.reverse(), payments }
}

function buildReviews(orders: Order[]): Review[] {
  const comments = [
    'Vải đẹp, form chuẩn, mặc đi tiệc ai cũng khen!',
    'Giao hàng nhanh, đóng gói cẩn thận.',
    'Màu ngoài đẹp hơn trong ảnh. Sẽ ủng hộ tiếp.',
    'Đồ thuê sạch sẽ, thơm tho. Nhân viên tư vấn nhiệt tình.',
    'Size hơi rộng một chút nhưng shop hỗ trợ đổi nhanh.',
  ]
  return orders
    .filter((o) => o.status === 'completed' && o.customerId)
    .slice(0, 9)
    .map((o, i) => ({
      id: `rv-${i + 1}`, productId: o.items[0].productId, customerId: o.customerId!, orderId: o.id,
      rating: i % 4 === 3 ? 4 : 5, comment: comments[i % comments.length], hidden: false,
      reply: i === 0 ? 'Cảm ơn bạn đã tin chọn Panda Fashion!' : undefined, createdAt: o.timeline.at(-1)!.at,
    }))
}

const coupons: Coupon[] = [
  { id: 'cp-1', code: 'PANDA10', description: 'Giảm 10% cho mọi đơn, tối đa 200.000đ', kind: 'percent', value: 10, maxDiscount: 200000, minOrder: 300000, appliesTo: 'all', startAt: addDays(toDateInput(new Date()), -30), endAt: addDays(toDateInput(new Date()), 60), usageLimit: 500, used: 37, active: true },
  { id: 'cp-2', code: 'THUE50K', description: 'Giảm 50.000đ cho đơn thuê từ 500.000đ', kind: 'fixed', value: 50000, minOrder: 500000, appliesTo: 'rental', startAt: addDays(toDateInput(new Date()), -10), endAt: addDays(toDateInput(new Date()), 20), usageLimit: 100, used: 12, active: true },
  { id: 'cp-3', code: 'VANG15', description: 'Hạng Vàng trở lên giảm 15% đơn mua', kind: 'percent', value: 15, maxDiscount: 500000, minOrder: 1000000, appliesTo: 'sale', minTier: 'Vàng', startAt: addDays(toDateInput(new Date()), -5), endAt: addDays(toDateInput(new Date()), 90), usageLimit: 50, used: 2, active: true },
  { id: 'cp-4', code: 'TET2026', description: 'Ưu đãi Tết đã kết thúc', kind: 'percent', value: 20, minOrder: 0, appliesTo: 'all', startAt: '2026-01-15', endAt: '2026-02-20', usageLimit: 200, used: 200, active: false },
]

const tickets: Ticket[] = [
  {
    id: 'tk-1', customerId: 'u-cus2', type: 'complaint', subject: 'Váy giao bị nhăn', status: 'in_progress', assignedTo: 'u-staff1', createdAt: daysAgo(3),
    messages: [
      { from: 'u-cus2', text: 'Váy mình nhận hôm qua bị nhăn khá nhiều ở phần chân váy, shop hỗ trợ giúp mình nhé.', at: daysAgo(3) },
      { from: 'u-staff1', text: 'Panda xin lỗi bạn! Bạn có thể mang qua cửa hàng, shop là hơi miễn phí ngay trong ngày ạ.', at: daysAgo(2) },
    ],
  },
  {
    id: 'tk-2', customerId: 'u-cus3', type: 'support', subject: 'Hỏi về thuê áo dài cưới', status: 'open', createdAt: daysAgo(1),
    messages: [{ from: 'u-cus3', text: 'Mình muốn thuê áo dài cưới An Nhiên 3 ngày vào cuối tháng, có cần đặt trước không ạ?', at: daysAgo(1) }],
  },
  {
    id: 'tk-3', customerId: 'u-cus1', type: 'feedback', subject: 'Góp ý giao diện website', status: 'resolved', createdAt: daysAgo(15),
    messages: [
      { from: 'u-cus1', text: 'Website dễ dùng, mong shop có thêm bộ lọc theo màu.', at: daysAgo(15) },
      { from: 'u-admin', text: 'Cảm ơn bạn, Panda đã bổ sung bộ lọc màu và size.', at: daysAgo(14) },
    ],
  },
]

const tasks: Task[] = [
  { id: 'task-1', title: 'Kiểm kê kho phụ kiện', description: 'Đếm lại số lượng túi và cà vạt, cập nhật vào hệ thống.', assigneeId: 'u-staff2', dueDate: addDays(toDateInput(new Date()), 2), status: 'todo', createdBy: 'u-admin', createdAt: daysAgo(1) },
  { id: 'task-2', title: 'Gọi xác nhận đơn thuê cuối tuần', assigneeId: 'u-staff1', dueDate: toDateInput(new Date()), status: 'doing', createdBy: 'u-admin', createdAt: daysAgo(2) },
  { id: 'task-3', title: 'Giặt ủi đầm dạ hội trả về', assigneeId: 'u-staff2', dueDate: addDays(toDateInput(new Date()), -1), status: 'done', createdBy: 'u-admin', createdAt: daysAgo(4) },
]

export function createSeed(): Database {
  const users = buildUsers()
  const { products, variants } = buildProducts()
  const { orders, payments } = buildOrders(products, variants, users)
  return {
    version: DB_VERSION,
    users,
    categories,
    suppliers,
    collections,
    products,
    variants,
    movements: [
      ...variants.slice(0, 6).map((v, i): StockMovement => ({
        id: `mv-${i + 1}`, variantId: v.id, type: 'import', quantity: 5, note: 'Nhập hàng đầu kỳ', status: 'approved', userId: 'u-staff2', approvedBy: 'u-admin', createdAt: daysAgo(40 - i),
      })),
      { id: 'mv-pending', variantId: variants[3].id, type: 'adjust', quantity: -1, note: 'Phát hiện 1 sản phẩm lỗi đường may', status: 'pending', userId: 'u-staff2', createdAt: daysAgo(0, 9) },
    ],
    carts: {},
    wishlists: { 'u-cus1': ['p-11', 'p-13'] },
    orders,
    payments,
    requests: [
      { id: 'rq-1', orderId: orders.find((o) => o.type === 'rental' && o.status === 'renting')?.id ?? orders[0].id, customerId: 'u-cus1', type: 'extend', reason: 'Tiệc kéo dài thêm một ngày', extendDays: 1, status: 'forwarded', staffNote: 'Mẫu này chưa có lịch thuê tiếp theo.', handledBy: 'u-staff1', createdAt: daysAgo(1), updatedAt: daysAgo(0, 8) },
      { id: 'rq-2', orderId: orders.find((o) => o.type === 'sale' && o.status === 'completed')?.id ?? orders[0].id, customerId: 'u-cus2', type: 'return', reason: 'Size không vừa, muốn đổi size nhỏ hơn', status: 'pending', createdAt: daysAgo(0, 9), updatedAt: daysAgo(0, 9) },
    ],
    coupons,
    reviews: buildReviews(orders),
    notifications: [
      { id: 'nt-1', userId: 'u-cus1', title: 'Chào mừng bạn đến với Panda Fashion', body: 'Nhập PANDA10 để được giảm 10% cho đơn tiếp theo.', link: '/tai-khoan/uu-dai', read: false, createdAt: daysAgo(2) },
    ],
    tickets,
    tasks,
    activity: [{ id: 'act-1', userId: 'u-admin', action: 'Khởi tạo dữ liệu mẫu', at: daysAgo(0, 7) }],
    aiLogs: [],
    settings: defaultSettings,
    resets: [],
    session: {},
    loginAttempts: {},
  }
}
