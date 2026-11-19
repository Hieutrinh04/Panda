import { Link } from 'react-router-dom'
import { CalendarCheck, RotateCcw, ShieldCheck, Truck } from 'lucide-react'
import { useDb } from '../../data/store'
import { canRent, canSell, productImage } from '../../services/catalog'
import { money } from '../../lib/format'
import { ProductCard } from '../ProductCard'
import { RecommendationSection } from '../Recommendations'
import { useCustomer } from '../../services/auth'
import { recentlyViewed, recommendForUser } from '../../services/recommend'

export function Home() {
  const db = useDb()
  const active = db.products.filter((p) => p.status === 'active')
  const featured = active.filter((p) => p.featured)
  const sale = featured.filter(canSell).slice(0, 4)
  const rental = active.filter(canRent).slice(0, 8)
  const heroImages = featured.slice(0, 2)
  const customer = useCustomer()
  // Khách đã đăng nhập hoặc đã xem sản phẩm: gợi ý cá nhân; khách mới: theo độ phổ biến.
  const viewed = recentlyViewed()
  const forYou = recommendForUser(db, customer?.id, { viewed, limit: 4 })
  const personal = Boolean(customer || viewed.length)

  return (
    <>
      <section className="hero">
        <div className="container">
          <div>
            <small>PANDA FASHION · BỘ SƯU TẬP MỚI</small>
            <h1>{db.settings.heroTitle}</h1>
            <p>{db.settings.heroSubtitle}</p>
            <div className="row">
              <Link to="/san-pham?mode=sale" className="btn btn-primary btn-lg">Mua sắm ngay</Link>
              <Link to="/san-pham?mode=rental" className="btn btn-lg">Thuê trang phục</Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden>
            {heroImages.map((p) => <img key={p.id} src={productImage(db, p)} alt="" />)}
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section">
          <div className="section-head">
            <div><small>DANH MỤC</small><h2>Chọn phong cách của bạn</h2></div>
            <Link to="/san-pham">Xem tất cả →</Link>
          </div>
          <div className="cat-grid">
            {db.categories.map((c) => {
              const sample = active.find((p) => p.categoryId === c.id)
              return (
                <Link key={c.id} to={`/san-pham?cat=${c.id}`} className="cat-card">
                  {sample && <img src={productImage(db, sample)} alt="" />}
                  <span>{c.name}</span>
                </Link>
              )
            })}
          </div>
        </section>

        <RecommendationSection eyebrow={personal ? 'DÀNH RIÊNG CHO BẠN' : 'XU HƯỚNG'} title={personal ? 'Gợi ý cho bạn' : 'Đang được nhiều khách chọn'} items={forYou} />

        <section className="section">
          <div className="section-head">
            <div><small>NỔI BẬT</small><h2>Được yêu thích nhất</h2></div>
            <Link to="/san-pham?mode=sale">Bộ sưu tập →</Link>
          </div>
          <div className="product-grid">{sale.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>

        <section className="section">
          <div className="section-head">
            <div><small>THUÊ ĐỒ</small><h2>Thuê theo ngày, hoàn cọc khi trả</h2></div>
            <Link to="/san-pham?mode=rental">Xem đồ cho thuê →</Link>
          </div>
          <div className="product-grid">{rental.map((p) => <ProductCard key={p.id} product={p} preferRental />)}</div>
        </section>

        <section className="section">
          <div className="section-head"><div><small>BỘ SƯU TẬP</small><h2>Theo dịp</h2></div></div>
          <div className="collection-band">
            {db.collections.map((c) => (
              <Link key={c.id} to={`/san-pham?col=${c.id}`} className="collection-card">
                <div><h3>{c.name}</h3><p style={{ opacity: 0.8, marginTop: 6 }}>{c.description}</p></div>
                <span>{active.filter((p) => p.collectionId === c.id).length} mẫu →</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="perks">
          <div className="perk"><Truck /><div><strong>Giao hàng toàn quốc</strong><span>Miễn phí từ {money(db.settings.freeShippingFrom)}</span></div></div>
          <div className="perk"><CalendarCheck /><div><strong>Đặt lịch thuê linh hoạt</strong><span>Chọn ngày nhận – trả, gia hạn online</span></div></div>
          <div className="perk"><ShieldCheck /><div><strong>Hoàn cọc minh bạch</strong><span>Theo dõi tiền cọc ngay trong tài khoản</span></div></div>
          <div className="perk"><RotateCcw /><div><strong>Đổi trả 7 ngày</strong><span>Áp dụng cho sản phẩm mua</span></div></div>
        </div>
      </div>
      <div style={{ height: 60 }} />
    </>
  )
}
