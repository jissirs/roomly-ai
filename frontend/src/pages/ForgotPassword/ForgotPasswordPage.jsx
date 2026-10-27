import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'
import { requestPasswordReset } from '../../lib/auth'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isSent, setIsSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await requestPasswordReset(email.trim())
      setIsSent(true)
    } catch (err) {
      setError(err.message || 'ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="ลืมรหัสผ่าน?"
      description="กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้ทางอีเมล"
      footer={
        <>
          จำรหัสผ่านได้แล้ว?<Link to="/login">กลับไปเข้าสู่ระบบ</Link>
        </>
      }
    >
      {isSent ? (
        <div className="auth-success" role="status">
          <strong>ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว</strong>
          <p>ถ้าอีเมล {email.trim()} มีบัญชีในระบบ คุณจะได้รับอีเมลภายในไม่กี่นาที (ตรวจโฟลเดอร์สแปมด้วย)</p>
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
          {error ? <p className="auth-field-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export default ForgotPasswordPage
