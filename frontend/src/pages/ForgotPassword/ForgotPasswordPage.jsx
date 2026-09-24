import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'
import { api } from '../../lib/api'

function ForgotPasswordPage() {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleCheckEmail(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const { exists } = await api.post('/auth/forgot/check', { email: email.trim() })
      if (exists) setStep('reset')
      else setError('ไม่พบอีเมลนี้ในระบบ')
    } catch (err) {
      setError(err.message || 'ตรวจสอบอีเมลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleReset(event) {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    setIsSubmitting(true)
    try {
      await api.post('/auth/forgot/reset', { email: email.trim(), new_password: password })
      setStep('done')
    } catch (err) {
      setError(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="ลืมรหัสผ่าน?"
      description={step === 'reset' ? `ตั้งรหัสผ่านใหม่สำหรับ ${email.trim()}` : 'กรอกอีเมลที่ใช้สมัคร ถ้ามีในระบบจะตั้งรหัสผ่านใหม่ได้ทันที'}
      footer={
        <>
          จำรหัสผ่านได้แล้ว?<Link to="/login">กลับไปเข้าสู่ระบบ</Link>
        </>
      }
    >
      {step === 'done' ? (
        <div className="auth-success" role="status">
          <strong>ตั้งรหัสผ่านใหม่เรียบร้อย</strong>
          <Link to="/login">ไปเข้าสู่ระบบด้วยรหัสผ่านใหม่</Link>
        </div>
      ) : step === 'reset' ? (
        <form className="auth-form" onSubmit={handleReset}>
          <div className="auth-field">
            <label htmlFor="forgot-new-password">รหัสผ่านใหม่</label>
            <input
              className="auth-input"
              id="forgot-new-password"
              type="password"
              autoComplete="new-password"
              minLength="8"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="forgot-confirm-password">ยืนยันรหัสผ่านใหม่</label>
            <input
              className="auth-input"
              id="forgot-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength="8"
              placeholder="กรอกรหัสผ่านอีกครั้ง"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="auth-field-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleCheckEmail}>
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
            {isSubmitting ? 'กำลังตรวจสอบ...' : 'ตรวจสอบอีเมล'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export default ForgotPasswordPage
