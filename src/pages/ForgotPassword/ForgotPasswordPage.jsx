import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="ลืมรหัสผ่าน?"
      description="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้คุณ"
      footer={
        <>
          จำรหัสผ่านได้แล้ว?<Link to="/login">กลับไปเข้าสู่ระบบ</Link>
        </>
      }
    >
      {submitted ? (
        <div className="auth-success" role="status">
          <strong>ตรวจสอบอีเมลของคุณ</strong>
          หากบัญชีของคุณใช้ {email} เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้ในอีกสักครู่
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="forgot-email">อีเมล</label>
            <input
              className="auth-input"
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <button className="auth-submit" type="submit">
            ส่งลิงก์ตั้งรหัสผ่านใหม่
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export default ForgotPasswordPage
