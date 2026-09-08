import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProject, updateProject } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import demoResult from '../../assets/auth-interior.png'
import './GeneratePage.css'

const COMPLETED_GENERATION_STAGES = new Set(['result', 'object-decision', 'product-matching', 'saved'])

function BeforeAfterCompare({ before, after, roomNumber }) {
  const [position, setPosition] = useState(50)

  return (
    <article className="compare-card">
      <div className="compare-card-heading">
        <div><span>ROOM {String(roomNumber).padStart(2, '0')}</span><strong>เปรียบเทียบก่อนและหลังตกแต่ง</strong></div>
        <small>ลากตัวเลื่อนเพื่อเปรียบเทียบ</small>
      </div>
      <div className="compare-frame" style={{ '--compare-position': `${position}%` }}>
        <img className="compare-after" src={after} alt={`ห้อง ${roomNumber} หลัง AI ออกแบบ`} />
        <img className="compare-before" src={before} alt={`ห้อง ${roomNumber} ก่อนตกแต่ง`} />
        <span className="compare-label is-before">BEFORE</span>
        <span className="compare-label is-after">AFTER · DEMO</span>
        <div className="compare-divider" aria-hidden="true"><span>‹ ›</span></div>
        <input
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label={`เปรียบเทียบภาพก่อนและหลังของห้อง ${roomNumber}`}
        />
      </div>
    </article>
  )
}

function GeneratePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = getProject(id)
  const [images, setImages] = useState([])
  const [isLoadingImages, setIsLoadingImages] = useState(true)
  const [phase, setPhase] = useState(COMPLETED_GENERATION_STAGES.has(project?.stage) ? 'done' : 'ready')
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const createdUrls = []

    getProjectImages(id)
      .then((files) => {
        const nextImages = files.map((file, index) => {
          const url = URL.createObjectURL(file)
          createdUrls.push(url)
          return { id: `${file.name}-${index}`, name: file.name, url }
        })
        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url))
          return
        }
        setImages(nextImages)
      })
      .catch(() => setImages([]))
      .finally(() => {
        if (!cancelled) setIsLoadingImages(false)
      })

    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [id])

  if (!project) {
    return (
      <main className="generate-missing">
        <h1>ไม่พบโปรเจกต์</h1>
        <Link to="/home">กลับไปที่คลัง</Link>
      </main>
    )
  }

  function startDemoGeneration() {
    setPhase('generating')
    updateProject(project.id, { stage: 'ai-generate', status: 'in-progress', progress: 33 })
    timerRef.current = window.setTimeout(() => {
      updateProject(project.id, { stage: 'result', status: 'in-progress', progress: 50 })
      navigate(`/project/${project.id}/result`)
    }, 2200)
  }

  const needsReupload = !isLoadingImages && images.length === 0

  return (
    <div className="generate-shell">
      <header className="generate-topbar">
        <Link to={`/project/${project.id}`}>← กลับไปที่โปรเจกต์</Link>
        <span>ROOMLY AI · GENERATE</span>
        <Link to="/home">คลังโปรเจกต์</Link>
      </header>

      <main className="generate-content">
        <header className="generate-heading">
          <div><p>02 · AI GENERATE</p><h1>{project.name}</h1></div>
          <span className={`generate-phase is-${phase}`}>{phase === 'done' ? 'สร้างแบบแล้ว' : phase === 'generating' ? 'กำลังสร้างแบบ' : 'พร้อมสร้างแบบ'}</span>
        </header>

        {project.aiInstructions ? (
          <section className="generate-ai-brief" aria-label="คำอธิบายเพิ่มเติมสำหรับ AI">
            <div><span>AI DESIGN BRIEF</span><strong>สิ่งที่ต้องคำนึงถึงในการออกแบบ</strong></div>
            <p>{project.aiInstructions}</p>
            <Link to={`/project/${project.id}`}>แก้ไข</Link>
          </section>
        ) : null}

        {phase === 'done' && images.length ? (
          <section className="generate-comparisons" aria-label="ภาพเปรียบเทียบก่อนและหลัง">
            <div className="generate-comparisons-heading">
              <div><span>GENERATED RESULTS</span><h2>ก่อนและหลังในแต่ละห้อง</h2></div>
              <p>{images.length} ผลลัพธ์ · สไตล์ {project.style}</p>
            </div>
            <div className="generate-comparison-list">
              {images.map((image, index) => (
                <BeforeAfterCompare before={image.url} after={demoResult} roomNumber={index + 1} key={image.id} />
              ))}
            </div>
          </section>
        ) : (
          <section className="generate-workspace">
            <div className="generate-room-panel">
              <div className="generate-panel-heading"><span>ภาพห้องเปล่า</span><small>{images.length || project.imageCount || 0} ห้อง</small></div>
              {isLoadingImages ? (
                <div className="generate-placeholder">กำลังโหลดภาพห้อง...</div>
              ) : images.length ? (
                <div className="generate-image-grid">
                  {images.map((image, index) => <img src={image.url} alt={`ห้องเปล่า ${index + 1}`} key={image.id} />)}
                </div>
              ) : (
                <div className="generate-placeholder"><strong>ไม่พบไฟล์ภาพต้นฉบับ</strong><p>โปรเจกต์นี้สร้างก่อนระบบจัดเก็บภาพ กรุณาอัปโหลดภาพอีกครั้ง</p><Link to={`/create-project/${project.id}`}>กลับไปอัปโหลดภาพ</Link></div>
              )}
            </div>

            <div className={`generate-result-panel is-${phase}`}>
              <div className="generate-panel-heading"><span>ผลลัพธ์การออกแบบ</span><small>สไตล์ {project.style}</small></div>
              {phase === 'generating' ? (
                <div className="generate-processing"><span /><strong>AI กำลังวิเคราะห์พื้นที่</strong><p>กำลังสร้างผลลัพธ์สำหรับภาพที่อัปโหลดทั้งหมด</p></div>
              ) : (
                <div className="generate-placeholder"><strong>พร้อมสร้างแบบห้อง</strong><p>ทุกภาพจะมีผลลัพธ์ Before/After แยกกันและเลื่อนเปรียบเทียบได้</p></div>
              )}
            </div>
          </section>
        )}

        <footer className="generate-footer">
          <div><span>งบประมาณ</span><strong>฿{new Intl.NumberFormat('th-TH').format(project.budget)}</strong></div>
          {phase === 'done' ? (
            <Link className="generate-primary" to={`/project/${project.id}/result`}>ดูผลลัพธ์ที่สร้างแล้ว →</Link>
          ) : (
            <button className="generate-primary" type="button" disabled={needsReupload || isLoadingImages || phase === 'generating'} onClick={startDemoGeneration}>{phase === 'generating' ? 'กำลังสร้างแบบ...' : 'เริ่ม AI Generate'}</button>
          )}
        </footer>

        <p className="generate-demo-note">โหมดสาธิต: หน้านี้จำลองขั้นตอน Generate และใช้ภาพตัวอย่าง ผลลัพธ์จริงต้องเชื่อมต่อโมเดลสร้างภาพผ่าน Backend</p>
      </main>
    </div>
  )
}

export default GeneratePage
