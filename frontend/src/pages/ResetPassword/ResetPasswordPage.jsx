import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../../components/AuthShell/AuthShell'
import { setNewPassword } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // The emailed link signs the browser in for recovery; without it there is nothing to reset.
  useEffect(() => {
    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === 'PASSWORD_RECOVERY') setStatus('ready')
    })
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (active) setStatus((current) => (current === 'checking' ? (data.session ? 'ready' : 'invalid') : current))
    }, 1200)
    return () => {
      active = false
      clearTimeout(timer)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }
    setIsSubmitting(true)
    try {
      await setNewPassword(password)
      setStatus('done')
      setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      setError(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="ตั้งรหัสผ่านใหม่"
      description="ตั้งรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร"
      footer={<Link to="/login">กลับไปเข้าสู่ระบบ</Link>}
    >
      {status === 'checking' ? <p role="status">กำลังตรวจสอบลิงก์...</p> : null}
      {status === 'invalid' ? (
        <div className="auth-success" role="alert">
          <strong>ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว</strong>
          <Link to="/forgot-password">ขอลิงก์ใหม่</Link>
        </div>
      ) : null}
      {status === 'done' ? (
        <div className="auth-success" role="status">
          <strong>ตั้งรหัสผ่านใหม่เรียบร้อย</strong>
          <p>กำลังพาไปหน้าเข้าสู่ระบบ...</p>
        </div>
      ) : null}
      {status === 'ready' ? (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="reset-password">รหัสผ่านใหม่</label>
            <input className="auth-input" id="reset-password" type="password" autoComplete="new-password" minLength="8" placeholder="อย่างน้อย 8 ตัวอักษร" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <div className="auth-field">
            <label htmlFor="reset-confirm-password">ยืนยันรหัสผ่านใหม่</label>
            <input className="auth-input" id="reset-confirm-password" type="password" autoComplete="new-password" minLength="8" placeholder="กรอกรหัสผ่านอีกครั้ง" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </div>
          {error ? <p className="auth-field-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}</button>
        </form>
      ) : null}
    </AuthShell>
  )
}

export default ResetPasswordPage
