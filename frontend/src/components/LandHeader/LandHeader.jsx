import { Link } from 'react-router-dom'
import './LandHeader.css'

function LandHeader() {
  return (
    <header className="landing-nav">
      <Link to="/" className="landing-logo">
        ROOMLY AI
      </Link>


      <div className="landing-nav-actions">
        <Link to="/login" className="landing-link-muted">
          เข้าสู่ระบบ
        </Link>
        <Link to="/register" className="landing-btn landing-btn-primary">
          เริ่มออกแบบ
        </Link>
      </div>
    </header>
  )
}

export default LandHeader
