import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProject, getRoomDesigns, updateProject, withWorkflowData } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import { api, ApiError } from '../../lib/api'
import { planProducts, toGenerateProducts, toPlannedRecord } from '../../lib/productPlan'
import '../Generate/GeneratePage.css'
import './ResultPage.css'

function CompareCard({ before, after, roomNumber, isRegenerating, canRegenerate, onRegenerate }) {
  const [position, setPosition] = useState(50)
  return (
    <article className="compare-card">
      <div className="compare-card-heading">
        <div><span>ROOM {String(roomNumber).padStart(2, '0')}</span><strong>เปรียบเทียบก่อนและหลังตกแต่ง</strong></div>
        <div className="compare-card-actions">
          <small>ลากตัวเลื่อนเพื่อเปรียบเทียบ</small>
          <button
            className="compare-regenerate-btn"
            type="button"
            disabled={isRegenerating || !canRegenerate}
            onClick={onRegenerate}
          >
            {isRegenerating ? 'กำลังสร้างแบบใหม่...' : 'สร้างแบบใหม่'}
          </button>
        </div>
      </div>
      {after ? (
        <div className="compare-frame" style={{ '--compare-position': `${position}%` }}>
          <img className="compare-after" src={after} alt={`ห้อง ${roomNumber} หลังออกแบบ`} />
          <img className="compare-before" src={before} alt={`ห้อง ${roomNumber} ก่อนตกแต่ง`} />
          <span className="compare-label is-before">BEFORE</span>
          <span className="compare-label is-after">AFTER</span>
          <div className="compare-divider" aria-hidden="true"><span>‹ ›</span></div>
          <input type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label={`เปรียบเทียบห้อง ${roomNumber}`} />
        </div>
      ) : (
        <div className="result-missing-design"><img src={before} alt={`ภาพต้นฉบับห้อง ${roomNumber}`} /><div><strong>ภาพนี้ยังไม่มีผลลัพธ์</strong><p>สร้างแบบเฉพาะภาพนี้เพื่อให้ครบทุกห้อง</p></div></div>
      )}
    </article>
  )
}

export default function ResultPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [regeneratingIndex, setRegeneratingIndex] = useState(null)
  const [regenerateError, setRegenerateError] = useState('')

  useEffect(() => {
    let cancelled = false
    getProject(id).then((loaded) => !cancelled && setProject(loaded))
    getProjectImages(id).then((loaded) => {
      if (!cancelled) setImages(loaded)
    }).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [id])

  if (loading) return <main className="generate-missing"><h1>กำลังโหลด...</h1></main>
  if (!project) return <main className="generate-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  const roomDesigns = getRoomDesigns(project, images)
  const completedRooms = roomDesigns.filter((room) => room.generatedImageUrl).length
  const hasResult = completedRooms > 0
  const hasAllResults = roomDesigns.length > 0 && completedRooms === roomDesigns.length

  async function handleRegenerate(room, index) {
    setRegeneratingIndex(index)
    setRegenerateError('')
    try {
      const query = new URLSearchParams({ style: project.style, budget: String(project.budget) })
      if (project.aiInstructions) query.set('ai_instructions', project.aiInstructions)
      if (room.sourceImageUrl) query.set('source_image_url', room.sourceImageUrl)
      project.requirements?.forEach((requirement) => query.append('requirements', requirement))
      const plan = planProducts({ style: project.style, budget: project.budget, roomType: project.roomType })
      const result = await api.post(`/projects/${project.id}/generate?${query}`, { products: toGenerateProducts(plan) })
      const currentResults = roomDesigns.filter((item) => item.generatedImageUrl)
      const nextResults = [
        ...currentResults.filter((item) => item.sourceImageId !== room.sourceImageId),
        { ...room, generatedImageUrl: result.image_url },
      ]
      const orderedResults = roomDesigns
        .map((item) => nextResults.find((resultItem) => resultItem.sourceImageId === item.sourceImageId))
        .filter(Boolean)
      const updated = await updateProject(project.id, {
        generatedImageUrl: orderedResults[0]?.generatedImageUrl ?? result.image_url,
        decisions: withWorkflowData({}, { generatedImages: orderedResults, detectedObjects: [], plannedProducts: toPlannedRecord(plan) }),
        productSelections: {},
        estimatedTotal: null,
        stage: 'result',
        status: 'in-progress',
        progress: 50,
      })
      setProject(updated)
    } catch (err) {
      setRegenerateError(err instanceof ApiError ? err.message : 'สร้างแบบใหม่ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setRegeneratingIndex(null)
    }
  }

  return (
    <div className="generate-shell result-shell">
      <header className="generate-topbar"><Link to={`/project/${id}/generate`}>← กลับไป Generate</Link><span>ROOMLY AI · RESULT</span><Link to="/home">บันทึกร่างและออก</Link></header>
      <main className="generate-content">
        <header className="generate-heading result-heading">
          <div><p>03 · RESULT</p><h1>แบบห้องของ {project.name}</h1><span>ตรวจดูทุกห้องและเปรียบเทียบกับภาพต้นฉบับก่อนตัดสินใจ</span></div>
          <span className="generate-phase is-done">พร้อมตรวจสอบ</span>
        </header>
        {regenerateError ? <p className="generate-error" role="alert">{regenerateError}</p> : null}
        {loading ? <div className="result-state">กำลังโหลดผลลัพธ์...</div> : roomDesigns.length ? (
          <section className="generate-comparisons"><div className="generate-comparisons-heading"><div><span>DESIGN CONCEPTS</span><h2>ผลลัพธ์ Before / After</h2></div><p>{completedRooms}/{roomDesigns.length} ห้อง · {project.style}</p></div>{!hasAllResults ? <p className="result-incomplete" role="status">ยังสร้างผลลัพธ์ไม่ครบทุกภาพ กด “สร้างแบบใหม่” ในภาพที่ยังขาดก่อนยืนยัน</p> : null}<div className="generate-comparison-list">{roomDesigns.map((room, index) => (
            <CompareCard
              before={room.sourceImageUrl}
              after={room.generatedImageUrl}
              roomNumber={index + 1}
              key={room.sourceImageId}
              isRegenerating={regeneratingIndex === index}
              canRegenerate={regeneratingIndex === null}
              onRegenerate={() => handleRegenerate(room, index)}
            />
          ))}</div></section>
        ) : <div className="result-state"><strong>ยังไม่มีผลลัพธ์</strong><p>กลับไปหน้า Generate เพื่อให้ AI สร้างแบบห้องก่อน</p><Link to={`/project/${id}/generate`}>ไปที่ AI Generate</Link></div>}
        <footer className="generate-footer"><div><span>งบประมาณที่ตั้งไว้</span><strong>฿{new Intl.NumberFormat('th-TH').format(project.budget)}</strong></div>{hasAllResults && hasResult ? <Link className="generate-primary" to={`/project/${id}/decisions`}>ยืนยันแบบและตัดสินใจเฟอร์นิเจอร์ →</Link> : <button className="generate-primary" type="button" disabled>สร้างผลลัพธ์ให้ครบก่อน</button>}</footer>
        <p className="generate-demo-note">ภาพหลังออกแบบสร้างโดย AI (gpt-image-1) จากภาพห้องจริงที่อัปโหลด</p>
      </main>
    </div>
  )
}
