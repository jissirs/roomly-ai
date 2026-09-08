import { Link } from 'react-router-dom'
import './AuthShell.css'

function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Roomly AI">
        <Link to="/" className="auth-logo">
          ROOMLY AI
        </Link>

        <div className="auth-visual-content">
          <p className="auth-visual-eyebrow">AI Interior Decision Platform</p>
          <h1>พื้นที่ที่ใช่ เริ่มจากการตัดสินใจที่ชัดเจน</h1>
          <p>
            ให้ AI ช่วยวิเคราะห์สิ่งที่ควรเก็บ เปลี่ยน และเลือกซื้อ เพื่อสร้างห้องที่สวยและอยู่ในงบจริง
          </p>
        </div>

        <p className="auth-visual-note">Designed for thoughtful living.</p>
      </section>

      <section className="auth-panel">
        <Link to="/" className="auth-back-link" aria-label="กลับหน้าหลัก">
          <span aria-hidden="true">←</span> กลับหน้าหลัก
        </Link>

        <div className="auth-card">
          <header className="auth-card-header">
            <p className="auth-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </header>

          {children}

          <footer className="auth-card-footer">{footer}</footer>
        </div>
      </section>
    </main>
  )
}

export default AuthShell
