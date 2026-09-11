import { Link } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import './SettingsPage.css'

function SettingsPage() {
  const user = getCurrentUser()

  return (
    <div className="settings-shell">
      <header className="settings-topbar">
        <Link to="/home">← กลับหน้าหลัก</Link>
        <span>ROOMLY AI · SETTINGS</span>
      </header>

      <main className="settings-content">
        <p className="settings-eyebrow">บัญชีผู้ใช้</p>
        <h1>ตั้งค่า</h1>

        <section className="settings-card">
          <div>
            <span>ชื่อ</span>
            <strong>{user?.name || '—'}</strong>
          </div>
          <div>
            <span>อีเมล</span>
            <strong>{user?.email || '—'}</strong>
          </div>
        </section>

        <p className="settings-note">ยังไม่มีการตั้งค่าให้แก้ไขในหน้านี้</p>
      </main>
    </div>
  )
}

export default SettingsPage
