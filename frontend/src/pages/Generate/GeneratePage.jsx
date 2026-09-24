import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProject, getRoomDesigns, updateProject, withWorkflowData } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import { api, ApiError } from '../../lib/api'
import { planProducts, toGenerateProducts, toPlannedRecord } from '../../lib/productPlan'
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
        <span className="compare-label is-after">AFTER</span>
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
  const [project, setProject] = useState(null)
  const [isLoadingProject, setIsLoadingProject] = useState(true)
  const [images, setImages] = useState([])
  const [isLoadingImages, setIsLoadingImages] = useState(true)
  const [phase, setPhase] = useState('ready')
  const [generateError, setGenerateError] = useState('')
  const [generatedCount, setGeneratedCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    getProject(id).then((loaded) => {
      if (cancelled) return
      setProject(loaded)
      setPhase(COMPLETED_GENERATION_STAGES.has(loaded?.stage) ? 'done' : 'ready')
    }).finally(() => !cancelled && setIsLoadingProject(false))

    getProjectImages(id)
      .then((loaded) => {
        if (!cancelled) setImages(loaded)
      })
      .catch(() => setImages([]))
      .finally(() => {
        if (!cancelled) setIsLoadingImages(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (isLoadingProject) {
    return <main className="generate-missing"><h1>กำลังโหลดโปรเจกต์...</h1></main>
  }

  if (!project) {
    return (
      <main className="generate-missing">
        <h1>ไม่พบโปรเจกต์</h1>
        <Link to="/home">กลับไปที่คลัง</Link>
      </main>
    )
  }

  async function startGeneration() {
    setPhase('generating')
    setGenerateError('')
    setGeneratedCount(0)
    try {
      const plan = planProducts({ style: project.style, budget: project.budget, roomType: project.roomType })
      const plannedProducts = toPlannedRecord(plan)
      let generatedImages = []
      let updatedProject = await updateProject(project.id, {
        generatedImageUrl: null,
        decisions: withWorkflowData({}, { generatedImages, detectedObjects: [], plannedProducts }),
        productSelections: {},
        estimatedTotal: null,
        stage: 'ai-generate',
        status: 'in-progress',
        progress: 33,
      })

      for (const image of images) {
        const query = new URLSearchParams({ style: project.style, budget: String(project.budget) })
        if (project.aiInstructions) query.set('ai_instructions', project.aiInstructions)
        query.set('source_image_url', image.url)
        project.requirements?.forEach((requirement) => query.append('requirements', requirement))
        const result = await api.post(`/projects/${project.id}/generate?${query}`, { products: toGenerateProducts(plan) })
        generatedImages = [...generatedImages, {
          sourceImageId: image.id,
          sourceImageUrl: image.url,
          generatedImageUrl: result.image_url,
        }]
        updatedProject = await updateProject(project.id, {
          generatedImageUrl: generatedImages[0].generatedImageUrl,
          decisions: withWorkflowData({}, { generatedImages, detectedObjects: [], plannedProducts }),
        })
        setProject(updatedProject)
        setGeneratedCount(generatedImages.length)
      }

      await updateProject(project.id, {
        stage: 'result',
        status: 'in-progress',
        progress: 50,
      })
      navigate(`/project/${project.id}/result`)
    } catch (err) {
      setPhase('ready')
      setGenerateError(err instanceof ApiError ? err.message : 'สร้างแบบไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const needsReupload = !isLoadingImages && images.length === 0
  const roomDesigns = getRoomDesigns(project, images)
  const hasAllResults = roomDesigns.length > 0 && roomDesigns.every((room) => room.generatedImageUrl)

  return (
    <div className="generate-shell">
      <header className="generate-topbar">
        <Link to={`/project/${project.id}`}>← กลับไปที่โปรเจกต์</Link>
        <span>ROOMLY AI · GENERATE</span>
        <Link to="/home">คลังโปรเจกต์</Link>
      </header>

      <main className="generate-content">
        <header className="generate-heading">
          <div>
            <p>02 · AI GENERATE</p>
            <h1>{project.name}</h1>
            <span className="generate-heading-note">เปลี่ยนภาพห้องจริงให้เป็นแนวทางตกแต่งที่พร้อมนำไปใช้</span>
          </div>
          <span className={`generate-phase is-${phase}`}>{phase === 'done' ? 'สร้างแบบแล้ว' : phase === 'generating' ? 'กำลังสร้างแบบ' : 'พร้อมสร้างแบบ'}</span>
        </header>

        {project.aiInstructions ? (
          <section className="generate-ai-brief" aria-label="คำอธิบายเพิ่มเติมสำหรับ AI">
            <div><span>AI DESIGN BRIEF</span><strong>สิ่งที่ต้องคำนึงถึงในการออกแบบ</strong></div>
            <p>“{project.aiInstructions}”</p>
            <Link to={`/project/${project.id}`}>แก้ไข</Link>
          </section>
        ) : null}

        {phase === 'done' && hasAllResults ? (
          <section className="generate-comparisons" aria-label="ภาพเปรียบเทียบก่อนและหลัง">
            <div className="generate-comparisons-heading">
              <div><span>GENERATED RESULTS</span><h2>ก่อนและหลังในแต่ละห้อง</h2></div>
              <p>{images.length} ผลลัพธ์ · สไตล์ {project.style}</p>
            </div>
            <div className="generate-comparison-list">
              {roomDesigns.map((room, index) => (
                <BeforeAfterCompare before={room.sourceImageUrl} after={room.generatedImageUrl} roomNumber={index + 1} key={room.sourceImageId} />
              ))}
            </div>
          </section>
        ) : (
          <section className="generate-workspace">
            <div className="generate-room-panel">
              <div className="generate-panel-heading"><div><small>ORIGINAL SPACE</small><span>ภาพห้องต้นฉบับ</span></div><em>{images.length} ห้อง</em></div>
              {isLoadingImages ? (
                <div className="generate-placeholder">กำลังโหลดภาพห้อง...</div>
              ) : images.length ? (
                <div className={`generate-image-grid ${images.length === 1 ? 'is-single' : ''}`.trim()}>
                  {images.map((image, index) => <img src={image.url} alt={`ห้องเปล่า ${index + 1}`} key={image.id} />)}
                </div>
              ) : (
                <div className="generate-placeholder"><strong>ไม่พบไฟล์ภาพต้นฉบับ</strong><p>โปรเจกต์นี้สร้างก่อนระบบจัดเก็บภาพ กรุณาอัปโหลดภาพอีกครั้ง</p><Link to={`/create-project/${project.id}`}>กลับไปอัปโหลดภาพ</Link></div>
              )}
            </div>

            <div className={`generate-result-panel is-${phase}`}>
              <div className="generate-panel-heading"><div><small>AI CONCEPT</small><span>ผลลัพธ์การออกแบบ</span></div><em>สไตล์ {project.style}</em></div>
              {phase === 'generating' ? (
                <div className="generate-processing"><span /><strong>AI กำลังวิเคราะห์พื้นที่</strong><p>สร้างแล้ว {generatedCount} จาก {images.length} ภาพ · ระบบสร้างและบันทึกแยกทีละภาพ</p></div>
              ) : (
                <div className="generate-placeholder generate-ready-state">
                  <span className="generate-ready-orb" aria-hidden="true"><i /><i /></span>
                  <small>READY TO TRANSFORM</small>
                  <strong>พร้อมสร้างแบบห้อง</strong>
                  <p>AI จะรักษาโครงสร้างเดิม แล้วออกแบบแสง สี และเฟอร์นิเจอร์ใหม่ตามโจทย์ของคุณ</p>
                  <div className="generate-ready-steps" aria-hidden="true"><span>วิเคราะห์พื้นที่</span><span>สร้างบรรยากาศ</span><span>จับคู่สไตล์</span></div>
                </div>
              )}
            </div>
          </section>
        )}

        {generateError ? <p className="generate-error" role="alert">{generateError}</p> : null}

        <footer className="generate-footer">
          <div className="generate-footer-summary">
            <div><span>DESIGN BUDGET</span><strong>฿{new Intl.NumberFormat('th-TH').format(project.budget)}</strong></div>
            <div><span>SELECTED STYLE</span><strong>{project.style}</strong></div>
          </div>
          <div className="generate-footer-actions">
            {phase !== 'generating' ? <Link className="generate-skip" to={`/project/${project.id}/decisions`}>ข้ามไปหน้า Selection</Link> : null}
          {phase === 'done' && hasAllResults ? (
            <Link className="generate-primary" to={`/project/${project.id}/result`}>ดูผลลัพธ์ที่สร้างแล้ว →</Link>
          ) : (
            <button className="generate-primary" type="button" disabled={needsReupload || isLoadingImages || phase === 'generating'} onClick={startGeneration}>{phase === 'generating' ? 'กำลังสร้างแบบ...' : phase === 'done' ? <>สร้างผลลัพธ์ให้ครบ <span aria-hidden="true">→</span></> : <>เริ่ม AI Generate <span aria-hidden="true">→</span></>}</button>
          )}
          </div>
        </footer>

        <p className="generate-demo-note">ภาพหลังออกแบบสร้างโดย AI (gpt-image-1) จากภาพห้องจริงที่อัปโหลด</p>
      </main>
    </div>
  )
}

export default GeneratePage
