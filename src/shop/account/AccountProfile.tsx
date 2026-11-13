import { useState } from 'react'
import { useCustomer, changePassword, updateProfile } from '../../services/auth'
import { uploadImage } from '../../lib/images'
import { Avatar, Field } from '../../components/ui'
import { useAction } from '../../components/feedback'

export function AccountProfile() {
  const customer = useCustomer()!
  const run = useAction()
  const [form, setForm] = useState({ fullName: customer.fullName, phone: customer.phone, email: customer.email, gender: customer.gender, birthDate: customer.birthDate ?? '' })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })

  const changeAvatar = async (file?: File) => {
    if (file) await run(async () => updateProfile(customer.id, { avatar: await uploadImage(file, 'avatar', customer.id) }), 'Đã cập nhật ảnh đại diện')
  }
  const savePassword = async () => {
    const ok = await run(() => {
      if (pw.next !== pw.confirm) throw new Error('Mật khẩu nhập lại không khớp.')
      return changePassword(customer.id, pw.current, pw.next)
    }, 'Đã đổi mật khẩu')
    if (ok) setPw({ current: '', next: '', confirm: '' })
  }

  return (
    <>
      <h2>Hồ sơ cá nhân</h2>
      <section className="card card-pad stack">
        <div className="row">
          <Avatar name={customer.fullName} src={customer.avatar} size="lg" />
          <div className="stack-sm">
            <strong>{customer.fullName}</strong>
            <div className="row">
              <label className="btn btn-sm">Đổi ảnh đại diện<input type="file" accept="image/*" hidden onChange={(e) => void changeAvatar(e.target.files?.[0])} /></label>
              {customer.avatar && <button className="btn btn-ghost btn-sm" onClick={() => void run(() => updateProfile(customer.id, { avatar: undefined }), 'Đã xóa ảnh')}>Xóa ảnh</button>}
            </div>
          </div>
        </div>
        <div className="grid-2">
          <Field label="Họ và tên"><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Số điện thoại"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Ngày sinh"><input className="input" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
          <Field label="Giới tính">
            <select className="select" value={form.gender ?? ''} onChange={(e) => setForm({ ...form, gender: (e.target.value || undefined) as typeof form.gender })}>
              <option value="">—</option><option>Nam</option><option>Nữ</option><option>Khác</option>
            </select>
          </Field>
        </div>
        <div><button className="btn btn-primary" onClick={() => void run(() => updateProfile(customer.id, { ...form, birthDate: form.birthDate || undefined }), 'Đã lưu thông tin')}>Lưu thay đổi</button></div>
      </section>
      <section className="card card-pad stack">
        <h3>Đổi mật khẩu</h3>
        <div className="grid-3">
          <Field label="Mật khẩu hiện tại"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="Mật khẩu mới"><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Nhập lại"><input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <div><button className="btn" onClick={() => void savePassword()}>Đổi mật khẩu</button></div>
      </section>
    </>
  )
}
