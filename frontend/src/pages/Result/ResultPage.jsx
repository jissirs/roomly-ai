import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getProject, getRoomDesigns, updateProject, withWorkflowData } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import { api, ApiError } from '../../lib/api'
import { appendRoomSize, planProducts, toGenerateProducts, toPlannedRecord } from '../../lib/productPlan'
import { fitFrameStyle, naturalRatio } from '../../lib/imageLayout'
import AngleTabs from '../../components/AngleTabs/AngleTabs'
import '../Generate/GeneratePage.css'
import './ResultPage.css'

function CompareCard({ before, after, roomNumber, isRegenerating, canRegenerate, onRegenerate }) {
  const [position, setPosition] = useState(50)
  const [beforeRatio, setBeforeRatio] = useState(null)
  const [afterRatio, setAfterRatio] = useState(null)
  const afterFit = beforeRatio && afterRatio && Math.abs(afterRatio / beforeRatio - 1) > 0.15 ? 'contain' : 'cover'
  return (
    <article className="compare-card">
      <div className="compare-card-heading">
        <div><span>ANGLE {String(roomNumber).padStart(2, '0')}</span><strong>เปรียบเทียบก่อนและหลังตกแต่ง</strong></div>
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
        <div className="compare-frame" style={{ '--compare-position': `${position}%`, ...fitFrameStyle(beforeRatio ?? afterRatio) }}>
          <img className="compare-after" src={after} style={{ objectFit: afterFit }} onLoad={(event) => setAfterRatio(naturalRatio(event))} alt={`มุม ${roomNumber} หลังออกแบบ`} />
          <img className="compare-before" src={before} onLoad={(event) => setBeforeRatio(naturalRatio(event))} alt={`มุม ${roomNumber} ก่อนตกแต่ง`} />
          <span className="compare-label is-before">BEFORE</span>
          <span className="compare-label is-after">AFTER</span>
          <div className="compare-divider" aria-hidden="true"><span>‹ ›</span></div>
          <input type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label={`เปรียบเทียบมุม ${roomNumber}`} />
        </div>
      ) : (
        <div className="result-missing-design"><img src={before} alt={`ภาพต้นฉบับมุม ${roomNumber}`} /><div><strong>ภาพนี้ยังไม่มีผลลัพธ์</strong><p>สร้างแบบเฉพาะภาพนี้เพื่อให้ครบทุกมุม</p></div></div>
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
  const [activeAngle, setActiveAngle] = useState(0)
  const [regenerateError, setRegenerateError] = useState('')
  const [pendingRegenerate, setPendingRegenerate] = useState(null)

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

  // Regenerating wipes detection, decisions and product picks, so ask first
  // when there is downstream work that would be lost.
  const hasDownstreamWork = Boolean(project.detectedObjects?.length) || Object.keys(project.productSelections ?? {}).length > 0
    || ['object-decision', 'summary', 'product-matching', 'saved'].includes(project.stage)

  function requestRegenerate(room, index) {
    if (hasDownstreamWork) setPendingRegenerate({ room, index })
    else handleRegenerate(room, index)
  }

  async function handleRegenerate(room, index) {
    setRegeneratingIndex(index)
    setRegenerateError('')
    try {
      const query = new URLSearchParams({ style: project.style, budget: String(project.budget) })
      if (project.aiInstructions) query.set('ai_instructions', project.aiInstructions)
      if (room.sourceImageUrl) query.set('source_image_url', room.sourceImageUrl)
      appendRoomSize(query, project.dimensions)
      const primaryDesign = roomDesigns[0]
      if (index > 0 && primaryDesign?.generatedImageUrl) query.set('reference_room_url', primaryDesign.generatedImageUrl)
      project.requirements?.forEach((requirement) => query.append('requirements', requirement))
      const plan = planProducts({ style: project.style, budget: project.budget, roomType: project.roomType, dimensions: project.dimensions })
      const result = await api.post(`/projects/${project.id}/generate?${query}`, { products: toGenerateProducts(plan) })
      const currentResults = roomDesigns.filter((item) => item.generatedImageUrl)
      const nextResults = [
        ...currentResults.filter((item) => item.sourceImageId !== room.sourceImageId),
        { ...room, generatedImageUrl: result.image_url, ...(index > 0 && primaryDesign?.generatedImageUrl ? { syncedWith: primaryDesign.generatedImageUrl } : {}) },
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
      <header className="generate-topbar"><Link to={`/project/${id}/generate`}>← กลับไป Generate</Link><span>ROOMLY AI · RESULT</span><Link to="/home">กลับคลังโปรเจกต์</Link></header>
      <main className="generate-content">
        <header className="generate-heading result-heading">
          <div><p>03 · RESULT</p><h1>แบบห้องของ {project.name}</h1><span>ตรวจดูทุกมุมและเปรียบเทียบกับภาพต้นฉบับก่อนตัดสินใจ</span></div>
          <span className="generate-phase is-done">พร้อมตรวจสอบ</span>
        </header>
        {regenerateError ? <p className="generate-error" role="alert">{regenerateError}</p> : null}
        {loading ? <div className="result-state">กำลังโหลดผลลัพธ์...</div> : roomDesigns.length ? (
          <section className="generate-comparisons"><div className="generate-comparisons-heading"><div><span>DESIGN CONCEPTS</span><h2>ผลลัพธ์ Before / After</h2></div><p>{completedRooms}/{roomDesigns.length} มุม · {project.style}</p></div>{!hasAllResults ? <p className="result-incomplete" role="status">ยังสร้างผลลัพธ์ไม่ครบทุกภาพ กด “สร้างแบบใหม่” ในภาพที่ยังขาดก่อนยืนยัน</p> : null}<AngleTabs activeIndex={activeAngle} onChange={setActiveAngle} tabs={roomDesigns.map((room, index) => ({ key: room.sourceImageId, done: Boolean(room.generatedImageUrl), status: regeneratingIndex === index ? 'กำลังสร้าง...' : room.generatedImageUrl ? 'สร้างแล้ว' : 'ยังไม่สร้าง' }))} /><div className="generate-comparison-list">{roomDesigns.map((room, index) => (
            <div hidden={index !== activeAngle} key={room.sourceImageId}><CompareCard
              before={room.sourceImageUrl}
              after={room.generatedImageUrl}
              roomNumber={index + 1}
              isRegenerating={regeneratingIndex === index}
              canRegenerate={regeneratingIndex === null}
              onRegenerate={() => requestRegenerate(room, index)}
            /></div>
          ))}</div></section>
        ) : <div className="result-state"><strong>ยังไม่มีผลลัพธ์</strong><p>กลับไปหน้า Generate เพื่อให้ AI สร้างแบบห้องก่อน</p><Link to={`/project/${id}/generate`}>ไปที่ AI Generate</Link></div>}
        <footer className="generate-footer result-footer">{hasAllResults && hasResult ? <Link className="generate-primary" to={`/project/${id}/decisions`}>ยืนยันแบบและตัดสินใจเฟอร์นิเจอร์ →</Link> : <button className="generate-primary" type="button" disabled>สร้างผลลัพธ์ให้ครบก่อน</button>}</footer>
        <p className="generate-demo-note">ภาพหลังออกแบบสร้างโดย AI จากภาพห้องจริงที่อัปโหลด{roomDesigns.length > 1 ? ' · มุมที่ 1 เป็นมุมหลัก มุมอื่นสร้างโดยอ้างอิงเฟอร์นิเจอร์จากมุมที่ 1 ถ้าสร้างมุมที่ 1 ใหม่ ควรสร้างมุมอื่นใหม่ตามเพื่อให้ตรงกัน' : ''}</p>
      </main>

      {pendingRegenerate ? (
        <div className="result-modal-backdrop" onClick={() => setPendingRegenerate(null)}>
          <div className="result-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <strong>สร้างมุม {pendingRegenerate.index + 1} ใหม่?</strong>
            <p>การสร้างใหม่จะล้างผลตรวจจับเฟอร์นิเจอร์ ผล Keep/Replace/Remove และสินค้าที่เลือกไว้ของทั้งโปรเจกต์ ต้องทำขั้นตอนตัดสินใจใหม่อีกครั้ง และใช้เครดิต AI</p>
            <div className="result-modal-actions">
              <button type="button" onClick={() => setPendingRegenerate(null)}>ยกเลิก</button>
              <button type="button" className="is-danger" onClick={() => { const target = pendingRegenerate; setPendingRegenerate(null); handleRegenerate(target.room, target.index) }}>สร้างใหม่และล้างผลเดิม</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
