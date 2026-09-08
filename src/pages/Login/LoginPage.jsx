import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'

function LoginPage() {
  const navigate = useNavigate()

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
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault()
          navigate('/home')
        }}
      >
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

        <button className="auth-submit" type="submit">
          เข้าสู่ระบบ
        </button>
      </form>

      <div className="auth-divider">หรือ</div>
      <button className="auth-secondary-button" type="button">
        ดำเนินการต่อด้วย Google
      </button>
    </AuthShell>
  )
}

export default LoginPage
