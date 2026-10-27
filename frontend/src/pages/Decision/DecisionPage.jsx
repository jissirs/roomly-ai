import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getObjectDecisions, getProject, getRoomDesigns, getWorkflowData, updateProject, withWorkflowData } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import { api } from '../../lib/api'
import { fitFrameStyle, naturalRatio } from '../../lib/imageLayout'
import { appendRoomSize } from '../../lib/productPlan'
import { fetchLivePrices } from '../../lib/livePrices'
import { REAL_PRODUCT_CATALOG } from '../../data/realProductCatalog'
import decisionRoom from '../../assets/steps/ai-decisions.png'
import './DecisionPage.css'
import './DecisionOverlay.css'

const ACTION_LABELS = { remove: 'ลบ', replace: 'เปลี่ยน' }

// What the picture currently shows for an object: the action of the latest
// AI edit on it that is still applied (derived from the saved history, so it
// survives a reload).
function lastAppliedAction(room, objectId) {
  return [...(room?.history ?? [])].reverse().find((entry) => entry.objectId === objectId)?.action ?? null
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

// What "the saved choices" mean for change detection: the decisions plus the
// briefs of objects that are actually set to REPLACE (a leftover brief of an
// object switched back to KEEP is not a change).
function choicesSnapshot(decisionMap, briefs) {
  const replaceBriefs = Object.fromEntries(Object.entries(briefs ?? {}).filter(([objectId]) => decisionMap[objectId] === 'replace'))
  return stableJson([decisionMap, replaceBriefs])
}

function priceOfObject(item, livePrices) {
  const productId = item.shownProductId ?? item.realProduct?.productId
  if (!productId) return item.price
  return livePrices[productId]?.price ?? (item.shownProductId ? REAL_PRODUCT_CATALOG.find((product) => product.id === productId)?.price : null) ?? item.price
}

const DECISIONS = [
  { id: 'keep', label: 'KEEP', detail: 'เก็บชิ้นนี้ไว้ในแบบ', icon: '✓' },
  { id: 'replace', label: 'REPLACE', detail: 'หาสินค้าชิ้นใหม่มาแทน', icon: '↻' },
  { id: 'remove', label: 'REMOVE', detail: 'นำออกเพื่อคืนพื้นที่และงบ', icon: '−' },
]

// Maps GPT's free-text category/id guess to the category slugs productPlan.js
// used when it picked real catalog items to furnish the room with, so the
// Decision page can show the item's actual real price instead of a guess.
const CATEGORY_ALIASES = {
  sofa: 'sofa', couch: 'sofa', sectional: 'sofa',
  table: 'coffee-table', 'coffee-table': 'coffee-table', coffeetable: 'coffee-table',
  chair: 'chair', armchair: 'chair', 'accent-chair': 'chair', 'dining-chair': 'chair',
  rug: 'rug', carpet: 'rug',
  television: 'television', tv: 'television',
  lamp: 'lamp', lighting: 'lamp', 'floor-lamp': 'lamp', 'table-lamp': 'lamp',
  curtain: 'curtain', curtains: 'curtain', drape: 'curtain', drapes: 'curtain',
  plant: 'plant', plants: 'plant', decoration: 'plant', 'decor': 'plant',
  bed: 'bed',
  nightstand: 'nightstand', 'bedside-table': 'nightstand',
  mirror: 'mirror',
  desk: 'desk',
  shelf: 'shelf', shelving: 'shelf', bookshelf: 'shelf', 'book-shelf': 'shelf',
  cabinet: 'cabinet', wardrobe: 'cabinet', closet: 'cabinet',
}

function normalizeCategory(value) {
  const key = String(value || '').toLowerCase().trim().replace(/\s+/g, '-')
  return CATEGORY_ALIASES[key] ?? key
}

// Attaches the real catalog product (and its real scraped price) that was
// actually placed in the AI-generated image for this item's category, so
// the Decision page shows a real price instead of GPT's rough guess.
function withRealPrice(item, plannedByCategory, catalogById, used) {
  if (item.realProduct?.productId) {
    used?.add(item.realProduct.productId)
    return item
  }
  const planned = plannedByCategory[normalizeCategory(item.category)] ?? plannedByCategory[normalizeCategory(item.id)]
  if (!planned || used?.has(planned.productId)) return item
  used?.add(planned.productId)
  const product = catalogById[planned.productId]
  if (!product) return { ...item, price: planned.price }
  return {
    ...item,
    price: planned.price,
    realProduct: { productId: planned.productId, name: product.name, store: product.store, url: product.url, price: product.price },
  }
}

const SCORE_LABELS = ['Function', 'Space', 'Budget', 'Style', 'Availability']
const SCORE_MAX = [30, 25, 20, 15, 10]
const DEFAULT_SCORES = { score: 0, scores: [0, 0, 0, 0, 0], reason: 'กำลังวิเคราะห์...' }

// Prefers the AI's traced silhouette; falls back to a plain rectangle
// around (x, y) for items with no usable outline (e.g. detection error).
function getObjectOutline(item) {
  if (Array.isArray(item.outline) && item.outline.length >= 3) return item.outline
  const xMin = item.box_x_min ?? Math.max(0, item.x - 12)
  const xMax = item.box_x_max ?? Math.min(100, item.x + 12)
  const yMin = item.box_y_min ?? Math.max(0, item.y - 15)
  const yMax = item.box_y_max ?? Math.min(100, item.y + 15)
  return [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]]
}

function getObjectOutlines(item) {
  if (Array.isArray(item.outlines) && item.outlines.length) {
    const valid = item.outlines.filter((outline) => Array.isArray(outline) && outline.length >= 3)
    if (valid.length) return valid
  }
  return [getObjectOutline(item)]
}

// Bounding box of the outline — used to place the decision badge at a
// corner of the shape.
function getObjectBox(item) {
  const points = getObjectOutlines(item).flat()
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) }
}

function getSuggestedDecisions(items) {
  return Object.fromEntries(items.map((item) => [
    item.id,
    DECISIONS.some((option) => option.id === item.decision) ? item.decision : 'keep',
  ]))
}

const DECISION_ICON_PATHS = {
  keep: <path d="M5 12.5 10 17 19 7" />,
  replace: <>
    <path d="M17 2.5 21 6.5 17 10.5" />
    <path d="M3 12.5v-1.5a4 4 0 0 1 4-4h14" />
    <path d="M7 21.5 3 17.5 7 13.5" />
    <path d="M21 11.5v1.5a4 4 0 0 1-4 4H3" />
  </>,
  remove: <path d="M5 12.5h14" />,
}

function DecisionIcon({ decision, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DECISION_ICON_PATHS[decision] ?? DECISION_ICON_PATHS.keep}
    </svg>
  )
}

function DecisionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [roomDesigns, setRoomDesigns] = useState([])
  const [activeRoomId, setActiveRoomId] = useState('')
  const [objects, setObjects] = useState([])
  const [isDetecting, setIsDetecting] = useState(true)
  const [detectError, setDetectError] = useState('')
  const [activeId, setActiveId] = useState('')
  const [rawDecisions, setDecisions] = useState({})
  const [replacementBriefs, setReplacementBriefs] = useState({})
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [aiError, setAiError] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [imageRatio, setImageRatio] = useState(null)
  const [regenerateError, setRegenerateError] = useState('')
  const [isScoring, setIsScoring] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [livePrices, setLivePrices] = useState({})
  const [syncProgress, setSyncProgress] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle')
  const dirtyRef = useRef(false)
  const baselineRef = useRef('')
  const savingRef = useRef(false)
  const changeVersion = useRef(0)
  const autoSaveTimer = useRef(null)
  const latestRef = useRef({})

  const activeObjectBase = objects.find((item) => item.id === activeId) ?? objects[0]
  const aiSuggestion = aiSuggestions?.[activeObjectBase?.id]
  const activeObject = activeObjectBase
    ? { ...DEFAULT_SCORES, ...activeObjectBase, ...(aiSuggestion ?? {}) }
    : null
  // An object the AI already removed from the picture always counts as REMOVE.
  const decisions = useMemo(() => {
    const removed = objects.filter((item) => item.removedFromImage)
    return removed.length ? { ...rawDecisions, ...Object.fromEntries(removed.map((item) => [item.id, 'remove'])) } : rawDecisions
  }, [rawDecisions, objects])
  // The real product tied to an object (the one it was generated from, or the
  // one put into the picture later): its live store price beats the saved one.
  const priceOf = (item) => priceOfObject(item, livePrices)
  const total = useMemo(() => objects.reduce((sum, item) => {
    if (decisions[item.id] === 'remove') return sum
    if (decisions[item.id] === 'replace') return sum + (Number(replacementBriefs[item.id]?.budget) || priceOfObject(item, livePrices))
    return sum + priceOfObject(item, livePrices)
  }, 0), [objects, decisions, replacementBriefs, livePrices])

  useEffect(() => {
    latestRef.current = { project, decisions, replacementBriefs, objects, roomDesigns, total }
  })

  // Saves the user's Keep/Replace/Remove choices (and replacement briefs) without
  // them having to press a button.
  function buildDecisions(baseProject, decisionState, briefs, patch) {
    return withWorkflowData(
      { ...decisionState, __replacementBriefs: briefs, __workflow: getWorkflowData(baseProject?.decisions) },
      patch,
    )
  }

  async function persistDecisions() {
    const latest = latestRef.current
    if (!latest.project || !dirtyRef.current) return true
    if (!latest.roomDesigns.length) return true
    const version = changeVersion.current
    const snapshot = choicesSnapshot(latest.decisions, latest.replacementBriefs)
    if (snapshot === baselineRef.current) {
      if (version === changeVersion.current) dirtyRef.current = false
      setAutoSaveStatus('idle')
      return true
    }
    setAutoSaveStatus('saving')
    try {
      const reopen = ['summary', 'product-matching', 'saved'].includes(latest.project.stage)
      const updated = await updateProject(latest.project.id, {
        decisions: buildDecisions(latest.project, latest.decisions, latest.replacementBriefs, { generatedImages: latest.roomDesigns, detectedObjects: latest.objects }),
        estimatedTotal: latest.total,
        ...(reopen ? { stage: 'object-decision', status: 'in-progress', progress: 67 } : {}),
      })
      baselineRef.current = snapshot
      if (version === changeVersion.current) dirtyRef.current = false
      setProject(updated)
      setAutoSaveStatus('saved')
      return true
    } catch {
      setAutoSaveStatus('error')
      return false
    }
  }

  useEffect(() => {
    if (!dirtyRef.current) return undefined
    setAutoSaveStatus('pending')
    autoSaveTimer.current = setTimeout(() => { persistDecisions() }, 600)
    return () => clearTimeout(autoSaveTimer.current)
  }, [decisions, replacementBriefs])

  const liveProductIds = [...new Set(objects.flatMap((item) => [item.realProduct?.productId, item.shownProductId]).filter(Boolean))].join(',')
  useEffect(() => {
    const products = liveProductIds.split(',').filter(Boolean).map((productId) => REAL_PRODUCT_CATALOG.find((product) => product.id === productId)).filter(Boolean)
    if (!products.length) return
    fetchLivePrices(products).then((result) => setLivePrices((current) => ({ ...current, ...result })))
  }, [liveProductIds])

  useEffect(() => {
    if (!['pending', 'saving', 'error'].includes(autoSaveStatus)) return undefined
    const warn = (event) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [autoSaveStatus])

  const decisionCounts = useMemo(() => objects.reduce((counts, item) => {
    const decision = decisions[item.id] || 'keep'
    counts[decision] += 1
    return counts
  }, { keep: 0, replace: 0, remove: 0 }), [objects, decisions])

  useEffect(() => {
    let cancelled = false

    async function run() {
      const loaded = await getProject(id)
      if (cancelled || !loaded) return
      setProject(loaded)
      // Project data is enough to render the page shell and saved choices.
      // Object detection continues in-place instead of trapping the user on
      // a full-page loading screen while the vision model is working.
      setIsLoading(false)

      const plannedByCategory = Object.fromEntries(
        (loaded.plannedProducts ?? []).map((planned) => [planned.category, planned]),
      )
      const catalogById = Object.fromEntries(REAL_PRODUCT_CATALOG.map((product) => [product.id, product]))
      const usedPlanned = new Set()
      const attachRealPrice = (item) => withRealPrice(item, plannedByCategory, catalogById, usedPlanned)

      let activeObjects = loaded.detectedObjects?.length ? loaded.detectedObjects.map(attachRealPrice) : []
      const detectionErrors = []
      let freshDetection = false
      const savedDecisions = loaded.decisions ?? {}
      const savedObjectDecisions = getObjectDecisions(savedDecisions)
      const savedReplacementBriefs = loaded.replacementBriefs
      const hasSavedDecisions = Object.keys(savedObjectDecisions).length > 0
      if (hasSavedDecisions) setDecisions(savedObjectDecisions)
      if (savedReplacementBriefs) setReplacementBriefs(savedReplacementBriefs)
      baselineRef.current = choicesSnapshot(savedObjectDecisions, savedReplacementBriefs ?? {})

      // Detect against the AI-redesigned photo (has furniture in it), not
      // the original empty room — falls back to the original only if the
      // room hasn't been through AI Generate yet. When both exist, sending
      // the original too lets the AI list only what it actually added,
      // instead of re-listing furniture that was already there.
      const images = await getProjectImages(id).catch(() => [])
      if (cancelled) return
      const designs = getRoomDesigns(loaded, images).filter((room) => room.generatedImageUrl)
      setRoomDesigns(designs)
      // Decisions and product matching use the primary (first) angle only, so a
      // piece of furniture seen from several angles is never counted twice.
      const primaryRoomId = designs[0]?.sourceImageId
      if (primaryRoomId) activeObjects = activeObjects.filter((item) => !item.roomId || item.roomId === primaryRoomId)
      setActiveRoomId(designs[0]?.sourceImageId ?? '')

      if (!activeObjects.length && designs.length) {
        const detectedByRoom = []
        for (const [roomIndex, room] of designs.slice(0, 1).entries()) {
          try {
            const detectResult = await api.post(`/projects/${id}/decisions/detect`, {
              image_url: room.generatedImageUrl,
              original_image_url: room.sourceImageUrl,
            })
            detectResult.objects?.forEach((item, itemIndex) => detectedByRoom.push({
              ...attachRealPrice(item),
              id: `${room.sourceImageId}:${item.id}:${itemIndex}`,
              sourceObjectId: item.id,
              roomId: room.sourceImageId,
              roomNumber: roomIndex + 1,
            }))
          } catch (err) {
            detectionErrors.push(`มุมหลัก: ${err.message || 'ตรวจจับไม่สำเร็จ'}`)
          }
          if (cancelled) return
        }
        if (detectedByRoom.length) {
          activeObjects = detectedByRoom
          freshDetection = true
        }
        if (detectionErrors.length) setDetectError(detectionErrors.join(' · '))
      }

      if (!activeObjects.length && designs.length && !detectionErrors.length) {
        setDetectError('AI ยังไม่พบวัตถุใหม่ที่มั่นใจเพียงพอ ระบบจึงไม่วาด Selection ที่อาจผิดตำแหน่ง')
      }
      if (activeObjects.length) setIsScoring(true)
      setObjects(activeObjects)
      setActiveId(activeObjects[0]?.id ?? '')
      if (!hasSavedDecisions) setDecisions(Object.fromEntries(activeObjects.map((item) => [item.id, 'keep'])))
      setIsDetecting(false)

      if (!activeObjects.length) return

      // Detection and AI scores are cached on the project so reopening this page
      // does not pay for them again. The cache is only reused when nothing that
      // feeds the scoring has changed.
      const scoreKey = JSON.stringify([
        loaded.roomType, loaded.style, loaded.budget, loaded.dimensions ?? null, loaded.requirements ?? [], loaded.aiInstructions ?? '',
        activeObjects.map((item) => [item.id, item.name, item.category, item.price]),
      ])
      const applySuggestions = (list) => {
        setAiSuggestions(Object.fromEntries(list.map((item) => [item.id, item])))
        if (!hasSavedDecisions) setDecisions(getSuggestedDecisions(list))
      }
      const writeCache = async (aiScores) => {
        try {
          const current = await getProject(id)
          if (!current) return
          const updated = await updateProject(id, {
            decisions: withWorkflowData(current.decisions ?? {}, { detectedObjects: activeObjects, ...(aiScores ? { aiScores } : {}) }),
          })
          if (!cancelled) setProject(updated)
        } catch {
          // cache only — the page works without it
        }
      }

      if (loaded.aiScores?.key === scoreKey) {
        applySuggestions(loaded.aiScores.objects)
        setIsScoring(false)
        if (freshDetection) await writeCache(null)
        return
      }

      let freshScores = null
      try {
        const suggestResult = await api.post(`/projects/${id}/decisions/suggest`, {
          room_type: loaded.roomType,
          style: loaded.style,
          budget: loaded.budget,
          dimensions: loaded.dimensions || null,
          requirements: loaded.requirements?.length ? loaded.requirements : null,
          ai_instructions: loaded.aiInstructions || null,
          detected_objects: activeObjects.map((item) => ({ id: item.id, name: item.name, category: item.category, price: item.price })),
        })
        if (!cancelled) {
          applySuggestions(suggestResult.objects)
          freshScores = { key: scoreKey, objects: suggestResult.objects }
        }
      } catch {
        if (!cancelled) setAiError('AI วิเคราะห์คะแนนไม่สำเร็จ')
      } finally {
        if (!cancelled) setIsScoring(false)
      }
      if (!cancelled && (freshScores || freshDetection)) await writeCache(freshScores)
    }

    run().finally(() => {
      if (!cancelled) {
        setIsLoading(false)
        setIsDetecting(false)
      }
    })
    return () => { cancelled = true }
  }, [id])

  if (isLoading) {
    return <main className="decision-missing"><h1>กำลังโหลดโปรเจกต์...</h1></main>
  }

  if (!project) {
    return <main className="decision-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>
  }

  if (!activeObject) {
    return (
      <div className="decision-shell">
        <header className="decision-topbar"><Link to={`/project/${project.id}/result`}>← กลับไปดูผลลัพธ์</Link><span>ROOMLY AI · DECISION</span><button className="decision-save-draft" type="button" disabled>บันทึกร่างและออก</button></header>
        <main className="decision-content"><section className="decision-detection-state"><img src={roomDesigns[0]?.generatedImageUrl || decisionRoom} alt="ภาพห้องที่กำลังตรวจจับวัตถุ" /><div><span>{isDetecting ? 'AI DETECTION IN PROGRESS' : roomDesigns.length ? 'NO RELIABLE DETECTION' : 'NO AI DESIGN YET'}</span><h1>{isDetecting ? 'กำลังตรวจจับวัตถุอย่างละเอียด' : roomDesigns.length ? 'ยังไม่พบวัตถุที่มั่นใจเพียงพอ' : 'ยังไม่มีภาพที่ AI สร้าง'}</h1><p>{isDetecting ? 'ระบบกำลังเทียบภาพต้นฉบับกับภาพ AI และตรวจ mask ก่อนแสดง Selection' : roomDesigns.length ? detectError : 'ต้องให้ AI สร้างแบบห้องก่อน จึงจะเริ่มตัดสินใจเรื่องเฟอร์นิเจอร์ได้'}</p>{!isDetecting ? (roomDesigns.length ? <button type="button" onClick={() => window.location.reload()}>ลองตรวจจับอีกครั้ง</button> : <Link className="decision-detection-link" to={`/project/${project.id}/generate`}>ไปสร้างแบบที่หน้า AI Generate</Link>) : null}</div></section></main>
      </div>
    )
  }

  async function saveAndLeave(patch, path) {
    if (savingRef.current) return
    savingRef.current = true
    clearTimeout(autoSaveTimer.current)
    setIsSaving(true)
    setSaveError('')
    try {
      const savedState = buildDecisions(project, decisions, replacementBriefs, { generatedImages: roomDesigns, detectedObjects: objects })
      await updateProject(project.id, { decisions: savedState, estimatedTotal: total, status: 'in-progress', ...patch })
      dirtyRef.current = false
      baselineRef.current = choicesSnapshot(decisions, replacementBriefs)
      setAutoSaveStatus('idle')
      navigate(path)
    } catch {
      setSaveError('บันทึกไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง ข้อมูลที่เลือกยังอยู่ในหน้านี้')
      savingRef.current = false
      setIsSaving(false)
    }
  }

  function continueToProducts() {
    return saveAndLeave({ stage: 'summary', progress: 84 }, `/project/${project.id}/summary`)
  }

  function saveDraft() {
    return saveAndLeave({ stage: 'object-decision', progress: 67 }, '/home')
  }

  async function leaveTo(event, path) {
    event.preventDefault()
    clearTimeout(autoSaveTimer.current)
    if (dirtyRef.current && !(await persistDecisions())) return
    navigate(path)
  }

  const activeRoom = roomDesigns.find((room) => room.sourceImageId === activeRoomId) ?? roomDesigns[0]
  const visibleObjects = objects.filter((item) => !item.roomId || item.roomId === (activeRoom?.sourceImageId ?? activeRoomId))
  const drawnObjects = visibleObjects.filter((item) => !item.removedFromImage)
  const countedObjects = objects.filter((item) => decisions[item.id] !== 'remove')
  const estimatedCount = countedObjects.filter((item) => !item.realProduct).length
  // Marked Remove for the budget, but still visible in the AI picture.
  const pendingRemovals = objects.filter((item) => decisions[item.id] === 'remove' && !item.removedFromImage).length

  function chooseDecision(decision) {
    if (activeObject.removedFromImage && decision !== 'remove') return
    dirtyRef.current = true
    changeVersion.current += 1
    setDecisions((current) => ({ ...current, [activeObject.id]: decision }))
    if (decision === 'replace' && !replacementBriefs[activeObject.id]) {
      setReplacementBriefs((current) => ({ ...current, [activeObject.id]: { budget: activeObject.price, note: '' } }))
    }
  }

  function updateReplacementBrief(patch) {
    dirtyRef.current = true
    changeVersion.current += 1
    setReplacementBriefs((current) => ({
      ...current,
      [activeObject.id]: { budget: activeObject.price, note: '', ...current[activeObject.id], ...patch },
    }))
  }

  async function saveDesigns(nextDesigns, nextDecisions, extra = {}, nextObjects = objects) {
    const savedState = buildDecisions(project, nextDecisions, replacementBriefs, { generatedImages: nextDesigns, detectedObjects: nextObjects })
    const updated = await updateProject(project.id, {
      decisions: savedState,
      generatedImageUrl: nextDesigns[0]?.generatedImageUrl,
      estimatedTotal: total,
      stage: 'object-decision',
      status: 'in-progress',
      progress: 67,
      ...extra,
    })
    baselineRef.current = choicesSnapshot(nextDecisions, replacementBriefs)
    setRoomDesigns(nextDesigns)
    setObjects(nextObjects)
    setProject(updated)
  }

  // Swap back to an earlier (undo) or undone (redo) image: no AI call, the
  // files are still in Storage.
  async function stepImageHistory(direction) {
    if (!activeRoom) return
    const source = direction === 'undo' ? activeRoom.history ?? [] : activeRoom.future ?? []
    const entry = source[source.length - 1]
    if (!entry) return
    setIsRegenerating(true)
    setRegenerateError('')
    try {
      const rest = source.slice(0, -1)
      const counterpart = {
        imageUrl: activeRoom.generatedImageUrl,
        objectId: entry.objectId,
        objectName: entry.objectName,
        action: entry.action,
        previousDecision: entry.previousDecision,
        appliedProductId: entry.appliedProductId,
        previousShownProductId: entry.previousShownProductId,
      }
      const nextDesigns = roomDesigns.map((room) => room.sourceImageId !== activeRoom.sourceImageId ? room : {
        ...room,
        generatedImageUrl: entry.imageUrl,
        history: direction === 'undo' ? rest : [...(room.history ?? []), counterpart].slice(-10),
        future: direction === 'undo' ? [...(room.future ?? []), counterpart].slice(-10) : rest,
      })
      const nextDecisions = { ...decisions }
      if (direction === 'undo') nextDecisions[entry.objectId] = entry.previousDecision ?? 'keep'
      else nextDecisions[entry.objectId] = entry.action
      setDecisions(nextDecisions)
      const nextObjects = objects.map((item) => {
        if (item.id !== entry.objectId) return item
        let next = item
        if (entry.action === 'remove') next = { ...next, removedFromImage: direction === 'redo' }
        if (entry.appliedProductId !== undefined) next = { ...next, shownProductId: direction === 'redo' ? entry.appliedProductId : (entry.previousShownProductId ?? undefined) }
        return next
      })
      await saveDesigns(nextDesigns, nextDecisions, {}, nextObjects)
      setActiveId(entry.objectId)
    } catch (error) {
      setRegenerateError(error.message || 'ย้อนภาพไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsRegenerating(false)
    }
  }

  async function regenerateSelection() {
    if (!activeRoom?.generatedImageUrl || !activeObject || !['replace', 'remove'].includes(activeDecision)) return
    setIsRegenerating(true)
    setRegenerateError('')
    try {
      const result = await api.post(`/projects/${project.id}/decisions/regenerate`, {
        image_url: activeRoom.generatedImageUrl,
        object_name: activeObject.name,
        category: activeObject.category,
        outlines: getObjectOutlines(activeObject),
        action: activeDecision,
        instruction: activeDecision === 'replace' ? activeReplacementBrief.note : null,
        style: project.style,
        budget: activeDecision === 'replace' ? Number(activeReplacementBrief.budget) || activeObject.price : null,
      })
      const nextDesigns = roomDesigns.map((room) => room.sourceImageId === activeRoom.sourceImageId
        ? {
          ...room,
          generatedImageUrl: result.image_url,
          history: [...(room.history ?? []), {
            imageUrl: room.generatedImageUrl,
            objectId: activeObject.id,
            objectName: activeObject.name,
            action: activeDecision,
            previousDecision: lastAppliedAction(room, activeObject.id) ?? 'keep',
          }].slice(-10),
          future: [],
        }
        : room)
      const nextSelections = { ...(project.productSelections ?? {}) }
      delete nextSelections[activeObject.id]
      const nextObjects = activeDecision === 'remove'
        ? objects.map((item) => item.id === activeObject.id ? { ...item, removedFromImage: true } : item)
        : objects
      await saveDesigns(nextDesigns, decisions, { productSelections: nextSelections }, nextObjects)
    } catch (error) {
      setRegenerateError(error.message || 'สร้างเฉพาะวัตถุนี้ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsRegenerating(false)
    }
  }

  // Other angles are generated to match the primary angle's picture. Once the
  // primary picture changes (Replace / Remove / undo) they no longer match.
  const primaryDesign = roomDesigns[0]
  const otherDesigns = roomDesigns.slice(1)
  const primaryEdited = Boolean(primaryDesign?.history?.length)
  const staleAngles = otherDesigns.filter((room) => (room.syncedWith ? room.syncedWith !== primaryDesign.generatedImageUrl : primaryEdited))

  async function syncOtherAngles() {
    if (isSyncing || !staleAngles.length || !primaryDesign?.generatedImageUrl) return
    setIsSyncing(true)
    setSyncError('')
    let working = roomDesigns
    try {
      for (const [index, room] of staleAngles.entries()) {
        setSyncProgress({ done: index, total: staleAngles.length })
        const query = new URLSearchParams({ style: project.style, budget: String(project.budget) })
        if (project.aiInstructions) query.set('ai_instructions', project.aiInstructions)
        query.set('source_image_url', room.sourceImageUrl)
        query.set('reference_room_url', primaryDesign.generatedImageUrl)
        appendRoomSize(query, project.dimensions)
        const result = await api.post(`/projects/${project.id}/generate?${query}`, {})
        working = working.map((item) => item.sourceImageId === room.sourceImageId
          ? { ...item, generatedImageUrl: result.image_url, syncedWith: primaryDesign.generatedImageUrl }
          : item)
        await saveDesigns(working, decisions)
      }
    } catch (error) {
      setSyncError(error.message || 'อัปเดตมุมอื่นไม่สำเร็จ มุมที่สำเร็จแล้วยังถูกบันทึกไว้ ลองใหม่ได้')
    } finally {
      setIsSyncing(false)
      setSyncProgress(null)
    }
  }

  const activeDecision = decisions[activeObject.id] || 'keep'
  const activeReplacementBrief = replacementBriefs[activeObject.id] ?? { budget: activeObject.price, note: '' }
  const replacedInImage = activeDecision === 'replace' && lastAppliedAction(activeRoom, activeObject.id) === 'replace'
  const shownProduct = activeObject.shownProductId ? REAL_PRODUCT_CATALOG.find((product) => product.id === activeObject.shownProductId) : null
  const undoEntry = activeRoom?.history?.[activeRoom.history.length - 1]
  const redoEntry = activeRoom?.future?.[activeRoom.future.length - 1]
  const activeContribution = activeDecision === 'remove'
    ? 0
    : activeDecision === 'replace'
      ? Number(activeReplacementBrief.budget) || activeObject.price
      : activeObject.price
  const maxReplacementBudget = Math.max(100, project.budget - (total - activeContribution))
  const isOverBudget = total > project.budget

  return (
    <div className="decision-shell">
      <header className="decision-topbar">
        <Link to={`/project/${project.id}/result`} onClick={(event) => leaveTo(event, `/project/${project.id}/result`)}>← กลับไปดูผลลัพธ์</Link>
        <span>ROOMLY AI · DECISION</span>
        <div className="decision-topbar-actions">
          {autoSaveStatus !== 'idle' ? (
            <small className={`decision-autosave is-${autoSaveStatus}`} role="status">
              {autoSaveStatus === 'error' ? 'บันทึกอัตโนมัติไม่สำเร็จ' : autoSaveStatus === 'saved' ? 'บันทึกอัตโนมัติแล้ว' : 'กำลังบันทึก...'}
            </small>
          ) : null}
          <button className="decision-save-draft" type="button" disabled={isRegenerating || isSaving || isSyncing} onClick={saveDraft}>บันทึกร่างและออก</button>
        </div>
      </header>

      <main className="decision-content">
        <header className="decision-heading">
          <div><p>04 · OBJECT DECISION</p><h1>เลือกสิ่งที่ควรเก็บ เปลี่ยน หรือนำออก</h1><span>กดกรอบไฮไลต์บนภาพหรือเลือกรายการด้านล่าง ระบบจะแสดงคะแนนและเหตุผลประกอบ</span></div>
          <div className={`decision-budget ${isOverBudget ? 'is-over' : ''}`.trim()}><span>HARD BUDGET LIMIT</span><strong>฿{new Intl.NumberFormat('th-TH').format(project.budget)}</strong><small>ห้ามเกินแม้แต่ ฿1</small></div>
        </header>

        <section className="decision-overview" aria-label="สรุปการตัดสินใจ">
          <div><span>ทั้งหมด</span><strong>{objects.length}</strong><small>รายการ</small></div>
          <div className="is-keep"><span>เก็บไว้</span><strong>{decisionCounts.keep}</strong><small>KEEP</small></div>
          <div className="is-replace"><span>เปลี่ยนใหม่</span><strong>{decisionCounts.replace}</strong><small>REPLACE</small></div>
          <div className="is-remove"><span>นำออก</span><strong>{decisionCounts.remove}</strong><small>REMOVE</small></div>
        </section>

        {roomDesigns.length > 1 ? (
          <div className="decision-angle-note" role="status">
            <p>
              ตัดสินใจและเลือกสินค้าจากมุมหลัก (มุมที่ 1)
              {staleAngles.length
                ? ` · มุมอื่น ${staleAngles.length} จาก ${otherDesigns.length} มุมยังไม่ตรงกับมุมหลักที่แก้แล้ว`
                : ` · มุมอื่นอีก ${otherDesigns.length} มุมตรงกับมุมหลักแล้ว`}
            </p>
            {staleAngles.length ? (
              <button type="button" disabled={isSyncing || isRegenerating || isSaving} onClick={syncOtherAngles}>
                {isSyncing && syncProgress ? `กำลังอัปเดตมุมอื่น ${syncProgress.done + 1}/${syncProgress.total}...` : `อัปเดตมุมอื่นให้ตรงกัน (ใช้เครดิต AI ${staleAngles.length} ครั้ง)`}
              </button>
            ) : null}
            {syncError ? <small role="alert">{syncError}</small> : null}
          </div>
        ) : null}

        <section className="decision-workspace">
          <div className="decision-visual" style={fitFrameStyle(imageRatio, 82)}>
            <img src={activeRoom?.generatedImageUrl || decisionRoom} onLoad={(event) => setImageRatio(naturalRatio(event))} alt="ภาพห้องพร้อมจุดเลือกเฟอร์นิเจอร์" />
            {isRegenerating ? <div className="decision-regenerating" role="status"><span /><strong>AI กำลังแก้เฉพาะวัตถุที่เลือก</strong><small>ส่วนอื่นของห้องจะคงเดิม</small></div> : null}
            <svg className="decision-outline-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {drawnObjects.map((item) => {
                const decision = decisions[item.id] || 'keep'
                return (
                  <g key={item.id}>
                    {getObjectOutlines(item).map((points, outlineIndex) => (
                      <polygon
                        className={`decision-outline-shape is-${decision} ${activeId === item.id ? 'is-active' : ''}`}
                        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                        onClick={() => setActiveId(item.id)}
                        key={`${item.id}-${outlineIndex}`}
                      />
                    ))}
                  </g>
                )
              })}
            </svg>
            {drawnObjects.map((item) => {
              const decision = decisions[item.id] || 'keep'
              const box = getObjectBox(item)
              return (
                <button
                  className={`decision-hotspot is-${decision} ${activeId === item.id ? 'is-active' : ''}`}
                  style={{ left: `${box.xMax}%`, top: `${box.yMin}%` }}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  aria-label={`เลือก ${item.name} (${decision})`}
                  key={item.id}
                >
                  <DecisionIcon decision={decision} />
                </button>
              )
            })}
            {(activeRoom?.history?.length || activeRoom?.future?.length) ? (
              <div className="decision-image-history" role="group" aria-label="ย้อนประวัติภาพ">
                <button type="button" disabled={isRegenerating || isSyncing || !activeRoom.history?.length} onClick={() => stepImageHistory('undo')} title={undoEntry ? `ย้อนการ${ACTION_LABELS[undoEntry.action] ?? 'แก้'} “${undoEntry.objectName}” กลับไปภาพก่อนหน้า ไม่เสียเครดิต AI` : 'กลับไปภาพก่อนหน้า ไม่เสียเครดิต AI'}>
                  ↶ เลิกทำ{activeRoom.history?.length ? ` (${activeRoom.history.length})` : ''}
                </button>
                <button type="button" disabled={isRegenerating || isSyncing || !activeRoom.future?.length} onClick={() => stepImageHistory('redo')} title={redoEntry ? `ทำซ้ำการ${ACTION_LABELS[redoEntry.action] ?? 'แก้'} “${redoEntry.objectName}” ไม่เสียเครดิต AI` : 'ทำซ้ำภาพที่เลิกทำไป ไม่เสียเครดิต AI'}>
                  ↷ ทำซ้ำ{activeRoom.future?.length ? ` (${activeRoom.future.length})` : ''}
                </button>
                <small className="decision-history-hint">{undoEntry ? `ล่าสุด: ${ACTION_LABELS[undoEntry.action] ?? 'แก้'} ${undoEntry.objectName}` : redoEntry ? `ทำซ้ำได้: ${ACTION_LABELS[redoEntry.action] ?? 'แก้'} ${redoEntry.objectName}` : ''}</small>
              </div>
            ) : null}
            <span className="decision-demo-label">AI DETECTED{aiSuggestions ? ' · AI SCORED' : ''}</span>
          </div>

          <aside className={`decision-panel is-${activeDecision}`}>
            <div className="decision-object-title">
              <span>{activeObject.category}</span>
              <small>รายการ {visibleObjects.findIndex((item) => item.id === activeObject.id) + 1} / {visibleObjects.length}</small>
              <h2>{activeObject.name}</h2>
              {shownProduct ? (
                <p className="decision-real-price">
                  ภาพ AI ใช้สินค้าจริงที่เลือกแล้ว · {livePrices[shownProduct.id]?.price ? 'ราคาสด' : 'ราคา'} ฿{new Intl.NumberFormat('th-TH').format(priceOf(activeObject))}
                  <span className="decision-real-price-source">{shownProduct.store} · {shownProduct.name}</span>
                </p>
              ) : replacedInImage ? (
                <p className="decision-real-price">
                  AI เปลี่ยนชิ้นนี้ในภาพแล้ว · งบ ฿{new Intl.NumberFormat('th-TH').format(Number(activeReplacementBrief.budget) || activeObject.price)}
                  <span className="decision-real-price-source">สินค้าจริงจะถูกจับคู่ใหม่ในขั้นตอนถัดไป</span>
                </p>
              ) : activeObject.realProduct ? (
                <p className="decision-real-price">
                  {livePrices[activeObject.realProduct?.productId]?.price ? 'ราคาสดจากร้านค้า' : 'ราคาจริง'} ฿{new Intl.NumberFormat('th-TH').format(priceOf(activeObject))}
                  {activeObject.realProduct.url ? (
                    <a className="decision-real-price-source" href={activeObject.realProduct.url} target="_blank" rel="noreferrer">
                      {activeObject.realProduct.store} · {activeObject.realProduct.name}
                    </a>
                  ) : (
                    <span className="decision-real-price-source">{activeObject.realProduct.store} · {activeObject.realProduct.name}</span>
                  )}
                </p>
              ) : (
                <p>ราคาประเมิน ฿{new Intl.NumberFormat('th-TH').format(activeObject.price)}</p>
              )}
            </div>

            <div className="decision-score-summary"><div><strong>{aiSuggestion ? activeObject.score : '–'}</strong><span>/ 100</span></div><p>{aiSuggestion ? activeObject.reason : isScoring ? 'กำลังวิเคราะห์...' : 'ยังไม่มีคะแนนจาก AI ตอนนี้ คุณตัดสินใจเองได้เลย'}</p>{detectError || aiError ? <small className="decision-ai-error">{detectError || aiError}</small> : null}</div>

            {aiSuggestion ? <div className="decision-score-list">
              {SCORE_LABELS.map((label, index) => (
                <div key={label}><span>{label}</span><i><b style={{ width: `${(activeObject.scores[index] / SCORE_MAX[index]) * 100}%` }} /></i><strong>{activeObject.scores[index]}/{SCORE_MAX[index]}</strong></div>
              ))}
            </div> : null}

            <fieldset className="decision-options">
              <legend>การตัดสินใจของคุณ</legend>
              {DECISIONS.map((option) => {
                const locked = Boolean(activeObject.removedFromImage) && option.id !== 'remove'
                return (
                <label className={`${decisions[activeObject.id] === option.id ? `is-selected is-${option.id}` : ''} ${locked ? 'is-locked' : ''}`.trim()} key={option.id} title={locked ? 'AI ลบชิ้นนี้ออกจากภาพแล้ว กด “เลิกทำ” เหนือภาพถ้าต้องการให้กลับมา' : undefined}>
                  <input type="radio" name={`decision-${activeObject.id}`} checked={decisions[activeObject.id] === option.id} disabled={locked} onChange={() => chooseDecision(option.id)} />
                  <b aria-hidden="true">{option.icon}</b><span><strong>{option.label}</strong><small>{option.detail}</small></span><i />
                </label>
                )
              })}
            </fieldset>

            {activeDecision === 'replace' ? (
              <section className="decision-action-card is-replace" aria-label="รายละเอียดสินค้าทดแทน">
                <div><span>NEXT · PRODUCT MATCH</span><strong>กำหนดโจทย์ของชิ้นใหม่</strong></div>
                <label><span>งบสูงสุดสำหรับชิ้นนี้ · ใช้ได้ไม่เกิน ฿{new Intl.NumberFormat('th-TH').format(maxReplacementBudget)}</span><span className="decision-replace-budget"><b>฿</b><input type="number" min="100" max={maxReplacementBudget} step="100" value={activeReplacementBrief.budget} onChange={(event) => updateReplacementBrief({ budget: event.target.value === '' ? '' : Number(event.target.value) })} onBlur={() => updateReplacementBrief({ budget: Math.min(maxReplacementBudget, Math.max(100, Number(activeReplacementBrief.budget) || 100)) })} /></span></label>
                <label><span>อยากได้แบบไหน</span><textarea rows="2" value={activeReplacementBrief.note} onChange={(event) => updateReplacementBrief({ note: event.target.value })} placeholder="เช่น ขนาดเล็กลง สีไม้สว่าง มีพื้นที่เก็บของ" /></label>
                <p>ระบบจะใช้โจทย์เดียวกันทั้งสร้างภาพเฉพาะชิ้นนี้และค้นหาสินค้าจริงในขั้นถัดไป</p>
                <button className="decision-regenerate-button" type="button" disabled={isRegenerating} onClick={regenerateSelection}>{isRegenerating ? 'กำลังสร้าง...' : '↻ สร้างใหม่เฉพาะชิ้นที่เลือก'}</button>
                {regenerateError ? <small className="decision-regenerate-error" role="alert">{regenerateError}</small> : null}
              </section>
            ) : activeDecision === 'remove' ? (
              <section className="decision-action-card is-remove" aria-label="ผลจากการนำรายการออก">
                <div><span>REMOVE CONFIRMED</span><strong>คืนพื้นที่ให้ห้องมากขึ้น</strong></div>
                <p>รายการนี้จะไม่ถูกส่งไปจับคู่สินค้า และคืนงบประมาณประมาณ <b>฿{new Intl.NumberFormat('th-TH').format(activeObject.price)}</b></p>
                {activeObject.removedFromImage ? <p className="decision-removed-note">AI ลบชิ้นนี้ออกจากภาพแล้ว ถ้าอยากให้กลับมา ให้กด “เลิกทำ” เหนือภาพ</p> : (
                  <button className="decision-regenerate-button is-remove" type="button" disabled={isRegenerating} onClick={regenerateSelection}>{isRegenerating ? 'กำลังลบ...' : '− ลบเฉพาะชิ้นนี้ออกจากภาพ'}</button>
                )}
                {regenerateError ? <small className="decision-regenerate-error" role="alert">{regenerateError}</small> : null}
              </section>
            ) : (
              <section className="decision-action-card is-keep" aria-label="ผลจากการเก็บรายการไว้">
                <div><span>KEEP CONFIRMED</span><strong>คงรายการนี้ไว้ในแบบ</strong></div>
                <p>ไม่ต้องค้นหาสินค้าทดแทน ระบบจะนับราคาประเมินเดิมในงบรวม</p>
              </section>
            )}
          </aside>
        </section>

        <footer className="decision-footer">
          <div><span>ยอดประมาณการใหม่</span><strong>฿{new Intl.NumberFormat('th-TH').format(total)}</strong><small className={total > project.budget ? 'is-over' : ''}>{total <= project.budget ? `เหลืองบ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}` : `เกินงบ ฿${new Intl.NumberFormat('th-TH').format(total - project.budget)}`}</small>{estimatedCount > 0 ? <small className="decision-price-mix">รวมราคาที่ AI ประมาณการ {estimatedCount} ชิ้น</small> : null}</div>
          <p className={isOverBudget || saveError ? 'is-over' : ''} role={saveError ? 'alert' : undefined}>{saveError ? saveError : isOverBudget ? <>ต้องลดอีก <b>฿{new Intl.NumberFormat('th-TH').format(total - project.budget)}</b> ก่อนดำเนินการต่อ</> : <><b>{decisionCounts.replace}</b> รายการรอหาสินค้าทดแทน · <b>{decisionCounts.remove}</b> รายการจะถูกนำออก{pendingRemovals ? <> · <b>{pendingRemovals}</b> ชิ้นยังอยู่ในภาพ AI (เลือกชิ้นนั้นแล้วกด “ลบเฉพาะชิ้นนี้ออกจากภาพ” ถ้าต้องการให้หายจากภาพ)</> : null}</>}</p>
          <button type="button" disabled={isOverBudget || isRegenerating || isSaving || isSyncing} onClick={continueToProducts}>{isOverBudget ? 'ยอดรวมยังเกินงบ' : isRegenerating ? 'รอ AI สร้างภาพให้เสร็จ' : isSaving ? 'กำลังบันทึก...' : 'ยืนยันและไปดูสรุป'} <span>{isOverBudget ? '!' : '→'}</span></button>
        </footer>
      </main>
    </div>
  )
}

export default DecisionPage
