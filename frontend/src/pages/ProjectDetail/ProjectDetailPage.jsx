import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getObjectDecisions, getProject, removeProject, updateProject } from '../../lib/projects'
import { deleteProjectImages, getProjectImages } from '../../lib/imageStore'
import './ProjectDetailPage.css'

const ROOM_TYPE_LABELS = {
  bedroom: 'ห้องนอน',
  'living-room': 'ห้องนั่งเล่น',
  studio: 'ห้องสตูดิโอ',
  workspace: 'ห้องทำงาน',
}

const STYLE_LABELS = {
  minimal: 'Minimal', japandi: 'Japandi', modern: 'Modern', scandinavian: 'Scandinavian',
  contemporary: 'Contemporary', luxury: 'Luxury', industrial: 'Industrial', 'mid-century': 'Mid-century',
  classic: 'Classic', bohemian: 'Bohemian', coastal: 'Coastal', 'wabi-sabi': 'Wabi-sabi',
}

// What each stage means for the person opening the project, and where "continue" goes.
function nextStepFor(project) {
  const base = `/project/${project.id}`
  switch (project.stage ?? 'room-input') {
    case 'saved':
      return { label: 'ดูสรุปโปรเจกต์', hint: 'ดูแบบห้อง ผลการตัดสินใจ และรายการสินค้าจริงที่เลือกไว้', path: `${base}/summary` }
    case 'product-matching':
      return { label: 'เลือกสินค้าต่อ', hint: 'จับคู่แบบ AI กับสินค้าจริงให้ครบทุกชิ้นภายในงบ', path: `${base}/products` }
    case 'summary':
      return { label: 'ดูสรุปผลต่อ', hint: 'ตรวจผล Keep / Replace / Remove ก่อนไปเลือกสินค้า', path: `${base}/summary` }
    case 'object-decision':
      return { label: 'ตัดสินใจเฟอร์นิเจอร์ต่อ', hint: 'เลือกว่าจะเก็บ เปลี่ยน หรือนำเฟอร์นิเจอร์แต่ละชิ้นออก', path: `${base}/decisions` }
    case 'result':
      return { label: 'ดูผลลัพธ์ AI', hint: 'เปรียบเทียบก่อน/หลังตกแต่ง แล้วไปตัดสินใจรายชิ้น', path: `${base}/result` }
    case 'ai-generate':
      return { label: 'กลับไปหน้า Generate', hint: 'AI กำลังหรือกำลังจะสร้างแบบห้องของคุณ', path: `${base}/generate` }
    default:
      return { label: 'เริ่ม AI Generate', hint: 'ข้อมูลห้องพร้อมแล้ว ให้ AI ออกแบบห้องจากภาพของคุณ', path: `${base}/generate` }
  }
}

const money = new Intl.NumberFormat('th-TH')

function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [originals, setOriginals] = useState([])
  const [angle, setAngle] = useState(0)
  const [showBefore, setShowBefore] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [aiInstructions, setAiInstructions] = useState('')
  const [instructionStatus, setInstructionStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    getProject(id).then((loaded) => {
      if (cancelled) return
      setProject(loaded)
      setAiInstructions(loaded?.aiInstructions ?? loaded?.notes ?? '')
    }).finally(() => !cancelled && setIsLoading(false))
    getProjectImages(id).then((images) => !cancelled && setOriginals(images)).catch(() => {})
    return () => { cancelled = true }
  }, [id])

  if (isLoading) {
    return <div className="detail-shell"><main className="detail-content"><p>กำลังโหลดโปรเจกต์...</p></main></div>
  }

  if (!project) {
    return (
      <div className="detail-shell">
        <main className="detail-content">
          <div className="detail-notfound">
            <strong>ไม่พบโปรเจกต์นี้</strong>
            <p>โปรเจกต์อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง</p>
            <Link className="detail-primary-button" to="/home">กลับไปที่คลัง</Link>
          </div>
        </main>
      </div>
    )
  }

  const stage = project.stage ?? 'room-input'
  const isSaved = stage === 'saved'
  const next = nextStepFor(project)

  // One slide per angle: the AI result paired with its original photo, or just the originals before generation.
  const designs = (project.generatedImages ?? []).filter((room) => room.generatedImageUrl)
  const slides = designs.length
    ? designs.map((room, index) => ({
      key: room.sourceImageId ?? index,
      after: room.generatedImageUrl,
      before: room.sourceImageUrl ?? originals.find((image) => image.id === room.sourceImageId)?.url,
    }))
    : project.generatedImageUrl
      ? [{ key: 'legacy', after: project.generatedImageUrl, before: originals[0]?.url }]
      : originals.map((image) => ({ key: image.id, after: null, before: image.url }))
  const slideIndex = Math.min(angle, Math.max(slides.length - 1, 0))
  const slide = slides[slideIndex]
  const hasResult = Boolean(slide?.after)
  const shownImage = hasResult && !showBefore ? slide.after : slide?.before
  const shownLabel = !hasResult ? 'ภาพห้องเปล่า' : showBefore ? 'BEFORE' : 'AFTER'

  const decisions = getObjectDecisions(project.decisions)
  const objects = project.detectedObjects ?? []
  const decisionOf = (item) => (item.removedFromImage ? 'remove' : (decisions[item.id] ?? 'keep'))
  const counts = objects.reduce((result, item) => {
    result[decisionOf(item)] += 1
    return result
  }, { keep: 0, replace: 0, remove: 0 })
  const picked = Object.entries(project.productSelections ?? {}).filter(([, selection]) => !selection.skipped)
  const pickedTotal = picked.reduce((sum, [, selection]) => sum + (selection.price ?? 0), 0)
  const spent = isSaved ? pickedTotal : project.estimatedTotal
  const budgetShare = project.budget && spent ? Math.min(100, (spent / project.budget) * 100) : 0
  const size = project.dimensions?.width && project.dimensions?.length
    ? `${project.dimensions.width} × ${project.dimensions.length}${project.dimensions.height ? ` × ${project.dimensions.height}` : ''} ม.`
    : null

  async function handleDelete() {
    if (isDeleting) return
    setIsDeleting(true)
    setDeleteError('')
    try {
      // The project row goes first: leftover files are harmless, a leftover row pointing at deleted files is not.
      await removeProject(project.id)
      await deleteProjectImages(project.id).catch(() => {})
      navigate('/home')
    } catch (error) {
      setDeleteError(error.message || 'ลบโปรเจกต์ไม่สำเร็จ กรุณาลองใหม่')
      setIsDeleting(false)
    }
  }

  async function saveAiInstructions() {
    try {
      await updateProject(project.id, { aiInstructions: aiInstructions.trim() })
      setInstructionStatus('บันทึกแล้ว')
    } catch (error) {
      setInstructionStatus(error.message || 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <div className="detail-shell">
      <header className="detail-topbar">
        <Link className="detail-back" to="/home">← กลับไปที่คลัง</Link>
        <div className="detail-actions">
          <Link className="detail-edit-button" to={`/create-project/${project.id}`}>แก้ไขโปรเจกต์</Link>
          <button className="detail-delete-button" type="button" onClick={() => setConfirmingDelete(true)}>ลบโปรเจกต์</button>
        </div>
      </header>

      <main className="detail-content">
        <header className="detail-heading">
          <span className={`detail-status ${isSaved ? 'is-done' : ''}`}>{isSaved ? '✓ บันทึกครบแล้ว' : 'ฉบับร่าง · ยังออกแบบไม่เสร็จ'}</span>
          <h1>{project.name}</h1>
          <p>{[ROOM_TYPE_LABELS[project.roomType] ?? project.roomType, STYLE_LABELS[project.style] ?? project.style, size].filter(Boolean).join(' · ')}</p>
        </header>

        <div className="detail-layout">
          <section className="detail-stage" aria-label="ภาพห้อง">
            <figure className="detail-viewer">
              {shownImage ? <img src={shownImage} alt={`${shownLabel} มุมที่ ${slideIndex + 1}`} /> : <div className="detail-viewer-empty">ยังไม่มีภาพ</div>}
              {shownImage ? <figcaption>{shownLabel}{slides.length > 1 ? ` · มุม ${slideIndex + 1}/${slides.length}` : ''}</figcaption> : null}
            </figure>
            {hasResult && slide.before ? (
              <div className="detail-toggle" role="tablist" aria-label="เลือกภาพ">
                <button type="button" role="tab" aria-selected={!showBefore} className={!showBefore ? 'is-active' : ''} onClick={() => setShowBefore(false)}>หลังตกแต่ง</button>
                <button type="button" role="tab" aria-selected={showBefore} className={showBefore ? 'is-active' : ''} onClick={() => setShowBefore(true)}>ก่อนตกแต่ง</button>
              </div>
            ) : null}
            {slides.length > 1 ? (
              <div className="detail-thumbs" role="tablist" aria-label="เลือกมุมภาพ">
                {slides.map((item, index) => (
                  <button type="button" role="tab" aria-selected={index === slideIndex} className={index === slideIndex ? 'is-active' : ''} onClick={() => setAngle(index)} key={item.key}>
                    <img src={item.after ?? item.before} alt="" />
                    <span>มุม {index + 1}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <aside className="detail-side">
            {isSaved ? null : (
              <div className="detail-next">
                <p>โปรเจกต์นี้ยังออกแบบไม่เสร็จ</p>
                <Link className="detail-primary-button" to={next.path}>ทำโปรเจกต์ต่อ <span aria-hidden="true">→</span></Link>
              </div>
            )}

            <div className="detail-budget">
              <span>{isSaved ? 'ยอดสินค้าจริงรวม' : spent ? 'ยอดประมาณการ' : 'งบประมาณสูงสุด'}</span>
              <strong>฿{money.format(spent || project.budget)}</strong>
              {spent ? (
                <>
                  <div className="detail-meter" role="img" aria-label={`ใช้ไป ${Math.round(budgetShare)}% ของงบ`}><i style={{ width: `${budgetShare}%` }} /></div>
                  <small>จากงบสูงสุด ฿{money.format(project.budget)}</small>
                </>
              ) : null}
            </div>

            <dl className="detail-facts">
              <div><dt>ภาพห้องเปล่า</dt><dd>{originals.length || slides.length} มุม</dd></div>
              {objects.length ? <div><dt>เฟอร์นิเจอร์ที่ตรวจพบ</dt><dd>{objects.length} ชิ้น</dd></div> : null}
              {objects.length ? <div><dt>Keep · Replace · Remove</dt><dd>{counts.keep} · {counts.replace} · {counts.remove}</dd></div> : null}
              {isSaved ? <div><dt>สินค้าที่เลือก</dt><dd>{picked.length} ชิ้น</dd></div> : null}
            </dl>
          </aside>
        </div>

        {isSaved && picked.length ? (
          <section className="detail-products" aria-label="สินค้าที่เลือก">
            <div className="detail-section-head"><span>สินค้าจริงที่เลือก</span><strong>฿{money.format(pickedTotal)}</strong></div>
            <ul>
              {picked.map(([objectId, selection]) => (
                <li key={objectId}>
                  {selection.imageUrl ? <img src={selection.imageUrl} alt="" /> : <div className="detail-product-ph" />}
                  <div><small>{selection.objectName}</small><strong>{selection.name}</strong><em>{selection.store}</em></div>
                  <b>฿{money.format(selection.price ?? 0)}</b>
                  {selection.url ? <a href={selection.url} target="_blank" rel="noreferrer">ดู ↗</a> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="detail-ai-card" aria-label="คำอธิบายถึง AI">
          <div className="detail-ai-heading">
            <div><span>คำอธิบายเพิ่มเติมสำหรับ AI</span><small>AI DESIGN BRIEF</small></div>
            <em>{aiInstructions.length}/600</em>
          </div>
          <textarea
            value={aiInstructions}
            maxLength="600"
            rows="4"
            onChange={(event) => { setAiInstructions(event.target.value); setInstructionStatus('') }}
            placeholder="เช่น อยากให้ห้องดูโปร่ง ใช้โทนไม้สว่าง เก็บโต๊ะเดิมไว้ เพิ่มมุมอ่านหนังสือ และหลีกเลี่ยงเฟอร์นิเจอร์สีดำ"
            aria-label="คำอธิบายเพิ่มเติมสำหรับ AI"
          />
          <div className="detail-ai-footer">
            <p>{isSaved ? 'คำอธิบายใหม่จะมีผลเมื่อสร้างแบบใหม่ ภาพที่ออกแบบแล้วจะไม่เปลี่ยน' : 'ระบุของที่อยากเก็บ สีที่ชอบ ฟังก์ชันที่ต้องมี หรือสิ่งที่ไม่ต้องการ'}</p>
            <button type="button" onClick={saveAiInstructions}>{instructionStatus || 'บันทึกคำอธิบาย'}</button>
          </div>
        </section>
      </main>

      {confirmingDelete ? (
        <div className="detail-modal-backdrop" onClick={() => !isDeleting && setConfirmingDelete(false)}>
          <div className="detail-modal" onClick={(event) => event.stopPropagation()}>
            <strong>ลบโปรเจกต์นี้?</strong>
            <p>“{project.name}” จะถูกลบออกจากคลังอย่างถาวร รวมถึงภาพห้องและภาพที่ AI สร้าง</p>
            {deleteError ? <p className="detail-delete-error" role="alert">{deleteError}</p> : null}
            <div className="detail-modal-actions">
              <button type="button" disabled={isDeleting} onClick={() => setConfirmingDelete(false)}>ยกเลิก</button>
              <button type="button" className="is-danger" disabled={isDeleting} onClick={handleDelete}>{isDeleting ? 'กำลังลบ...' : 'ลบโปรเจกต์'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ProjectDetailPage
