import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'
import { register } from '../../lib/auth'

function RegisterPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    if (password !== confirmPassword) {
      setPasswordError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    setPasswordError('')

    const data = new FormData(event.currentTarget)
    setIsSubmitting(true)
    try {
      await register(data.get('email'), data.get('password'), {
        firstName: data.get('firstName')?.trim(),
        lastName: data.get('lastName')?.trim(),
      })
      navigate('/home')
    } catch (err) {
      const message = String(err.message ?? '')
      if (message === 'User already registered') setFormError('อีเมลนี้มีบัญชีอยู่แล้ว')
      else if (message === 'EMAIL_CONFIRMATION_REQUIRED') setFormError('สมัครสำเร็จแล้ว กรุณายืนยันอีเมลจากลิงก์ที่ส่งไปที่กล่องจดหมาย แล้วจึงเข้าสู่ระบบ')
      else if (/rate limit/i.test(message)) setFormError('ส่งอีเมลยืนยันบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
      else setFormError(`สมัครสมาชิกไม่สำเร็จ: ${message || 'กรุณาลองใหม่'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Create an account"
      title="สร้างบัญชีใหม่"
      description="เริ่มวางแผนห้องที่ใช่ ภายใต้งบประมาณที่คุณกำหนด"
      footer={
        <>
          มีบัญชีอยู่แล้ว?<Link to="/login">เข้าสู่ระบบ</Link>
        </>
      }
    >
      <form className="auth-form auth-form-register" onSubmit={handleSubmit}>
        <div className="auth-field-row">
          <div className="auth-field">
            <label htmlFor="register-first-name">ชื่อ</label>
            <input
              className="auth-input"
              id="register-first-name"
              name="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="ชื่อ"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="register-last-name">นามสกุล</label>
            <input
              className="auth-input"
              id="register-last-name"
              name="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="นามสกุล"
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="register-email">อีเมล</label>
          <input
            className="auth-input"
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="register-phone">เบอร์โทรศัพท์</label>
          <input
            className="auth-input"
            id="register-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="08X-XXX-XXXX"
            pattern="[0-9+\-\s]{9,15}"
            title="กรุณากรอกเบอร์โทรศัพท์ 9–15 หลัก"
            required
          />
        </div>

        <div className="auth-field">
          <label htmlFor="register-password">รหัสผ่าน</label>
          <input
            className="auth-input"
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength="8"
            placeholder="อย่างน้อย 8 ตัวอักษร"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setPasswordError('')
            }}
            aria-describedby="password-hint"
            required
          />
          <p className="auth-field-hint" id="password-hint">
            ใช้อย่างน้อย 8 ตัวอักษร และควรมีตัวเลขหรือสัญลักษณ์ร่วมด้วย
          </p>
        </div>

        <div className="auth-field">
          <label htmlFor="register-confirm-password">ยืนยันรหัสผ่าน</label>
          <input
            className={`auth-input ${passwordError ? 'is-invalid' : ''}`.trim()}
            id="register-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength="8"
            placeholder="กรอกรหัสผ่านอีกครั้ง"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value)
              setPasswordError('')
            }}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? 'password-error' : undefined}
            required
          />
          {passwordError ? (
            <p className="auth-field-error" id="password-error" role="alert">
              {passwordError}
            </p>
          ) : null}
        </div>

        <div className="auth-checkbox-stack">
          <label className="auth-checkbox">
            <input type="checkbox" name="terms" required />
            <span>
              ฉันยอมรับ <a className="auth-inline-link" href="#terms">ข้อกำหนดการใช้งาน</a> และ{' '}
              <a className="auth-inline-link" href="#privacy">นโยบายความเป็นส่วนตัว</a>
            </span>
          </label>
        </div>

        {formError ? <p className="auth-field-error" role="alert">{formError}</p> : null}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชี'}
        </button>
      </form>
    </AuthShell>
  )
}

export default RegisterPage
