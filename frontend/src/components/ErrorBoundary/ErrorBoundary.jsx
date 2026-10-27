import { Component } from 'react'

/** Keeps one broken page from leaving the whole app on a blank screen. */
class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Unhandled render error', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: '#f4efe6', background: '#130e0d', fontFamily: 'sans-serif' }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>เกิดข้อผิดพลาดบางอย่าง</h1>
          <p style={{ marginBottom: 20, color: '#aea896', fontSize: 14 }}>ข้อมูลของคุณยังปลอดภัย ลองโหลดหน้าใหม่อีกครั้ง</p>
          <button type="button" onClick={() => window.location.assign('/home')} style={{ height: 44, padding: '0 22px', border: 0, borderRadius: 999, background: '#dcccaa', color: '#1c1410', fontWeight: 600, cursor: 'pointer' }}>กลับไปที่คลังโปรเจกต์</button>
        </div>
      </main>
    )
  }
}

export default ErrorBoundary
