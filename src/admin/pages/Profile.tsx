import { useState } from 'react'
import { useAdminUser, changePassword, updateProfile } from '../../services/auth'
import { ROLE_LABEL } from '../../services/labels'
import { uploadImage } from '../../lib/images'
import { Avatar, Field } from '../../components/ui'
import { useAction } from '../../components/feedback'

function ProfileFields() {
  const user = useAdminUser()!
  const run = useAction()
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone, email: user.email, gender: user.gender, birthDate: user.birthDate ?? '' })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })

  const changeAvatar = async (file?: File) => {
    if (!file) return
    await run(async () => updateProfile(user.id, { avatar: await uploadImage(file, 'avatar', user.id) }), 'Đã đổi ảnh đại diện')
  }
  const savePassword = async () => {
    if (pw.next !== pw.confirm) return run(() => { throw new Error('Mật khẩu nhập lại không khớp.') })
    if (await run(() => changePassword(user.id, pw.current, pw.next), 'Đã đổi mật khẩu')) setPw({ current: '', next: '', confirm: '' })
  }

  return (
    <div className="grid-2">
      <section className="card card-pad stack">
        <div className="row">
          <Avatar name={user.fullName} src={user.avatar} size="lg" />
          <div className="stack-sm">
            <strong>{user.fullName}</strong>
            <span className="muted">{ROLE_LABEL[user.role]}{user.position && ` · ${user.position}`} · @{user.username}</span>
            <label className="btn btn-sm" style={{ width: 'fit-content' }}>Đổi ảnh<input type="file" accept="image/*" hidden onChange={(e) => void changeAvatar(e.target.files?.[0])} /></label>
          </div>
        </div>
        <Field label="Họ và tên"><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
        <div className="grid-2">
          <Field label="Số điện thoại"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Giới tính">
            <select className="select" value={form.gender ?? ''} onChange={(e) => setForm({ ...form, gender: (e.target.value || undefined) as typeof form.gender })}>
              <option value="">—</option><option>Nam</option><option>Nữ</option><option>Khác</option>
            </select>
          </Field>
          <Field label="Ngày sinh"><input className="input" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
        </div>
        <div><button className="btn btn-primary" onClick={() => void run(() => updateProfile(user.id, { ...form, birthDate: form.birthDate || undefined }), 'Đã lưu thông tin')}>Lưu thông tin</button></div>
      </section>
      <section className="card card-pad stack">
        <h3 style={{ fontSize: 15 }}>Đổi mật khẩu</h3>
        <Field label="Mật khẩu hiện tại"><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="Mật khẩu mới"><input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <Field label="Nhập lại mật khẩu mới"><input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        <div><button className="btn" onClick={() => void savePassword()}>Đổi mật khẩu</button></div>
      </section>
    </div>
  )
}

export function Profile() {
  return (
    <>
      <div className="page-head"><div><h2>Hồ sơ cá nhân</h2><p>Thông tin tài khoản trong phạm vi được cấp.</p></div></div>
      <ProfileFields />
    </>
  )
}
