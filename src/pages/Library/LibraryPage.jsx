import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getProjects, removeProject } from '../../lib/projects'
import { deleteProjectImages } from '../../lib/imageStore'
import './LibraryPage.css'

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
  'room-input': 'ข้อมูลห้อง',
  'ai-generate': 'กำลัง Generate',
  result: 'ดูผลลัพธ์',
  'object-decision': 'กำลังตัดสินใจ',
  'product-matching': 'เลือกสินค้า',
  saved: 'บันทึกแล้ว',
}

const ICON_PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M15 4h5v16h-5" /></>,
  room: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 21V8h8v13M12 8V3M8 14h8" /></>,
  more: <><circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" /></>,
  edit: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" /></>,
}

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

function LibraryPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState(() => getProjects())
  const [openMenuId, setOpenMenuId] = useState(null)
  const budgetFormatter = new Intl.NumberFormat('th-TH')

  function handleDelete(event, project) {
    event.preventDefault()
    event.stopPropagation()
    setOpenMenuId(null)
    if (!window.confirm(`ลบโปรเจกต์ “${project.name}” ใช่หรือไม่?`)) return
    deleteProjectImages(project.id).catch(() => {})
    removeProject(project.id)
    setProjects(getProjects())
  }

  function handleEdit(event, project) {
    event.preventDefault()
    event.stopPropagation()
    setOpenMenuId(null)
    navigate(`/create-project/${project.id}`)
  }

  return (
    <div className="library-shell">
      <header className="library-topbar">
        <Link className="library-brand" to="/">ROOMLY AI</Link>
        <Link className="library-exit" to="/login">
          ออกจากระบบ <Icon name="logout" size={16} />
        </Link>
      </header>

      <main className="library-content">
        <div className="library-heading">
          <div>
            <p className="library-eyebrow">คลังโปรเจกต์</p>
            <h1>โปรเจกต์ของคุณ</h1>
            <p className="library-subtitle">รวมทุกห้องที่คุณเคยสร้างและกำลังออกแบบกับ Roomly AI</p>
          </div>
          <Link className="library-new-button" to="/create-project">
            <Icon name="plus" size={16} /> สร้างโปรเจกต์ใหม่
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="library-empty">
            <span className="library-empty-icon"><Icon name="room" size={26} /></span>
            <strong>ยังไม่มีโปรเจกต์</strong>
            <p>เริ่มต้นสร้างโปรเจกต์แรกของคุณ อัปโหลดภาพห้องจริงแล้วให้ AI ช่วยออกแบบ</p>
            <Link className="library-new-button" to="/create-project">
              <Icon name="plus" size={16} /> สร้างโปรเจกต์ใหม่
            </Link>
          </div>
        ) : (
          <div className="library-grid">
            {projects.map((project) => (
              <Link className="library-card" to={`/project/${project.id}`} key={project.id}>
                <div className="library-card-thumb">
                  {project.previewUrl ? (
                    <img src={project.previewUrl} alt="" />
                  ) : (
                    <Icon name="room" size={28} />
                  )}
                  <span className={`library-status is-${project.stage ?? project.status}`}>
                    {STATUS_LABELS[project.stage ?? project.status] ?? project.stage ?? project.status}
                  </span>

                  <div className="library-menu">
                    <button
                      type="button"
                      className="library-menu-trigger"
                      aria-label="ตั้งค่าโปรเจกต์"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setOpenMenuId((current) => (current === project.id ? null : project.id))
                      }}
                    >
                      <Icon name="more" size={16} />
                    </button>

                    {openMenuId === project.id ? (
                      <>
                        <div className="library-menu-backdrop" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpenMenuId(null) }} />
                        <div className="library-menu-dropdown" onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={(event) => handleEdit(event, project)}>
                            <Icon name="edit" size={14} /> แก้ไขโปรเจกต์
                          </button>
                          <button type="button" className="is-danger" onClick={(event) => handleDelete(event, project)}>
                            <Icon name="trash" size={14} /> ลบโปรเจกต์
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="library-card-body">
                  <strong>{project.name}</strong>
                  <span className="library-card-meta">
                    {ROOM_TYPE_LABELS[project.roomType] ?? project.roomType} · {STYLE_LABELS[project.style] ?? project.style}
                  </span>
                  <span className="library-card-budget">งบ ฿{budgetFormatter.format(project.budget)}</span>
                  <div className="library-progress">
                    <div className="library-progress-bar" style={{ width: `${project.progress ?? 0}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default LibraryPage
