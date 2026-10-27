import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addProject, getProject, updateProject, withWorkflowData } from '../../lib/projects'
import { api } from '../../lib/api'
import { MAX_ROOM_IMAGES, deleteGeneratedImages, deleteProjectImagesByPath, getProjectImages, saveProjectImages } from '../../lib/imageStore'
import './CreateProjectPage.css'

const FLOW_STEPS = [
  { number: '01', title: 'Room Details', detail: 'ข้อมูลและภาพห้องเปล่า', active: true },
  { number: '02', title: 'AI Generate', detail: 'ออกแบบและใส่เฟอร์นิเจอร์' },
  { number: '03', title: 'Result', detail: 'ดูภาพห้องที่ออกแบบแล้ว' },
  { number: '04', title: 'Object Decision', detail: 'Keep / Replace / Remove' },
  { number: '05', title: 'Summary', detail: 'สรุปผลการตัดสินใจ' },
  { number: '06', title: 'Product Match', detail: 'สินค้า IKEA / HomePro' },
  { number: '07', title: 'Save Project', detail: 'บันทึกผลลัพธ์ลงคลัง' },
]

const ROOM_TYPES = [
  { value: 'bedroom', label: 'ห้องนอน', icon: 'bed' },
  { value: 'living-room', label: 'ห้องนั่งเล่น', icon: 'sofa' },
  { value: 'studio', label: 'ห้องสตูดิโอ', icon: 'studio' },
  { value: 'workspace', label: 'ห้องทำงาน', icon: 'desk' },
]

const STYLES = [
  { value: 'minimal', label: 'Minimal', description: 'เรียบ โปร่ง ใช้เท่าที่จำเป็น', materials: ['Light wood', 'Linen'], palette: ['#ded5c7', '#928777', '#f3eee6'] },
  { value: 'japandi', label: 'Japandi', description: 'อบอุ่น สงบ สมดุลแบบญี่ปุ่น', materials: ['Oak', 'Natural'], palette: ['#b49772', '#ece3d5', '#6d5a46'] },
  { value: 'modern', label: 'Modern', description: 'เส้นสายชัดและโทนเข้มร่วมสมัย', materials: ['Metal', 'Stone'], palette: ['#272523', '#918a82', '#d8d3cc'] },
  { value: 'scandinavian', label: 'Scandinavian', description: 'สว่าง เป็นกันเอง และใช้งานง่าย', materials: ['Pine', 'Soft fabric'], palette: ['#eee9df', '#c5aa83', '#9daa9d'] },
  { value: 'contemporary', label: 'Contemporary', description: 'เรียบหรูด้วยรูปทรงและสีปัจจุบัน', materials: ['Glass', 'Textile'], palette: ['#d9d4cb', '#796f68', '#263238'] },
  { value: 'luxury', label: 'Luxury', description: 'เข้ม ละเอียด และมีจุดเด่นหรูหรา', materials: ['Brass', 'Velvet'], palette: ['#1d1b19', '#b59458', '#eee5d4'] },
  { value: 'industrial', label: 'Industrial', description: 'ดิบ เท่ เน้นวัสดุและโครงสร้าง', materials: ['Steel', 'Concrete'], palette: ['#30302f', '#86654b', '#a9a39b'] },
  { value: 'mid-century', label: 'Mid-century', description: 'เรโทรอบอุ่นกับรูปทรงเหนือกาลเวลา', materials: ['Walnut', 'Leather'], palette: ['#bf6b3f', '#d9b778', '#3c594f'] },
  { value: 'classic', label: 'Classic', description: 'สง่างาม สมมาตร และมีรายละเอียด', materials: ['Dark wood', 'Brass'], palette: ['#ede4d4', '#8b6b4f', '#6b2832'] },
  { value: 'bohemian', label: 'Bohemian', description: 'อิสระ มีสีสันและพื้นผิวหลากหลาย', materials: ['Rattan', 'Pattern'], palette: ['#b76e48', '#d6b86e', '#65715a'] },
  { value: 'coastal', label: 'Coastal', description: 'เบาสบาย สว่าง และสดชื่น', materials: ['White oak', 'Cotton'], palette: ['#e7e2d8', '#9bb9c3', '#59798b'] },
  { value: 'wabi-sabi', label: 'Wabi-sabi', description: 'สงบนิ่ง เห็นความงามของธรรมชาติ', materials: ['Clay', 'Raw wood'], palette: ['#b2a18c', '#d8cdbd', '#70675c'] },
]

function shuffleStyles(styles) {
  const shuffled = [...styles]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const temporary = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = temporary
  }
  return shuffled
}

async function fileToAnalysisDataUrl(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

const MIN_BUDGET = 100
const MAX_BUDGET = 1000000
const BUDGET_STEP = 1000

const DIMENSION_LIMITS = {
  width: { min: 1, max: 30, label: 'ความกว้าง' },
  length: { min: 1, max: 30, label: 'ความยาว' },
  height: { min: 2, max: 6, label: 'ความสูง' },
}

function getDimensionError(field, value) {
  if (value === '' || value === undefined) return ''
  const { min, max, label } = DIMENSION_LIMITS[field]
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) return `${label}ต้องอยู่ระหว่าง ${min}–${max} เมตร`
  return ''
}

const CREATE_STEPS = [
  { label: 'ห้องของคุณ', detail: 'ชื่อ ภาพ และขนาดห้อง', title: 'เริ่มจากห้องของคุณ', description: 'ตั้งชื่อ อัปโหลดภาพห้องจริงอย่างน้อย 1 ภาพ แล้วบอกประเภทและขนาดห้อง' },
  { label: 'แบบที่ต้องการ', detail: 'สไตล์ งบ และความต้องการ', title: 'กำหนดแบบที่ต้องการ', description: 'เลือกสไตล์ งบสูงสุด และความต้องการ แล้วตรวจข้อมูลก่อนสร้างโปรเจกต์' },
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
  const [existingProject, setExistingProject] = useState(null)
  const [existingImages, setExistingImages] = useState([])
  const [removedImageIds, setRemovedImageIds] = useState([])
  const [showResetNotice, setShowResetNotice] = useState(false)
  const [isLoadingProject, setIsLoadingProject] = useState(Boolean(id))

  const [projectName, setProjectName] = useState('')
  const [roomImages, setRoomImages] = useState([])
  const imageUrlsRef = useRef([])
  const [roomType, setRoomType] = useState('living-room')
  const [style, setStyle] = useState('japandi')
  const [budget, setBudget] = useState(20000)
  const [dimensions, setDimensions] = useState({ width: '', length: '', height: '' })
  const [notes, setNotes] = useState('')
  const [activeStep, setActiveStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [styleOptions, setStyleOptions] = useState(() => STYLES.slice(0, 6))
  const [styleAnalysis, setStyleAnalysis] = useState('อัปโหลดภาพห้องเพื่อให้ AI จัดชุดสไตล์ที่เหมาะกับพื้นที่จริง')
  const [styleAnalysisError, setStyleAnalysisError] = useState('')
  const [isAnalyzingStyles, setIsAnalyzingStyles] = useState(false)
  const [styleShuffleRound, setStyleShuffleRound] = useState(0)
  const [imageLimitNotice, setImageLimitNotice] = useState('')

  useEffect(() => {
    if (!id) return
    getProject(id).then(async (project) => {
      if (!project) return
      setExistingProject(project)
      setProjectName(project.name ?? '')
      setRoomType(project.roomType ?? 'living-room')
      setStyle(project.style ?? 'japandi')
      setBudget(project.budget ?? 20000)
      setDimensions(project.dimensions ?? { width: '', length: '', height: '' })
      setNotes(project.notes ?? '')
      const images = await getProjectImages(id).catch(() => [])
      setExistingImages(images)
    }).finally(() => setIsLoadingProject(false))
  }, [id])

  const keptExistingImages = existingImages.filter((image) => !removedImageIds.includes(image.id))
  const existingImageUrl = keptExistingImages[0]?.url ?? ''
  const totalImages = keptExistingImages.length + roomImages.length

  useEffect(() => {
    if (activeStep !== 1) return undefined
    const localImage = roomImages[0]
    const source = localImage?.file ?? existingImageUrl
    if (!source) return undefined

    let cancelled = false
    async function analyzeStyles() {
      setIsAnalyzingStyles(true)
      setStyleAnalysisError('')
      try {
        const image = localImage?.file ? await fileToAnalysisDataUrl(localImage.file) : source
        const result = await api.post('/styles/recommend', { image, room_type: roomType })
        if (cancelled) return

        const options = (result.styles ?? []).map((recommendation) => {
          const definition = STYLES.find((item) => item.value === recommendation.id)
          if (!definition) return null
          return {
            ...definition,
            fit: recommendation.fit,
            aiReason: recommendation.reason,
            // AI proposes a palette/materials grounded in the actual photo;
            // fall back to the style's generic textbook defaults if it
            // didn't return a usable one for this entry.
            palette: recommendation.palette?.length === 3 ? recommendation.palette : definition.palette,
            materials: recommendation.materials?.length ? recommendation.materials : definition.materials,
            isAiStyled: Boolean(recommendation.palette?.length === 3 || recommendation.materials?.length),
          }
        }).filter(Boolean)

        if (!options.length) throw new Error('No style recommendation')
        setStyleOptions(options)
        setStyleAnalysis(result.analysis)
        setStyle((current) => options.some((item) => item.value === current) ? current : options[0].value)
      } catch {
        if (cancelled) return
        const fallback = shuffleStyles(STYLES).slice(0, 6)
        setStyleOptions(fallback)
        setStyleAnalysis('จัดชุดสไตล์แบบสุ่มจากประเภทห้องให้แล้ว คุณสามารถกดสุ่มชุดใหม่ได้อีกครั้ง')
        setStyleAnalysisError('ขณะนี้ AI วิเคราะห์ภาพไม่ได้ จึงใช้ชุดสำรองชั่วคราว')
        setStyle((current) => fallback.some((item) => item.value === current) ? current : fallback[0].value)
      } finally {
        if (!cancelled) setIsAnalyzingStyles(false)
      }
    }

    analyzeStyles()
    return () => { cancelled = true }
  }, [activeStep, existingImageUrl, roomImages, roomType, styleShuffleRound])

  useEffect(() => () => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function selectFiles(fileList) {
    const validFiles = Array.from(fileList ?? []).filter(
      (file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024,
    )
    if (!validFiles.length) return

    const remainingSlots = MAX_ROOM_IMAGES - totalImages
    setImageLimitNotice(remainingSlots < validFiles.length ? `อัปโหลดได้สูงสุด ${MAX_ROOM_IMAGES} ภาพต่อโปรเจกต์` : '')
    if (remainingSlots <= 0) return

    const newImages = validFiles.slice(0, remainingSlots).map((file) => {
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

  function removeExistingImage(imageId) {
    setImageLimitNotice('')
    setRemovedImageIds((current) => [...current, imageId])
  }

  function removeImage(id) {
    setImageLimitNotice('')
    setRoomImages((current) => {
      const image = current.find((item) => item.id === id)
      if (image) {
        URL.revokeObjectURL(image.url)
        imageUrlsRef.current = imageUrlsRef.current.filter((url) => url !== image.url)
      }
      return current.filter((item) => item.id !== id)
    })
  }

  const numericBudget = Number(budget) || 0

  const hasRoomImage = totalImages > 0

  const hasGeneratedWork = Boolean(existingProject && (existingProject.generatedImages?.length || existingProject.generatedImageUrl))
  const changesInvalidateResults = Boolean(existingProject) && (
    roomImages.length > 0
    || removedImageIds.length > 0
    || style !== existingProject.style
    || roomType !== existingProject.roomType
    || numericBudget !== existingProject.budget
    || ['width', 'length', 'height'].some((field) => String(dimensions[field] ?? '') !== String(existingProject.dimensions?.[field] ?? ''))
  )

  function handleSubmit(event) {
    event.preventDefault()
    if (!hasRoomImage || !projectName.trim() || numericBudget < MIN_BUDGET) return
    if (hasGeneratedWork && changesInvalidateResults) {
      setShowResetNotice(true)
      return
    }
    saveProject(false)
  }

  async function saveProject(resetResults) {
    setShowResetNotice(false)
    setIsSaving(true)
    setSaveError('')

    const payload = {
      name: projectName.trim(),
      roomType,
      style,
      budget: numericBudget,
      dimensions,
      notes: notes.trim(),
      hasRoomImage: true,
    }

    try {
      if (existingProject) {
        await saveProjectImages(existingProject.id, roomImages.map((image) => image.file))
        await deleteProjectImagesByPath(existingImages.filter((image) => removedImageIds.includes(image.id)).map((image) => image.path))
        await updateProject(existingProject.id, resetResults ? {
          ...payload,
          generatedImageUrl: null,
          decisions: withWorkflowData({}, { generatedImages: [], detectedObjects: [], plannedProducts: [] }),
          productSelections: {},
          estimatedTotal: null,
          stage: 'room-input',
          status: 'in-progress',
          progress: 16,
        } : payload)
        // The results are gone from the project; drop their pictures too (after the row, so a failure only leaves harmless files).
        if (resetResults) await deleteGeneratedImages(existingProject.id).catch(() => {})
        navigate(`/project/${existingProject.id}`)
        return
      }

      const project = await addProject({ ...payload, requirements: [] })
      await saveProjectImages(project.id, roomImages.map((image) => image.file))
      navigate(`/project/${project.id}`)
    } catch {
      setSaveError('บันทึกภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setIsSaving(false)
    }
  }

  const dimensionErrors = {
    width: getDimensionError('width', dimensions.width),
    length: getDimensionError('length', dimensions.length),
    height: getDimensionError('height', dimensions.height),
  }
  const hasDimensionError = Boolean(dimensionErrors.width || dimensionErrors.length || dimensionErrors.height)
  const hasValidSize = Boolean(dimensions.width && dimensions.length) && !hasDimensionError

  const canContinue = activeStep === 0
    ? Boolean(projectName.trim() && hasRoomImage && hasValidSize)
    : numericBudget >= 100

  function continueFlow() {
    if (!canContinue) return
    setActiveStep((current) => Math.min(current + 1, CREATE_STEPS.length - 1))
  }

  if (isLoadingProject) {
    return <div className="project-shell"><main className="project-content"><p>กำลังโหลดโปรเจกต์...</p></main></div>
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
                <span>01</span>
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
                <span>02</span>
                <div><h2>อัปโหลดภาพห้องเปล่า</h2><p>ใช้ภาพของห้องเดียวกันคนละมุม (สูงสุด {MAX_ROOM_IMAGES} ภาพ) ภาพแรกเป็นมุมหลักที่ใช้ตัดสินใจและเลือกสินค้า</p></div>
              </div>

              <label
                className={`project-dropzone ${totalImages ? 'has-images' : ''} ${totalImages >= MAX_ROOM_IMAGES ? 'is-disabled' : ''}`.trim()}
                htmlFor="project-room-image"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (totalImages >= MAX_ROOM_IMAGES) return
                  selectFiles(event.dataTransfer.files)
                }}
              >
                {totalImages >= MAX_ROOM_IMAGES ? (
                  <div className="project-upload-summary">
                    <span className="project-upload-icon"><Icon name="image" size={25} /></span>
                    <div><strong>ครบจำนวนสูงสุดแล้ว</strong><small>อัปโหลดได้สูงสุด {MAX_ROOM_IMAGES} ภาพต่อโปรเจกต์ · ลบภาพเดิมเพื่อเพิ่มใหม่</small></div>
                  </div>
                ) : totalImages ? (
                  <div className="project-upload-summary">
                    <span className="project-upload-icon"><Icon name="upload" size={25} /></span>
                    <div><strong>เพิ่มภาพมุมอื่นของห้องนี้</strong><small>ขณะนี้มี {totalImages}/{MAX_ROOM_IMAGES} มุม</small></div>
                    <span className="project-upload-cta">เพิ่มภาพ</span>
                  </div>
                ) : (
                  <>
                    <span className="project-upload-icon"><Icon name="upload" size={25} /></span>
                    <strong>ลากภาพมาวาง หรือคลิกเพื่อเลือกไฟล์</strong>
                    <small>เลือกหลายไฟล์ได้ · รองรับ JPG, PNG หรือ WEBP ไม่เกิน 10 MB ต่อภาพ (สูงสุด {MAX_ROOM_IMAGES} ภาพ)</small>
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
                disabled={totalImages >= MAX_ROOM_IMAGES}
                onChange={(event) => {
                  selectFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              {imageLimitNotice ? <p className="project-upload-notice">{imageLimitNotice}</p> : null}

              {totalImages ? (
                <div className="project-image-grid" aria-label={`ภาพห้องที่เลือก ${totalImages} ภาพ`}>
                  {keptExistingImages.map((image, index) => (
                    <figure className="project-image-card" key={image.id}>
                      <img src={image.url} alt={`ภาพมุม ${index + 1}`} />
                      <figcaption><span>มุม {String(index + 1).padStart(2, '0')}{index === 0 ? ' · มุมหลัก' : ''}</span><small>ภาพเดิม</small></figcaption>
                      <button type="button" onClick={() => removeExistingImage(image.id)} aria-label={`ลบภาพมุม ${index + 1}`}>×</button>
                    </figure>
                  ))}
                  {roomImages.map((image, index) => (
                    <figure className="project-image-card" key={image.id}>
                      <img src={image.url} alt={`ภาพมุม ${keptExistingImages.length + index + 1}`} />
                      <figcaption><span>มุม {String(keptExistingImages.length + index + 1).padStart(2, '0')}{keptExistingImages.length + index === 0 ? ' · มุมหลัก' : ''}</span><small>{image.file.name}</small></figcaption>
                      <button type="button" onClick={() => removeImage(image.id)} aria-label={`ลบภาพมุม ${keptExistingImages.length + index + 1}`}>×</button>
                    </figure>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={`project-section ${activeStep === 0 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>03</span>
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
                {[
                  { field: 'width', label: 'ความกว้าง', required: true, placeholder: '3.0' },
                  { field: 'length', label: 'ความยาว', required: true, placeholder: '4.0' },
                  { field: 'height', label: 'ความสูง', required: false, placeholder: '2.6' },
                ].map(({ field, label, required, placeholder }) => (
                  <label key={field}>
                    <span>{label} {required ? <b>*</b> : <small>(ไม่บังคับ)</small>}</span>
                    <span className="project-input-unit">
                      <input
                        type="number"
                        min={DIMENSION_LIMITS[field].min}
                        max={DIMENSION_LIMITS[field].max}
                        step="0.1"
                        inputMode="decimal"
                        value={dimensions[field]}
                        onChange={(event) => setDimensions((current) => ({ ...current, [field]: event.target.value }))}
                        placeholder={placeholder}
                        aria-invalid={dimensionErrors[field] ? 'true' : undefined}
                      />
                      <i>ม.</i>
                    </span>
                    {dimensionErrors[field] ? <em className="project-field-error" role="alert">{dimensionErrors[field]}</em> : null}
                  </label>
                ))}
              </div>
              <p className="project-field-note">ขนาดจริงของห้องช่วยให้ AI จัดเฟอร์นิเจอร์และเลือกสินค้าให้พอดีกับพื้นที่ — ภาพถ่ายบอกขนาดจริงไม่ได้ กรุณากรอกค่าที่วัดได้จริง</p>
            </section>

            <section className={`project-section ${activeStep === 1 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading project-style-heading">
                <span>04</span>
                <div><h2>สไตล์ที่เข้ากับห้อง</h2><p>AI อ่านภาพต้นฉบับและสุ่มแนวทางที่เหมาะกับพื้นที่จริง</p></div>
                <button
                  type="button"
                  onClick={() => setStyleShuffleRound((current) => current + 1)}
                  disabled={isAnalyzingStyles || (!roomImages.length && !existingImageUrl)}
                >
                  {isAnalyzingStyles ? 'กำลังวิเคราะห์...' : '↻ สุ่มชุดใหม่จากภาพ'}
                </button>
              </div>

              <div className={`project-style-ai-status ${isAnalyzingStyles ? 'is-loading' : ''}`.trim()}>
                <span>AI STYLE MIX</span>
                <p>{isAnalyzingStyles ? 'กำลังอ่านแสง สี วัสดุ และสัดส่วนจากภาพต้นฉบับ...' : styleAnalysis}</p>
                {styleAnalysisError ? <small>{styleAnalysisError}</small> : null}
              </div>

              <fieldset className="project-fieldset">
                <legend className="sr-only">เลือกสไตล์</legend>
                <div className="project-style-grid">
                  {styleOptions.map((item, index) => (
                    <label className={`project-style-card ${style === item.value ? 'is-selected' : ''}`.trim()} key={item.value}>
                      <input type="radio" name="style" value={item.value} checked={style === item.value} onChange={() => setStyle(item.value)} />
                      <span className="project-style-visual" aria-hidden="true">
                        <i className="is-primary" style={{ background: item.palette[0] }} />
                        <span><i style={{ background: item.palette[1] }} /><i style={{ background: item.palette[2] }} /></span>
                        <b>{String(index + 1).padStart(2, '0')}</b>
                        {item.fit ? <em>{item.fit}% FIT</em> : null}
                        {item.isAiStyled ? <span className="project-style-ai-badge" title="สี/วัสดุนี้วิเคราะห์จากภาพห้องจริงของคุณ">AI</span> : null}
                      </span>
                      <span className="project-style-copy">
                        <strong>{item.label}</strong>
                        <small>{item.aiReason || item.description}</small>
                      </span>
                      <span className="project-style-materials" aria-hidden="true">{item.materials.map((material) => <i key={material}>{material}</i>)}</span>
                      {style === item.value ? <span className="project-style-check"><Icon name="check" size={12} /></span> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className={`project-section ${activeStep === 1 ? '' : 'is-hidden'}`}>
              <div className="project-section-heading">
                <span>05</span>
                <div><h2>งบประมาณ</h2><p>ระบบจะใช้ยอดนี้เป็นข้อจำกัดในการเลือกชุดสินค้า</p></div>
              </div>

              <div className="project-budget-card">
                <label htmlFor="project-budget-input">งบประมาณสูงสุด</label>
                <div className="project-budget-input-wrap">
                  <span>฿</span>
                  <input
                    id="project-budget-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={budget === '' ? '' : new Intl.NumberFormat('th-TH').format(budget)}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 7)
                      setBudget(digits === '' ? '' : Math.min(MAX_BUDGET, Number(digits)))
                    }}
                    onBlur={() => setBudget((current) => Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, Number(current) || MIN_BUDGET)))}
                    aria-describedby="project-budget-help"
                  />
                  <div className="project-budget-side">
                    <div className="project-budget-stepper">
                      <button type="button" aria-label="เพิ่มงบ 1,000 บาท" onClick={() => setBudget((current) => Math.min(MAX_BUDGET, (Number(current) || 0) + BUDGET_STEP))}>▲</button>
                      <button type="button" aria-label="ลดงบ 1,000 บาท" onClick={() => setBudget((current) => Math.max(MIN_BUDGET, (Number(current) || 0) - BUDGET_STEP))}>▼</button>
                    </div>
                    <i>บาท</i>
                  </div>
                </div>
                <div className="project-budget-help" id="project-budget-help"><span>฿{new Intl.NumberFormat('th-TH').format(MIN_BUDGET)} – ฿{new Intl.NumberFormat('th-TH').format(MAX_BUDGET)}</span><span>ใช้สำหรับคัดสินค้าที่อยู่ในงบ</span></div>
              </div>
            </section>

            <footer className="project-form-footer">
              <div><strong>{saveError || `ขั้นตอน ${activeStep + 1} จาก ${CREATE_STEPS.length}`}</strong><span>{saveError ? 'ไฟล์เดิมยังอยู่ในหน้านี้' : CREATE_STEPS[activeStep].detail}</span></div>
              <div className="project-footer-actions">
                {activeStep > 0 ? <button className="project-back-button" type="button" onClick={() => setActiveStep((current) => current - 1)}>ย้อนกลับ</button> : null}
                {activeStep < CREATE_STEPS.length - 1 ? <button className="project-next-button" type="button" onClick={continueFlow} disabled={!canContinue}>ไปต่อ <Icon name="arrow" size={18} /></button> : <button className="project-next-button" type="submit" disabled={!hasRoomImage || !projectName.trim() || !hasValidSize || numericBudget < MIN_BUDGET || isSaving}>{isSaving ? 'กำลังบันทึกภาพ...' : existingProject ? 'บันทึกการแก้ไข' : 'สร้างโปรเจกต์และไปต่อ'} {!isSaving ? <Icon name="arrow" size={18} /> : null}</button>}
              </div>
            </footer>
          </form>
        </main>
      </div>

      {showResetNotice ? (
        <div className="project-modal-backdrop" onClick={() => setShowResetNotice(false)}>
          <div className="project-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <strong>การแก้ไขนี้จะล้างผล AI เดิม</strong>
            <p>คุณแก้รูปห้อง ขนาดห้อง สไตล์ งบ หรือประเภทห้อง ภาพ AI ที่สร้างไว้ ผลตัดสินใจ และสินค้าที่เลือก จะถูกล้างเพื่อให้ตรงกับค่าใหม่ ต้อง Generate ใหม่อีกครั้ง</p>
            <div className="project-modal-actions">
              <button type="button" onClick={() => setShowResetNotice(false)}>ยกเลิก</button>
              <button type="button" className="is-danger" onClick={() => saveProject(true)}>บันทึกและล้างผลเดิม</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default CreateProjectPage
