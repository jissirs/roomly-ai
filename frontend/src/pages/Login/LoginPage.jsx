import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'
import { login } from '../../lib/auth'

function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    setIsSubmitting(true)
    try {
      await login(data.get('email'), data.get('password'))
      navigate('/home')
    } catch (err) {
      setError(err.message === 'Invalid email or password' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="เข้าสู่ระบบ"
      description="กลับมาสานต่อห้องในฝันของคุณกับ Roomly AI"
      footer={
        <>
          ยังไม่มีบัญชี?<Link to="/register">สร้างบัญชีใหม่</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="login-email">อีเมล</label>
          <input
            className="auth-input"
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            required
          />
        </div>

        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="login-password">รหัสผ่าน</label>
            <Link className="auth-inline-link" to="/forgot-password">
              ลืมรหัสผ่าน?
            </Link>
          </div>
          <input
            className="auth-input"
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="กรอกรหัสผ่าน"
            required
          />
        </div>

        <label className="auth-checkbox">
          <input type="checkbox" name="remember" />
          จดจำการเข้าสู่ระบบของฉัน
        </label>

        {error ? <p className="auth-field-error" role="alert">{error}</p> : null}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </AuthShell>
  )
}

export default LoginPage
