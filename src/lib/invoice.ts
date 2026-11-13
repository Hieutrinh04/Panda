// In hóa đơn / phiếu thuê bằng lệnh in của trình duyệt (có thể chọn "Lưu dưới dạng PDF").
import type { Order, Payment, StoreSettings } from '../types'
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL } from '../services/labels'
import { date, dateTime, money } from './format'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function printInvoice(order: Order, payments: Payment[], settings: StoreSettings) {
  const rental = order.type === 'rental'
  const rows = order.items
    .map((i) => {
      const amount = i.unitPrice * i.quantity * (rental ? i.days : 1)
      return `<tr><td>${esc(i.name)}<br><small>${esc(i.sku)} · ${esc(i.size)} / ${esc(i.color)}</small></td><td class="c">${i.quantity}</td><td class="r">${money(i.unitPrice)}${rental ? `/ngày × ${i.days}` : ''}</td><td class="r">${money(amount)}</td></tr>`
    })
    .join('')
  const paymentRows = payments
    .map((p) => `<tr><td>${dateTime(p.createdAt)}</td><td>${PAYMENT_TYPE_LABEL[p.type]}</td><td>${PAYMENT_METHOD_LABEL[p.method]}</td><td class="r">${money(p.amount)}</td></tr>`)
    .join('')
  const paid = payments.reduce((s, p) => s + p.amount, 0)

  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${rental ? 'Phiếu thuê' : 'Hóa đơn'} ${order.code}</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;color:#17191f;margin:32px;font-size:13px}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:22px 0 8px}
.head{display:flex;justify-content:space-between;border-bottom:2px solid #17191f;padding-bottom:12px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
th{font-size:11px;text-transform:uppercase;color:#666}.r{text-align:right}.c{text-align:center}small{color:#666}
.sum td{border:0;padding:3px 6px}.total td{font-size:15px;font-weight:700;border-top:2px solid #17191f}
.sign{display:flex;justify-content:space-around;margin-top:48px;text-align:center}.sign div{width:200px}
@media print{body{margin:12mm}}
</style></head><body>
<div class="head"><div><h1>${esc(settings.storeName)}</h1><div>${esc(settings.address)}</div><div>Hotline: ${esc(settings.hotline)}</div></div>
<div class="r"><h1>${rental ? 'PHIẾU THUÊ ĐỒ' : 'HÓA ĐƠN BÁN HÀNG'}</h1><div>Mã đơn: <b>${order.code}</b></div><div>Ngày: ${dateTime(order.createdAt)}</div></div></div>
<h2>Khách hàng</h2>
<div>${esc(order.customerName)} · ${esc(order.phone)}</div><div>${esc(order.address)}</div>
${rental && order.rental ? `<div>Thời gian thuê: <b>${date(order.rental.startDate)} → ${date(order.rental.endDate)}</b> · Phí trả trễ ${settings.lateFeePercentPerDay}% giá thuê/ngày</div>` : ''}
<h2>Sản phẩm</h2>
<table><thead><tr><th>Sản phẩm</th><th class="c">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
<table class="sum" style="margin-top:8px">
<tr><td class="r">Tạm tính</td><td class="r" style="width:160px">${money(order.subtotal)}</td></tr>
${order.discount ? `<tr><td class="r">Giảm giá${order.couponCode ? ` (${esc(order.couponCode)})` : ''}</td><td class="r">−${money(order.discount)}</td></tr>` : ''}
<tr><td class="r">Phí giao hàng</td><td class="r">${money(order.shippingFee)}</td></tr>
${order.depositTotal ? `<tr><td class="r">Tiền cọc (hoàn khi trả đồ)</td><td class="r">${money(order.depositTotal)}</td></tr>` : ''}
${order.rental && (order.rental.lateFee || order.rental.damageFee) ? `<tr><td class="r">Phí trễ hạn / bồi thường</td><td class="r">${money(order.rental.lateFee)} / ${money(order.rental.damageFee)}</td></tr>` : ''}
<tr class="total"><td class="r">Tổng thanh toán</td><td class="r">${money(order.total)}</td></tr>
<tr><td class="r">Đã thu (ròng)</td><td class="r">${money(paid)}</td></tr>
</table>
${paymentRows ? `<h2>Thu chi</h2><table><thead><tr><th>Thời gian</th><th>Khoản</th><th>Hình thức</th><th class="r">Số tiền</th></tr></thead><tbody>${paymentRows}</tbody></table>` : ''}
<div class="sign"><div>Khách hàng<br><small>(ký, ghi rõ họ tên)</small></div><div>Nhân viên<br><small>(ký, ghi rõ họ tên)</small></div></div>
</body></html>`

  // In qua iframe ẩn để không bị trình duyệt chặn cửa sổ bật lên.
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  frame.contentWindow!.focus()
  frame.contentWindow!.print()
  setTimeout(() => frame.remove(), 60_000)
}
