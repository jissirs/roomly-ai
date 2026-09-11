import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getObjectDecisions, getProject, getRoomDesigns, updateProject, withWorkflowData } from '../../lib/projects'
import { getProjectImages } from '../../lib/imageStore'
import { api } from '../../lib/api'
import decisionRoom from '../../assets/steps/ai-decisions.png'
import './DecisionPage.css'
import './DecisionOverlay.css'

// Fallback shown only if there's no room photo yet, or AI detection fails.
// `outline` points are hand-tuned to loosely hug each demo item's silhouette
// (not a plain rectangle) so the fallback looks like the real AI response.
const DEMO_OBJECTS = [
  { id: 'sofa', name: 'โซฟา 3 ที่นั่ง', category: 'Sofa', price: 2790, x: 58, y: 56, outline: [[33, 71], [33, 50], [45, 41], [71, 41], [83, 50], [83, 71]] },
  { id: 'table', name: 'โต๊ะกลางทรงกลม', category: 'Coffee table', price: 1290, x: 55, y: 76, outline: [[47, 64], [63, 64], [70, 72], [70, 80], [63, 88], [47, 88], [40, 80], [40, 72]] },
  { id: 'chair', name: 'เก้าอี้ไม้สาน', category: 'Armchair', price: 1790, x: 17, y: 61, outline: [[10, 44], [24, 44], [31, 55], [31, 68], [24, 78], [10, 78], [3, 68], [3, 55]] },
  { id: 'plant', name: 'ต้นไม้ตกแต่ง', category: 'Decoration', price: 590, x: 84, y: 35, outline: [[84, 15], [90, 22], [94, 35], [90, 48], [84, 55], [78, 48], [74, 35], [78, 22]] },
  { id: 'pouf', name: 'เบาะนั่ง Pouffe', category: 'Pouffe', price: 790, x: 20, y: 82, outline: [[14, 70], [26, 70], [32, 82], [26, 94], [14, 94], [8, 82]] },
]

const DECISIONS = [
  { id: 'keep', label: 'KEEP', detail: 'เก็บชิ้นนี้ไว้ในแบบ', icon: '✓' },
  { id: 'replace', label: 'REPLACE', detail: 'หาสินค้าชิ้นใหม่มาแทน', icon: '↻' },
  { id: 'remove', label: 'REMOVE', detail: 'นำออกเพื่อคืนพื้นที่และงบ', icon: '−' },
]

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
  const [isRealDetection, setIsRealDetection] = useState(false)
  const [isDetecting, setIsDetecting] = useState(true)
  const [detectError, setDetectError] = useState('')
  const [activeId, setActiveId] = useState('')
  const [decisions, setDecisions] = useState({})
  const [replacementBriefs, setReplacementBriefs] = useState({})
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [aiError, setAiError] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [regenerateError, setRegenerateError] = useState('')

  const activeObjectBase = objects.find((item) => item.id === activeId) ?? objects[0]
  const aiSuggestion = aiSuggestions?.[activeObjectBase?.id]
  const activeObject = activeObjectBase
    ? { ...DEFAULT_SCORES, ...activeObjectBase, ...(aiSuggestion ?? {}) }
    : null
  const total = useMemo(() => objects.reduce((sum, item) => {
    if (decisions[item.id] === 'remove') return sum
    if (decisions[item.id] === 'replace') return sum + (Number(replacementBriefs[item.id]?.budget) || item.price)
    return sum + item.price
  }, 0), [objects, decisions, replacementBriefs])

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

      let activeObjects = loaded.detectedObjects?.length ? loaded.detectedObjects : []
      const savedDecisions = loaded.decisions ?? {}
      const savedObjectDecisions = getObjectDecisions(savedDecisions)
      const savedReplacementBriefs = loaded.replacementBriefs
      const hasSavedDecisions = Object.keys(savedObjectDecisions).length > 0
      if (hasSavedDecisions) setDecisions(savedObjectDecisions)
      if (savedReplacementBriefs) setReplacementBriefs(savedReplacementBriefs)

      // Detect against the AI-redesigned photo (has furniture in it), not
      // the original empty room — falls back to the original only if the
      // room hasn't been through AI Generate yet. When both exist, sending
      // the original too lets the AI list only what it actually added,
      // instead of re-listing furniture that was already there.
      const images = await getProjectImages(id).catch(() => [])
      if (cancelled) return
      const designs = getRoomDesigns(loaded, images).filter((room) => room.generatedImageUrl)
      setRoomDesigns(designs)
      setActiveRoomId(designs[0]?.sourceImageId ?? 'demo')

      if (!activeObjects.length && designs.length) {
        const detectedByRoom = []
        const detectionErrors = []
        for (const [roomIndex, room] of designs.entries()) {
          try {
            const detectResult = await api.post(`/projects/${id}/decisions/detect`, {
              image_url: room.generatedImageUrl,
              original_image_url: room.sourceImageUrl,
            })
            detectResult.objects?.forEach((item, itemIndex) => detectedByRoom.push({
              ...item,
              id: `${room.sourceImageId}:${item.id}:${itemIndex}`,
              sourceObjectId: item.id,
              roomId: room.sourceImageId,
              roomNumber: roomIndex + 1,
            }))
          } catch (err) {
            detectionErrors.push(`ห้อง ${roomIndex + 1}: ${err.message || 'ตรวจจับไม่สำเร็จ'}`)
          }
          if (cancelled) return
        }
        if (detectedByRoom.length) {
          activeObjects = detectedByRoom
          setIsRealDetection(true)
        }
        if (detectionErrors.length) setDetectError(detectionErrors.join(' · '))
      } else if (activeObjects.length) {
        setIsRealDetection(true)
      }

      if (!activeObjects.length && !designs.length) {
        const fallbackRoomId = designs[0]?.sourceImageId ?? 'demo'
        activeObjects = DEMO_OBJECTS.map((item) => ({ ...item, roomId: fallbackRoomId, roomNumber: 1 }))
      } else if (!activeObjects.length && !detectionErrors.length) {
        setDetectError('AI ยังไม่พบวัตถุใหม่ที่มั่นใจเพียงพอ ระบบจึงไม่วาด Selection ที่อาจผิดตำแหน่ง')
      }
      setObjects(activeObjects)
      setActiveId(activeObjects[0]?.id ?? '')
      if (!hasSavedDecisions) setDecisions(Object.fromEntries(activeObjects.map((item) => [item.id, 'keep'])))
      setIsDetecting(false)

      if (!activeObjects.length) return

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
          setAiSuggestions(Object.fromEntries(suggestResult.objects.map((item) => [item.id, item])))
          if (!hasSavedDecisions) {
            setDecisions(getSuggestedDecisions(suggestResult.objects))
          }
        }
      } catch {
        if (!cancelled) setAiError('AI วิเคราะห์คะแนนไม่สำเร็จ')
      }
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
        <main className="decision-content"><section className="decision-detection-state"><img src={roomDesigns[0]?.generatedImageUrl || decisionRoom} alt="ภาพห้องที่กำลังตรวจจับวัตถุ" /><div><span>{isDetecting ? 'AI DETECTION IN PROGRESS' : 'NO RELIABLE DETECTION'}</span><h1>{isDetecting ? 'กำลังตรวจจับวัตถุอย่างละเอียด' : 'ยังไม่พบวัตถุที่มั่นใจเพียงพอ'}</h1><p>{isDetecting ? 'ระบบกำลังเทียบภาพต้นฉบับกับภาพ AI และตรวจ mask ก่อนแสดง Selection' : detectError}</p>{!isDetecting ? <button type="button" onClick={() => window.location.reload()}>ลองตรวจจับอีกครั้ง</button> : null}</div></section></main>
      </div>
    )
  }

  async function continueToProducts() {
    const storedDesigns = roomDesigns.map((room) => ({ ...room }))
    const savedState = withWorkflowData({ ...decisions, __replacementBriefs: replacementBriefs }, { generatedImages: storedDesigns, detectedObjects: objects })
    await updateProject(project.id, { decisions: savedState, estimatedTotal: total, stage: 'product-matching', status: 'in-progress', progress: 84 })
    navigate(`/project/${project.id}/products`)
  }

  async function saveDraft() {
    const savedState = withWorkflowData({ ...decisions, __replacementBriefs: replacementBriefs }, { generatedImages: roomDesigns, detectedObjects: objects })
    await updateProject(project.id, { decisions: savedState, estimatedTotal: total, stage: 'object-decision', status: 'in-progress', progress: 67 })
    navigate('/home')
  }

  const activeRoom = roomDesigns.find((room) => room.sourceImageId === activeRoomId) ?? roomDesigns[0]
  const visibleObjects = objects.filter((item) => !item.roomId || item.roomId === (activeRoom?.sourceImageId ?? activeRoomId))

  function selectRoom(roomId) {
    setActiveRoomId(roomId)
    const firstObject = objects.find((item) => item.roomId === roomId)
    if (firstObject) setActiveId(firstObject.id)
  }

  function chooseDecision(decision) {
    setDecisions((current) => ({ ...current, [activeObject.id]: decision }))
    if (decision === 'replace' && !replacementBriefs[activeObject.id]) {
      setReplacementBriefs((current) => ({ ...current, [activeObject.id]: { budget: activeObject.price, note: '' } }))
    }
  }

  function updateReplacementBrief(patch) {
    setReplacementBriefs((current) => ({
      ...current,
      [activeObject.id]: { budget: activeObject.price, note: '', ...current[activeObject.id], ...patch },
    }))
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
        ? { ...room, generatedImageUrl: result.image_url }
        : room)
      const nextSelections = { ...(project.productSelections ?? {}) }
      delete nextSelections[activeObject.id]
      const savedState = withWorkflowData(
        { ...decisions, __replacementBriefs: replacementBriefs },
        { generatedImages: nextDesigns, detectedObjects: objects },
      )
      const updated = await updateProject(project.id, {
        decisions: savedState,
        generatedImageUrl: nextDesigns[0]?.generatedImageUrl ?? result.image_url,
        productSelections: nextSelections,
        estimatedTotal: total,
        stage: 'object-decision',
        status: 'in-progress',
        progress: 67,
      })
      setRoomDesigns(nextDesigns)
      setProject(updated)
    } catch (error) {
      setRegenerateError(error.message || 'สร้างเฉพาะวัตถุนี้ไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsRegenerating(false)
    }
  }

  const activeDecision = decisions[activeObject.id] || 'keep'
  const activeReplacementBrief = replacementBriefs[activeObject.id] ?? { budget: activeObject.price, note: '' }
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
        <Link to={`/project/${project.id}/result`}>← กลับไปดูผลลัพธ์</Link>
        <span>ROOMLY AI · DECISION</span>
        <button className="decision-save-draft" type="button" disabled={isRegenerating} onClick={saveDraft}>บันทึกร่างและออก</button>
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

        {roomDesigns.length > 1 ? <nav className="decision-room-tabs" aria-label="เลือกภาพห้อง">{roomDesigns.map((room, index) => {
          const count = objects.filter((item) => item.roomId === room.sourceImageId).length
          return <button className={activeRoom?.sourceImageId === room.sourceImageId ? 'is-active' : ''} type="button" onClick={() => selectRoom(room.sourceImageId)} key={room.sourceImageId}><span>ROOM {String(index + 1).padStart(2, '0')}</span><strong>{count} รายการที่ตรวจพบ</strong></button>
        })}</nav> : null}

        <section className="decision-workspace">
          <div className="decision-visual">
            <img src={activeRoom?.generatedImageUrl || decisionRoom} alt="ภาพห้องพร้อมจุดเลือกเฟอร์นิเจอร์" />
            {isRegenerating ? <div className="decision-regenerating" role="status"><span /><strong>AI กำลังแก้เฉพาะวัตถุที่เลือก</strong><small>ส่วนอื่นของห้องจะคงเดิม</small></div> : null}
            <svg className="decision-outline-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {visibleObjects.map((item) => {
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
            {visibleObjects.map((item) => {
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
            <span className="decision-demo-label">{isRealDetection ? 'AI DETECTED' : 'DEMO DETECTION'}{aiSuggestions ? ' · AI SCORED' : ''}</span>
          </div>

          <aside className={`decision-panel is-${activeDecision}`}>
            <div className="decision-object-title"><span>{activeObject.category}</span><small>ห้อง {activeObject.roomNumber ?? 1} · รายการ {visibleObjects.findIndex((item) => item.id === activeObject.id) + 1} / {visibleObjects.length}</small><h2>{activeObject.name}</h2><p>ราคาประเมิน ฿{new Intl.NumberFormat('th-TH').format(activeObject.price)}</p></div>

            <div className="decision-score-summary"><div><strong>{activeObject.score}</strong><span>/ 100</span></div><p>{activeObject.reason}</p>{detectError || aiError ? <small className="decision-ai-error">{detectError || aiError}</small> : null}</div>

            <div className="decision-score-list">
              {SCORE_LABELS.map((label, index) => (
                <div key={label}><span>{label}</span><i><b style={{ width: `${(activeObject.scores[index] / SCORE_MAX[index]) * 100}%` }} /></i><strong>{activeObject.scores[index]}/{SCORE_MAX[index]}</strong></div>
              ))}
            </div>

            <fieldset className="decision-options">
              <legend>การตัดสินใจของคุณ</legend>
              {DECISIONS.map((option) => (
                <label className={decisions[activeObject.id] === option.id ? `is-selected is-${option.id}` : ''} key={option.id}>
                  <input type="radio" name={`decision-${activeObject.id}`} checked={decisions[activeObject.id] === option.id} onChange={() => chooseDecision(option.id)} />
                  <b aria-hidden="true">{option.icon}</b><span><strong>{option.label}</strong><small>{option.detail}</small></span><i />
                </label>
              ))}
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
                <button className="decision-regenerate-button is-remove" type="button" disabled={isRegenerating} onClick={regenerateSelection}>{isRegenerating ? 'กำลังลบ...' : '− ลบเฉพาะชิ้นนี้ออกจากภาพ'}</button>
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
          <div><span>ยอดประมาณการใหม่</span><strong>฿{new Intl.NumberFormat('th-TH').format(total)}</strong><small className={total > project.budget ? 'is-over' : ''}>{total <= project.budget ? `เหลืองบ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}` : `เกินงบ ฿${new Intl.NumberFormat('th-TH').format(total - project.budget)}`}</small></div>
          <p className={isOverBudget ? 'is-over' : ''}>{isOverBudget ? <>ต้องลดอีก <b>฿{new Intl.NumberFormat('th-TH').format(total - project.budget)}</b> ก่อนดำเนินการต่อ</> : <><b>{decisionCounts.replace}</b> รายการรอหาสินค้าทดแทน · <b>{decisionCounts.remove}</b> รายการจะถูกนำออก</>}</p>
          <button type="button" disabled={isOverBudget || isRegenerating} onClick={continueToProducts}>{isOverBudget ? 'ยอดรวมยังเกินงบ' : isRegenerating ? 'รอ AI สร้างภาพให้เสร็จ' : decisionCounts.replace ? `ไปเลือกสินค้าทดแทน ${decisionCounts.replace} รายการ` : 'ยืนยันและไปจับคู่สินค้า'} <span>{isOverBudget ? '!' : '→'}</span></button>
        </footer>
      </main>
    </div>
  )
}

export default DecisionPage
