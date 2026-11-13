import { Link } from 'react-router-dom'
import { useDb } from '../../data/store'
import { money } from '../../lib/format'

export function About() {
  const s = useDb((db) => db.settings)
  return (
    <>
      <section className="about-hero">
        <div className="container">
          <small>VỀ CHÚNG TÔI</small>
          <h1>Thời trang kể câu chuyện<br />về chính bạn.</h1>
          <p style={{ maxWidth: 560, marginTop: 14, opacity: 0.85 }}>{s.storeName} là nơi bạn có thể mua hoặc thuê những thiết kế thanh lịch cho lễ cưới, dạ tiệc, Tết và lễ hội — tiết kiệm chi phí mà vẫn nổi bật.</p>
        </div>
      </section>
      <div className="container" style={{ padding: '40px 20px 70px' }}>
        <div className="grid-3">
          <section className="card card-pad stack-sm">
            <h3>Cách thuê đồ</h3>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)' }}>
              <li>Chọn mẫu, size và ngày nhận – ngày trả.</li>
              <li>Đặt online, thanh toán tiền thuê và tiền cọc.</li>
              <li>Nhận đồ tại nhà hoặc tại cửa hàng.</li>
              <li>Trả đồ đúng hạn và nhận lại tiền cọc.</li>
            </ol>
          </section>
          <section className="card card-pad stack-sm">
            <h3>Chính sách cọc & phí</h3>
            <p className="muted">Tiền cọc hoàn đầy đủ khi đồ được trả đúng hạn và nguyên vẹn. Trả trễ tính {s.lateFeePercentPerDay}% giá thuê mỗi ngày; hư hỏng tính phí bồi thường theo mức độ. Có thể gửi yêu cầu gia hạn trước ngày trả.</p>
          </section>
          <section className="card card-pad stack-sm">
            <h3>Đổi trả & giao hàng</h3>
            <p className="muted">Sản phẩm mua được đổi trả trong 7 ngày. Phí giao {money(s.shippingFee)}, miễn phí cho đơn từ {money(s.freeShippingFrom)}.</p>
          </section>
        </div>
        <section className="card card-pad stack-sm" style={{ marginTop: 18 }}>
          <h3>Ghé thăm {s.storeName}</h3>
          <p>Địa chỉ: {s.address}</p>
          <p>Hotline / Zalo: {s.hotline} · Email: {s.email}</p>
          <p>Giờ mở cửa: {s.openHours}</p>
          <div className="row" style={{ marginTop: 8 }}><Link to="/tai-khoan/ho-tro" className="btn btn-primary">Gửi góp ý / yêu cầu hỗ trợ</Link></div>
        </section>
      </div>
    </>
  )
}
