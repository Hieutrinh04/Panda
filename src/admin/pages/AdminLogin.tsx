import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { login, useAdminUser } from '../../services/auth'
import { isRemote } from '../../data/store'
import { errorMessage } from '../../services/core'
import { Field } from '../../components/ui'
import '../../styles/admin.css'

export function AdminLogin() {
  const user = useAdminUser()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/admin'
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(identifier, password, 'admin')
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-box stack" onSubmit={submit}>
        <div className="admin-brand" style={{ padding: 0, color: 'var(--ink)' }}>
          <span className="logo-mark" style={{ color: '#fff' }}>P</span>
          <span><strong>PANDA</strong><small>FASHION · QUẢN TRỊ</small></span>
        </div>
        <div>
          <h1>Đăng nhập quản trị</h1>
          <p className="muted">Dành cho quản lý và nhân viên cửa hàng.</p>
        </div>
        {error && <div className="form-error">{error}</div>}
        <Field label="Tên đăng nhập, email hoặc SĐT">
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus autoComplete="username" />
        </Field>
        <Field label="Mật khẩu">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <p className="muted small">Quên mật khẩu? {isRemote ? <Link to="/quen-mat-khau">Đặt lại qua email</Link> : 'Liên hệ quản lý cửa hàng để được cấp lại.'}</p>
        {!isRemote && (
          <div className="demo-accounts">
            <strong>Tài khoản dùng thử</strong>
            <div>Quản lý: <button type="button" onClick={() => { setIdentifier('admin'); setPassword('admin123') }}>admin / admin123</button></div>
            <div>Nhân viên: <button type="button" onClick={() => { setIdentifier('nhanvien'); setPassword('staff123') }}>nhanvien / staff123</button></div>
          </div>
        )}
      </form>
    </div>
  )
}
