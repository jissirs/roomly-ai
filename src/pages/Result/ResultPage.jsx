import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProject } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import demoResult from '../../assets/auth-interior.png'
import '../Generate/GeneratePage.css'
import './ResultPage.css'

function CompareCard({ before, roomNumber }) {
  const [position, setPosition] = useState(50)
  return (
    <article className="compare-card">
      <div className="compare-card-heading">
        <div><span>ROOM {String(roomNumber).padStart(2, '0')}</span><strong>เปรียบเทียบก่อนและหลังตกแต่ง</strong></div>
        <small>ลากตัวเลื่อนเพื่อเปรียบเทียบ</small>
      </div>
      <div className="compare-frame" style={{ '--compare-position': `${position}%` }}>
        <img className="compare-after" src={demoResult} alt={`ห้อง ${roomNumber} หลังออกแบบ`} />
        <img className="compare-before" src={before} alt={`ห้อง ${roomNumber} ก่อนตกแต่ง`} />
        <span className="compare-label is-before">BEFORE</span>
        <span className="compare-label is-after">AFTER · CONCEPT</span>
        <div className="compare-divider" aria-hidden="true"><span>‹ ›</span></div>
        <input type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label={`เปรียบเทียบห้อง ${roomNumber}`} />
      </div>
    </article>
  )
}

export default function ResultPage() {
  const { id } = useParams()
  const project = getProject(id)
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const urls = []
    getProjectImages(id).then((files) => {
      if (cancelled) return
      setImages(files.map((file, index) => {
        const url = URL.createObjectURL(file); urls.push(url)
        return { id: `${file.name}-${index}`, url }
      }))
    }).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true; urls.forEach(URL.revokeObjectURL) }
  }, [id])

  if (!project) return <main className="generate-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  return (
    <div className="generate-shell result-shell">
      <header className="generate-topbar"><Link to={`/project/${id}/generate`}>← กลับไป Generate</Link><span>ROOMLY AI · RESULT</span><Link to="/home">บันทึกร่างและออก</Link></header>
      <main className="generate-content">
        <header className="generate-heading result-heading"><div><p>03 · RESULT</p><h1>แบบห้องของ {project.name}</h1><span>ตรวจดูทุกห้องและเปรียบเทียบกับภาพต้นฉบับก่อนตัดสินใจ</span></div><span className="generate-phase is-done">พร้อมตรวจสอบ</span></header>
        {loading ? <div className="result-state">กำลังโหลดผลลัพธ์...</div> : images.length ? (
          <section className="generate-comparisons"><div className="generate-comparisons-heading"><div><span>DESIGN CONCEPTS</span><h2>ผลลัพธ์ Before / After</h2></div><p>{images.length} ห้อง · {project.style}</p></div><div className="generate-comparison-list">{images.map((image, index) => <CompareCard before={image.url} roomNumber={index + 1} key={image.id} />)}</div></section>
        ) : <div className="result-state"><strong>ไม่พบภาพต้นฉบับ</strong><p>กลับไปเพิ่มภาพห้องเพื่อสร้างผลลัพธ์ใหม่</p><Link to={`/create-project/${id}`}>เพิ่มภาพห้อง</Link></div>}
        <footer className="generate-footer"><div><span>งบประมาณที่ตั้งไว้</span><strong>฿{new Intl.NumberFormat('th-TH').format(project.budget)}</strong></div><Link className="generate-primary" to={`/project/${id}/decisions`}>ยืนยันแบบและตัดสินใจเฟอร์นิเจอร์ →</Link></footer>
        <p className="generate-demo-note">ภาพหลังตกแต่งเป็น Concept สำหรับต้นแบบ ระบบจริงต้องเชื่อมต่อโมเดลสร้างภาพผ่าน Backend</p>
      </main>
    </div>
  )
}
