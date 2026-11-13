import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { login, registerCustomer, requestPasswordReset, resetPassword, setNewPassword, useCustomer } from '../../services/auth'
import { errorMessage } from '../../services/core'
import { isRemote } from '../../data/store'
import { Field } from '../../components/ui'
import { useFeedback } from '../../components/feedback'

const useRedirect = () => (useLocation().state as { from?: string } | null)?.from ?? '/tai-khoan'

/** Chạy một thao tác gửi form, hiển thị lỗi và trạng thái đang xử lý. */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = (fn: () => Promise<void>) => async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

export function Login() {
  const customer = useCustomer()
  const navigate = useNavigate()
  const redirect = useRedirect()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit()
  if (customer) return <Navigate to={redirect} replace />

  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={submit(async () => {
        await login(identifier, password, 'shop')
        navigate(redirect, { replace: true })
      })}>
        <div><small className="muted">PANDA FASHION</small><h1>Đăng nhập</h1></div>
        {error && <div className="form-error">{error}</div>}
        <Field label={isRemote ? 'Email' : 'Email hoặc số điện thoại'}><input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus /></Field>
        <Field label="Mật khẩu"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <div className="row-between small"><span /><Link to="/quen-mat-khau">Quên mật khẩu?</Link></div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <p className="small">Chưa có tài khoản? <Link to="/dang-ky" state={{ from: redirect }}>Đăng ký ngay</Link></p>
        {!isRemote && <p className="muted small">Tài khoản dùng thử: <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setIdentifier('khachhang@panda.vn'); setPassword('123456') }}>khachhang@panda.vn / 123456</button></p>}
      </form>
    </div>
  )
}

export function Register() {
  const customer = useCustomer()
  const navigate = useNavigate()
  const redirect = useRedirect()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [sentTo, setSentTo] = useState('')
  const { busy, error, submit } = useSubmit()
  if (customer) return <Navigate to={redirect} replace />

  if (sentTo)
    return (
      <div className="auth-page">
        <div className="auth-card stack">
          <h1>Kiểm tra email</h1>
          <p>Panda đã gửi liên kết xác nhận tới <strong>{sentTo}</strong>. Mở email và bấm liên kết để kích hoạt tài khoản, sau đó đăng nhập.</p>
          <Link to="/dang-nhap" className="btn btn-primary btn-block">Đến trang đăng nhập</Link>
        </div>
      </div>
    )

  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={submit(async () => {
        if (form.password !== form.confirm) throw new Error('Mật khẩu nhập lại không khớp.')
        const { needsConfirmation } = await registerCustomer(form)
        if (needsConfirmation) setSentTo(form.email.trim())
        else navigate(redirect, { replace: true })
      })}>
        <div><small className="muted">PANDA FASHION</small><h1>Tạo tài khoản</h1><p className="muted">Theo dõi đơn hàng, lưu sản phẩm yêu thích và tích điểm thành viên.</p></div>
        {error && <div className="form-error">{error}</div>}
        <Field label="Họ và tên"><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoFocus /></Field>
        <div className="grid-2">
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Số điện thoại"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Mật khẩu"><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Nhập lại mật khẩu"><input className="input" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" /></Field>
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Đang tạo tài khoản…' : 'Đăng ký'}</button>
        <p className="small">Đã có tài khoản? <Link to="/dang-nhap" state={{ from: redirect }}>Đăng nhập</Link></p>
      </form>
    </div>
  )
}

export function ForgotPassword() {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'code' | 'sent'>('email')
  const [sentCode, setSentCode] = useState<string>()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit()

  if (step === 'sent')
    return (
      <div className="auth-page">
        <div className="auth-card stack">
          <h1>Kiểm tra email</h1>
          <p>Nếu <strong>{email}</strong> đã đăng ký, bạn sẽ nhận được email chứa liên kết đặt lại mật khẩu. Mở liên kết trên trình duyệt này để đặt mật khẩu mới.</p>
          <Link to="/dang-nhap" className="btn btn-block">Quay lại đăng nhập</Link>
        </div>
      </div>
    )

  return (
    <div className="auth-page">
      {step === 'email' ? (
        <form className="auth-card stack" onSubmit={submit(async () => {
          const result = await requestPasswordReset(email)
          setSentCode(result)
          setStep(result ? 'code' : 'sent')
        })}>
          <div><h1>Quên mật khẩu</h1><p className="muted">Nhập email đã đăng ký, chúng tôi sẽ gửi {isRemote ? 'liên kết' : 'mã xác nhận'} để đặt lại mật khẩu.</p></div>
          {error && <div className="form-error">{error}</div>}
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
          <Link to="/dang-nhap" className="small">← Quay lại đăng nhập</Link>
        </form>
      ) : (
        <form className="auth-card stack" onSubmit={submit(async () => {
          await resetPassword(email, code, password)
          toast('Đã đặt lại mật khẩu, mời bạn đăng nhập.')
          navigate('/dang-nhap')
        })}>
          <div><h1>Đặt lại mật khẩu</h1><p className="muted">Mã xác nhận đã được gửi tới {email} (hiệu lực 15 phút).</p></div>
          <div className="form-note">Bản chạy thử chưa gửi email thật — mã của bạn là <strong>{sentCode}</strong>.</div>
          {error && <div className="form-error">{error}</div>}
          <Field label="Mã xác nhận"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus /></Field>
          <Field label="Mật khẩu mới"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Đặt lại mật khẩu</button>
        </form>
      )}
    </div>
  )
}

/** Trang mở từ liên kết khôi phục trong email (Supabase): đặt mật khẩu mới. */
export function ResetPassword() {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const { busy, error, submit } = useSubmit()
  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={submit(async () => {
        if (password !== confirm) throw new Error('Mật khẩu nhập lại không khớp.')
        await setNewPassword(password)
        toast('Đã đặt mật khẩu mới, mời bạn đăng nhập.')
        navigate('/dang-nhap')
      })}>
        <div><h1>Đặt mật khẩu mới</h1><p className="muted">Nhập mật khẩu mới cho tài khoản của bạn.</p></div>
        {error && <div className="form-error">{error}</div>}
        <Field label="Mật khẩu mới"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus /></Field>
        <Field label="Nhập lại"><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Lưu mật khẩu</button>
      </form>
    </div>
  )
}
