import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addProject, getProject, updateProject } from '../../lib/projects'
import { saveProjectImages } from '../../lib/imageStore'
import './CreateProjectPage.css'

const FLOW_STEPS = [
  { number: '01', title: 'Room Details', detail: 'ข้อมูลและภาพห้องเปล่า', active: true },
  { number: '02', title: 'AI Generate', detail: 'ออกแบบและใส่เฟอร์นิเจอร์' },
  { number: '03', title: 'Result', detail: 'ดูภาพห้องที่ออกแบบแล้ว' },
  { number: '04', title: 'Object Decision', detail: 'Keep / Replace / Remove' },
  { number: '05', title: 'Product Match', detail: 'สินค้า IKEA / Shopee' },
  { number: '06', title: 'Save Project', detail: 'บันทึกผลลัพธ์ลงคลัง' },
]

const ROOM_TYPES = [
  { value: 'bedroom', label: 'ห้องนอน', icon: 'bed' },
  { value: 'living-room', label: 'ห้องนั่งเล่น', icon: 'sofa' },
  { value: 'studio', label: 'ห้องสตูดิโอ', icon: 'studio' },
  { value: 'workspace', label: 'ห้องทำงาน', icon: 'desk' },
]

const STYLES = [
  { value: 'minimal', label: 'Minimal', palette: ['#ded5c7', '#928777', '#f3eee6'] },
  { value: 'japandi', label: 'Japandi', palette: ['#b49772', '#ece3d5', '#6d5a46'] },
  { value: 'modern', label: 'Modern', palette: ['#272523', '#918a82', '#d8d3cc'] },
  { value: 'scandinavian', label: 'Scandinavian', palette: ['#eee9df', '#c5aa83', '#9daa9d'] },
  { value: 'contemporary', label: 'Contemporary', palette: ['#d9d4cb', '#796f68', '#263238'] },
  { value: 'luxury', label: 'Luxury', palette: ['#1d1b19', '#b59458', '#eee5d4'] },
  { value: 'industrial', label: 'Industrial', palette: ['#30302f', '#86654b', '#a9a39b'] },
  { value: 'mid-century', label: 'Mid-century', palette: ['#bf6b3f', '#d9b778', '#3c594f'] },
  { value: 'classic', label: 'Classic', palette: ['#ede4d4', '#8b6b4f', '#6b2832'] },
  { value: 'bohemian', label: 'Bohemian', palette: ['#b76e48', '#d6b86e', '#65715a'] },
  { value: 'coastal', label: 'Coastal', palette: ['#e7e2d8', '#9bb9c3', '#59798b'] },
  { value: 'wabi-sabi', label: 'Wabi-sabi', palette: ['#b2a18c', '#d8cdbd', '#70675c'] },
]

const REQUIREMENTS = [
  'เพิ่มพื้นที่จัดเก็บ',
  'มีมุมทำงาน',
  'เน้นพักผ่อน',
  'รองรับสัตว์เลี้ยง',
]

const CREATE_STEPS = [
  { label: 'ภาพห้อง', detail: 'ตั้งชื่อและเพิ่มภาพ', title: 'เริ่มจากห้องของคุณ', description: 'ตั้งชื่อโปรเจกต์และอัปโหลดภาพห้องจริงอย่างน้อย 1 ภาพ' },
  { label: 'ข้อมูลพื้นที่', detail: 'ประเภทและขนาดห้อง', title: 'บอกขนาดพื้นที่', description: 'ข้อมูลนี้ช่วยให้ระบบประเมินสัดส่วนและ Space Fit ได้สมเหตุสมผลขึ้น' },
  { label: 'แนวทาง', detail: 'สไตล์และงบประมาณ', title: 'กำหนดแบบที่ต้องการ', description: 'เลือกบรรยากาศหลักและงบสูงสุดสำหรับคัดเลือกเฟอร์นิเจอร์' },
  { label: 'ตรวจทาน', detail: 'ความต้องการเพิ่มเติม', title: 'ตรวจข้อมูลก่อนสร้าง', description: 'เพิ่มความต้องการเฉพาะ แล้วตรวจสอบข้อมูลสำคัญอีกครั้ง' },
]

const ICON_PATHS = {
  bed: <><path d="M3 18V8m18 10V11a2 2 0 0 0-2-2H9v9M3 13h18M6 9V6h3a2 2 0 0 1 2 2v1" /></>,
  sofa: <><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M5 19v-2m14 2v-2M4 11a2 2 0 0 0-2 2v4h20v-4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2Z" /></>,
  studio: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 21V8h8v13M12 8V3M8 14h8" /></>,
  desk: <><path d="M3 10h18v4H3zM6 14v7m12-7v7M8 10V5h8v5" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M5 15v5h14v-5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="m9 18 6-6-6-6" />,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M15 4h5v16h-5" /></>,
}

function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

function CreateProjectPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const existingProject = id ? getProject(id) : null

  const [projectName, setProjectName] = useState(existingProject?.name ?? '')
  const [roomImages, setRoomImages] = useState([])
  const imageUrlsRef = useRef([])
  const [roomType, setRoomType] = useState(existingProject?.roomType ?? 'living-room')
  const [style, setStyle] = useState(existingProject?.style ?? 'japandi')
  const [budget, setBudget] = useState(existingProject?.budget ?? 20000)
  const [requirements, setRequirements] = useState(existingProject?.requirements ?? ['เพิ่มพื้นที่จัดเก็บ'])
  const [dimensions, setDimensions] = useState(existingProject?.dimensions ?? { width: '', length: '', height: '' })
  const [notes, setNotes] = useState(existingProject?.notes ?? '')
  const [activeStep, setActiveStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => () => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function selectFiles(fileList) {
    const validFiles = Array.from(fileList ?? []).filter(
      (file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024,
    )
    if (!validFiles.length) return

    const newImages = validFiles.map((file) => {
      const url = URL.createObjectURL(file)
      imageUrlsRef.current.push(url)
      return {
        id: globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.lastModified}`,
        file,
        url,
      }
    })
    setRoomImages((current) => [...current, ...newImages])
  }

  function removeImage(id) {
    setRoomImages((current) => {
      const image = current.find((item) => item.id === id)
      if (image) {
        URL.revokeObjectURL(image.url)
        imageUrlsRef.current = imageUrlsRef.current.filter((url) => url !== image.url)
      }
      return current.filter((item) => item.id !== id)
    })
  }

  function toggleRequirement(requirement) {
    setRequirements((current) =>
      current.includes(requirement)
        ? current.filter((item) => item !== requirement)
        : [...current, requirement],
    )
  }

  const budgetLabel = new Intl.NumberFormat('th-TH').format(budget)

  const hasRoomImage = roomImages.length > 0 || Boolean(existingProject?.hasRoomImage)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!hasRoomImage || !projectName.trim()) return
    setIsSaving(true)
    setSaveError('')

    const payload = {
      name: projectName.trim(),
      roomType,
      style,
      budget,
      requirements,
      dimensions,
      notes: notes.trim(),
      hasRoomImage: true,
      imageCount: existingProject
        ? (existingProject.imageCount ?? 1) + roomImages.length
        : roomImages.length,
      roomImageNames: roomImages.length
        ? [...(existingProject?.roomImageNames ?? []), ...roomImages.map((image) => image.file.name)]
        : existingProject?.roomImageNames ?? [],
    }

    try {
      if (existingProject) {
        updateProject(existingProject.id, payload)
        await saveProjectImages(existingProject.id, roomImages.map((image) => image.file))
        navigate(`/project/${existingProject.id}`)
        return
      }

      const project = addProject({ ...payload, status: 'draft', stage: 'room-input', progress: 16 })
      await saveProjectImages(project.id, roomImages.map((image) => image.file))
      navigate(`/project/${project.id}`)
    } catch {
      setSaveError('บันทึกภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setIsSaving(false)
    }
  }

  const canContinue = activeStep === 0
    ? Boolean(projectName.trim() && hasRoomImage)
    : activeStep === 1
      ? Boolean(dimensions.width && dimensions.length)
      : true

  function continueFlow() {
    if (!canContinue) return
    setActiveStep((current) => Math.min(current + 1, CREATE_STEPS.length - 1))
  }

  return (
    <div className="project-shell">
      <aside className="project-sidebar">
        <Link className="project-brand" to="/home">ROOMLY AI</Link>

        <div className="project-progress-copy">
          <p>NEW PROJECT</p>
          <strong>สร้างห้องของคุณ</strong>
          <span>Room Input · {activeStep + 1} จาก {CREATE_STEPS.length}</span>
        </div>

        <nav className="project-flow" aria-label="ขั้นตอนสร้างโปรเจกต์">
          {FLOW_STEPS.map((step) => (
            <div className={`project-flow-step ${step.active ? 'is-active' : ''}`.trim()} key={step.number}>
              <span className="project-step-number">{step.number}</span>
              <span className="project-step-copy">
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </span>
            </div>
          ))}
        </nav>

        <div className="project-sidebar-note">
          <span>V1 FLOW</span>
          <p>เริ่มจากภาพห้องเปล่า แล้วจบด้วยแบบห้อง งบรวม และสินค้าจริงจาก IKEA หรือ Shopee</p>
        </div>
      </aside>

      <div className="project-workspace">
        <header className="project-topbar">
          <div className="project-mobile-brand">ROOMLY AI</div>
          <div className="project-topbar-copy">
            <p>{existingProject ? 'EDIT PROJECT' : 'CREATE PROJECT'}</p>
            <span>ระบบจะบันทึกข้อมูลเป็นโปรเจกต์เดียวตลอดทุกขั้นตอน</span>
          </div>
          <Link className="project-exit" to="/home">
            กลับสู่คลัง <Icon name="logout" size={17} />
          </Link>
        </header>

        <main className="project-content">
          <header className="project-heading">
            <p className="project-eyebrow">01 · ROOM INPUT & PREFERENCE</p>
            <h1>{CREATE_STEPS[activeStep].title}</h1>
            <p>{CREATE_STEPS[activeStep].description}</p>
          </header>

          <ol className="project-create-steps" aria-label="ขั้นตอนสร้างโปรเจกต์">
            {CREATE_STEPS.map((step, index) => (
              <li className={`${index === activeStep ? 'is-active' : ''} ${index < activeStep ? 'is-complete' : ''}`.trim()} key={step.label}>
                <button type="button" onClick={() => index <= activeStep && setActiveStep(index)} disabled={index > activeStep} aria-current={index === activeStep ? 'step' : undefined}>
                  <span>{index < activeStep ? '✓' : String(index + 1).padStart(2, '0')}</span>
                  <strong>{step.label}</strong><small>{step.detail}</small>
                </button>
              </li>
            ))}
          </ol>

          <form className="project-form" onSubmit={handleSubmit}>
            <section className={`project-section project-name-section ${activeStep === 0 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>00</span>
                <div><h2>ตั้งชื่อโปรเจกต์</h2><p>ตั้งชื่อให้จำง่ายเพื่อค้นหาในคลังภายหลัง</p></div>
              </div>
              <label className="project-name-field">
                <span>ชื่อโปรเจกต์</span>
                <input
                  type="text"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="เช่น ห้องนั่งเล่นคอนโดสุขุมวิท"
                  maxLength="80"
                  required
                />
              </label>
            </section>
            <section className={`project-section ${activeStep === 0 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>01</span>
                <div><h2>อัปโหลดภาพห้องเปล่า</h2><p>เพิ่มได้หลายห้อง เลือกหลายไฟล์พร้อมกัน หรือกลับมาเพิ่มทีละภาพก็ได้</p></div>
              </div>

              <label
                className={`project-dropzone ${roomImages.length ? 'has-images' : ''}`.trim()}
                htmlFor="project-room-image"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  selectFiles(event.dataTransfer.files)
                }}
              >
                {roomImages.length ? (
                  <div className="project-upload-summary">
                    <span className="project-upload-icon"><Icon name="upload" size={25} /></span>
                    <div><strong>เพิ่มภาพห้องอีก</strong><small>เลือกหลายไฟล์ได้ · ขณะนี้มี {roomImages.length} ห้อง</small></div>
                    <span className="project-upload-cta">เพิ่มภาพ</span>
                  </div>
                ) : existingProject?.hasRoomImage ? (
                  <>
                    <span className="project-upload-icon"><Icon name="image" size={25} /></span>
                    <strong>โปรเจกต์นี้มีภาพห้องอยู่แล้ว {existingProject.imageCount ?? 1} ภาพ</strong>
                    <small>คลิกหรือลากไฟล์มาวางเพื่อเพิ่มภาพห้อง</small>
                    <span className="project-upload-cta">เพิ่มภาพห้อง</span>
                  </>
                ) : (
                  <>
                    <span className="project-upload-icon"><Icon name="upload" size={25} /></span>
                    <strong>ลากภาพมาวาง หรือคลิกเพื่อเลือกไฟล์</strong>
                    <small>เลือกหลายไฟล์ได้ · รองรับ JPG, PNG หรือ WEBP ไม่เกิน 10 MB ต่อภาพ</small>
                    <span className="project-upload-cta">เลือกภาพห้องเปล่า</span>
                  </>
                )}
              </label>
              <input
                id="project-room-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => {
                  selectFiles(event.target.files)
                  event.target.value = ''
                }}
              />

              {roomImages.length ? (
                <div className="project-image-grid" aria-label={`ภาพห้องที่เลือก ${roomImages.length} ภาพ`}>
                  {roomImages.map((image, index) => (
                    <figure className="project-image-card" key={image.id}>
                      <img src={image.url} alt={`ภาพห้อง ${index + 1}`} />
                      <figcaption><span>ห้อง {String(index + 1).padStart(2, '0')}</span><small>{image.file.name}</small></figcaption>
                      <button type="button" onClick={() => removeImage(image.id)} aria-label={`ลบภาพห้อง ${index + 1}`}>×</button>
                    </figure>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={`project-section ${activeStep === 1 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>02</span>
                <div><h2>ข้อมูลพื้นฐานของห้อง</h2><p>เลือกประเภทห้องและระบุขนาดโดยประมาณ</p></div>
              </div>

              <fieldset className="project-fieldset">
                <legend>ประเภทห้อง</legend>
                <div className="project-room-types">
                  {ROOM_TYPES.map((room) => (
                    <label className={`project-choice-card ${roomType === room.value ? 'is-selected' : ''}`.trim()} key={room.value}>
                      <input type="radio" name="roomType" value={room.value} checked={roomType === room.value} onChange={() => setRoomType(room.value)} />
                      <Icon name={room.icon} size={22} />
                      <span>{room.label}</span>
                      {roomType === room.value ? <i><Icon name="check" size={12} /></i> : null}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="project-fields-row project-dimensions">
                <label><span>ความกว้าง <b>*</b></span><span className="project-input-unit"><input type="number" min="1" step="0.1" value={dimensions.width} onChange={(event) => setDimensions((current) => ({ ...current, width: event.target.value }))} placeholder="3.0" /><i>ม.</i></span></label>
                <label><span>ความยาว <b>*</b></span><span className="project-input-unit"><input type="number" min="1" step="0.1" value={dimensions.length} onChange={(event) => setDimensions((current) => ({ ...current, length: event.target.value }))} placeholder="4.0" /><i>ม.</i></span></label>
                <label><span>ความสูง</span><span className="project-input-unit"><input type="number" min="1" step="0.1" value={dimensions.height} onChange={(event) => setDimensions((current) => ({ ...current, height: event.target.value }))} placeholder="2.6" /><i>ม.</i></span></label>
              </div>
              <p className="project-field-note">ขนาดห้องใช้สำหรับประเมิน Space Fit ใน V1 กรุณากรอกค่าที่วัดได้จริง</p>
            </section>

            <section className={`project-section ${activeStep === 2 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>03</span>
                <div><h2>สไตล์ที่ชอบ</h2><p>เลือกแนวทางหลักสำหรับการออกแบบและจับคู่สินค้า</p></div>
              </div>

              <fieldset className="project-fieldset">
                <legend className="sr-only">เลือกสไตล์</legend>
                <div className="project-style-grid">
                  {STYLES.map((item) => (
                    <label className={`project-style-card ${style === item.value ? 'is-selected' : ''}`.trim()} key={item.value}>
                      <input type="radio" name="style" value={item.value} checked={style === item.value} onChange={() => setStyle(item.value)} />
                      <span className="project-style-palette">{item.palette.map((color) => <i style={{ background: color }} key={color} />)}</span>
                      <strong>{item.label}</strong>
                      {style === item.value ? <span className="project-style-check"><Icon name="check" size={12} /></span> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className={`project-section ${activeStep === 2 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>04</span>
                <div><h2>งบประมาณ</h2><p>ระบบจะใช้ยอดนี้เป็นข้อจำกัดในการเลือกชุดสินค้า</p></div>
              </div>

              <div className="project-budget-card">
                <div><span>งบประมาณสูงสุด</span><strong>฿{budgetLabel}</strong></div>
                <input type="range" min="5000" max="150000" step="1000" value={budget} onChange={(event) => setBudget(Number(event.target.value))} aria-label="งบประมาณสูงสุด" style={{ '--budget-progress': `${((budget - 5000) / 145000) * 100}%` }} />
                <div className="project-budget-range"><span>฿5,000</span><span>฿150,000</span></div>
              </div>
            </section>

            <section className={`project-section ${activeStep === 3 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>05</span>
                <div><h2>ความต้องการเพิ่มเติม</h2><p>เลือกได้มากกว่าหนึ่งข้อเพื่อช่วยจัดลำดับ Function / Need</p></div>
              </div>

              <div className="project-requirements">
                {REQUIREMENTS.map((requirement) => (
                  <label className={requirements.includes(requirement) ? 'is-selected' : ''} key={requirement}>
                    <input type="checkbox" checked={requirements.includes(requirement)} onChange={() => toggleRequirement(requirement)} />
                    <span>{requirement}</span><i><Icon name="check" size={12} /></i>
                  </label>
                ))}
              </div>

              <label className="project-textarea-field">
                <span>รายละเอียดอื่น ๆ <small>(ไม่บังคับ)</small></span>
                <textarea rows="4" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="เช่น อยากเก็บโต๊ะทำงานเดิม ต้องการทางเดินกว้าง หรือมีสีที่ไม่ต้องการ" />
              </label>

              <div className="project-review-card">
                <div className="project-review-heading"><span>PROJECT SUMMARY</span><strong>{projectName || 'ยังไม่ได้ตั้งชื่อโปรเจกต์'}</strong></div>
                <dl>
                  <div><dt>ภาพห้อง</dt><dd>{roomImages.length || existingProject?.imageCount || 0} ภาพ</dd></div>
                  <div><dt>ประเภท</dt><dd>{ROOM_TYPES.find((item) => item.value === roomType)?.label}</dd></div>
                  <div><dt>ขนาด</dt><dd>{dimensions.width || '–'} × {dimensions.length || '–'}{dimensions.height ? ` × ${dimensions.height}` : ''} ม.</dd></div>
                  <div><dt>สไตล์</dt><dd>{STYLES.find((item) => item.value === style)?.label}</dd></div>
                  <div><dt>งบสูงสุด</dt><dd>฿{budgetLabel}</dd></div>
                  <div><dt>ความต้องการ</dt><dd>{requirements.length ? `${requirements.length} ข้อ` : 'ไม่ระบุ'}</dd></div>
                </dl>
              </div>
            </section>

            <footer className="project-form-footer">
              <div><strong>{saveError || `ขั้นตอน ${activeStep + 1} จาก ${CREATE_STEPS.length}`}</strong><span>{saveError ? 'ไฟล์เดิมยังอยู่ในหน้านี้' : CREATE_STEPS[activeStep].detail}</span></div>
              <div className="project-footer-actions">
                {activeStep > 0 ? <button className="project-back-button" type="button" onClick={() => setActiveStep((current) => current - 1)}>ย้อนกลับ</button> : null}
                {activeStep < CREATE_STEPS.length - 1 ? <button className="project-next-button" type="button" onClick={continueFlow} disabled={!canContinue}>ไปต่อ <Icon name="arrow" size={18} /></button> : <button className="project-next-button" type="submit" disabled={!hasRoomImage || !projectName.trim() || !dimensions.width || !dimensions.length || isSaving}>{isSaving ? 'กำลังบันทึกภาพ...' : existingProject ? 'บันทึกการแก้ไข' : 'สร้างโปรเจกต์และไปต่อ'} {!isSaving ? <Icon name="arrow" size={18} /> : null}</button>}
              </div>
            </footer>
          </form>
        </main>
      </div>
    </div>
  )
}

export default CreateProjectPage
