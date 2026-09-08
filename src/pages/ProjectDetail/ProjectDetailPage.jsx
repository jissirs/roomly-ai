import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProject, PROJECT_FLOW, removeProject, updateProject } from '../../lib/projects'
import { deleteProjectImages, getProjectImages } from '../../lib/imageStore'
import './ProjectDetailPage.css'

const ROOM_TYPE_LABELS = {
  bedroom: 'ห้องนอน',
  'living-room': 'ห้องนั่งเล่น',
  studio: 'ห้องสตูดิโอ',
  workspace: 'ห้องทำงาน',
}

const STYLE_LABELS = {
  minimal: 'Minimal',
  japandi: 'Japandi',
  modern: 'Modern',
  scandinavian: 'Scandinavian',
  contemporary: 'Contemporary',
  luxury: 'Luxury',
  industrial: 'Industrial',
  'mid-century': 'Mid-century',
  classic: 'Classic',
  bohemian: 'Bohemian',
  coastal: 'Coastal',
  'wabi-sabi': 'Wabi-sabi',
}

const STATUS_LABELS = {
  draft: 'ฉบับร่าง',
  'in-progress': 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
  'room-input': 'ข้อมูลห้องพร้อมแล้ว',
  'ai-generate': 'กำลัง Generate',
  result: 'รอดูผลลัพธ์',
  'object-decision': 'กำลังตัดสินใจ',
  'product-matching': 'กำลังเลือกสินค้า',
  saved: 'บันทึกแล้ว',
}

const ICON_PATHS = {
  back: <path d="m15 18-6-6 6-6" />,
  edit: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></>,
  room: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 21V8h8v13M12 8V3M8 14h8" /></>,
}

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = getProject(id)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [heroImage, setHeroImage] = useState('')
  const [aiInstructions, setAiInstructions] = useState(() => project?.aiInstructions ?? project?.notes ?? '')
  const [instructionStatus, setInstructionStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    getProjectImages(id).then((files) => {
      if (cancelled || !files.length) return
      objectUrl = URL.createObjectURL(files[0])
      setHeroImage(objectUrl)
    }).catch(() => {})

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

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

  const budgetLabel = new Intl.NumberFormat('th-TH').format(project.budget)
  const currentStage = project.stage ?? 'room-input'
  const currentStageIndex = Math.max(0, PROJECT_FLOW.findIndex((step) => step.id === currentStage))
  const resumeAction = currentStage === 'saved'
    ? { label: 'ดูสรุปโปรเจกต์', path: `/project/${project.id}/summary` }
    : currentStage === 'product-matching'
      ? { label: 'เลือกสินค้าต่อ', path: `/project/${project.id}/products` }
      : currentStage === 'object-decision'
        ? { label: 'ตัดสินใจเฟอร์นิเจอร์ต่อ', path: `/project/${project.id}/decisions` }
        : { label: currentStage === 'result' ? 'ดูผลลัพธ์ AI' : currentStage === 'ai-generate' ? 'กลับไปหน้า Generate' : 'เริ่ม AI Generate', path: currentStage === 'result' ? `/project/${project.id}/result` : `/project/${project.id}/generate` }

  function handleDelete() {
    deleteProjectImages(project.id).catch(() => {})
    removeProject(project.id)
    navigate('/home')
  }

  function saveAiInstructions(continueAfterSave = false) {
    updateProject(project.id, { aiInstructions: aiInstructions.trim() })
    setInstructionStatus('บันทึกแล้ว')
    if (continueAfterSave) navigate(resumeAction.path)
  }

  return (
    <div className="detail-shell">
      <header className="detail-topbar">
        <Link className="detail-back" to="/home">
          <Icon name="back" size={16} /> กลับไปที่คลัง
        </Link>
        <div className="detail-actions">
          <Link className="detail-edit-button" to={`/create-project/${project.id}`}>
            <Icon name="edit" size={15} /> แก้ไขโปรเจกต์
          </Link>
          <button className="detail-delete-button" type="button" onClick={() => setConfirmingDelete(true)}>
            <Icon name="trash" size={15} /> ลบโปรเจกต์
          </button>
        </div>
      </header>

      <main className="detail-content">
        <div className="detail-hero">
          {heroImage || project.previewUrl ? (
            <img src={heroImage || project.previewUrl} alt={`ภาพห้องของโปรเจกต์ ${project.name}`} />
          ) : (
            <Icon name="room" size={34} />
          )}
        </div>

        <div className="detail-heading">
          <span className={`detail-status is-${currentStage}`}>{STATUS_LABELS[currentStage] ?? currentStage}</span>
          <h1>{project.name}</h1>
          <p>{ROOM_TYPE_LABELS[project.roomType] ?? project.roomType} · {STYLE_LABELS[project.style] ?? project.style}</p>
        </div>

        <div className="detail-progress-card">
          <div><span>ความคืบหน้า</span><strong>{project.progress ?? 0}%</strong></div>
          <div className="detail-progress-track">
            <div className="detail-progress-bar" style={{ width: `${project.progress ?? 0}%` }} />
          </div>
        </div>

        <section className="detail-flow-card" aria-labelledby="project-flow-title">
          <div className="detail-flow-heading">
            <div><span>PROJECT FLOW</span><h2 id="project-flow-title">ขั้นตอนของโปรเจกต์</h2></div>
            <small>ขั้นตอน {currentStageIndex + 1} จาก {PROJECT_FLOW.length}</small>
          </div>
          <ol className="detail-flow-list">
            {PROJECT_FLOW.map((step, index) => (
              <li className={`${index === currentStageIndex ? 'is-current' : ''} ${index < currentStageIndex ? 'is-complete' : ''}`.trim()} key={step.id}>
                <span>{index < currentStageIndex ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <strong>{step.title}</strong>
              </li>
            ))}
          </ol>
          <p className="detail-source-note">ขั้น Product Matching จะแสดงสินค้าจากแหล่งจริง เช่น IKEA และ Shopee พร้อมราคาและลิงก์ร้านค้า เมื่อเชื่อมต่อข้อมูลสินค้าแล้ว</p>
        </section>

        <div className="detail-grid">
          <div className="detail-card">
            <span>ภาพห้องเปล่า</span>
            <strong>{project.imageCount ?? 1} ห้อง</strong>
          </div>
          <div className="detail-card">
            <span>งบประมาณสูงสุด</span>
            <strong>฿{budgetLabel}</strong>
          </div>
          <div className="detail-card">
            <span>ความต้องการเพิ่มเติม</span>
            {project.requirements?.length ? (
              <ul className="detail-tags">
                {project.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            ) : (
              <strong>ไม่ระบุ</strong>
            )}
          </div>
          <div className="detail-card detail-ai-card">
            <div className="detail-ai-heading">
              <div><span>คำอธิบายเพิ่มเติมสำหรับ AI</span><small>AI DESIGN BRIEF</small></div>
              <em>{aiInstructions.length}/600</em>
            </div>
            <textarea
              value={aiInstructions}
              maxLength="600"
              rows="5"
              onChange={(event) => {
                setAiInstructions(event.target.value)
                setInstructionStatus('')
              }}
              placeholder="เช่น อยากให้ห้องดูโปร่ง ใช้โทนไม้สว่าง เก็บโต๊ะเดิมไว้ เพิ่มมุมอ่านหนังสือ และหลีกเลี่ยงเฟอร์นิเจอร์สีดำ"
              aria-label="คำอธิบายเพิ่มเติมสำหรับ AI"
            />
            <div className="detail-ai-footer">
              <p>ระบุของที่อยากเก็บ สีที่ชอบ ฟังก์ชันที่ต้องมี หรือสิ่งที่ไม่ต้องการ</p>
              <button type="button" onClick={() => saveAiInstructions(false)}>{instructionStatus || 'บันทึกคำอธิบาย'}</button>
            </div>
          </div>
        </div>

        <button className="detail-primary-button" type="button" onClick={() => saveAiInstructions(true)}>
          {resumeAction.label} <span aria-hidden="true">→</span>
        </button>
      </main>

      {confirmingDelete ? (
        <div className="detail-modal-backdrop" onClick={() => setConfirmingDelete(false)}>
          <div className="detail-modal" onClick={(event) => event.stopPropagation()}>
            <strong>ลบโปรเจกต์นี้?</strong>
            <p>“{project.name}” จะถูกลบออกจากคลังอย่างถาวร</p>
            <div className="detail-modal-actions">
              <button type="button" onClick={() => setConfirmingDelete(false)}>ยกเลิก</button>
              <button type="button" className="is-danger" onClick={handleDelete}>ลบโปรเจกต์</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ProjectDetailPage
