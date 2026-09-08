import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProject, updateProject } from '../../lib/projects'
import decisionRoom from '../../assets/steps/ai-decisions.png'
import './DecisionPage.css'

const OBJECTS = [
  { id: 'sofa', name: 'โซฟา 3 ที่นั่ง', category: 'Sofa', price: 2790, score: 88, x: 58, y: 56, defaultDecision: 'keep', reason: 'สัดส่วนเหมาะกับพื้นที่และเป็นที่นั่งหลักของห้อง', scores: [28, 23, 18, 12, 7] },
  { id: 'table', name: 'โต๊ะกลางทรงกลม', category: 'Coffee table', price: 1290, score: 82, x: 55, y: 76, defaultDecision: 'keep', reason: 'ใช้งานได้ดีและเหลือระยะทางเดินรอบโต๊ะ', scores: [24, 23, 18, 11, 6] },
  { id: 'chair', name: 'เก้าอี้ไม้สาน', category: 'Armchair', price: 1790, score: 67, x: 17, y: 61, defaultDecision: 'replace', reason: 'รูปทรงเข้ากับสไตล์ แต่มีตัวเลือกที่ประหยัดพื้นที่กว่า', scores: [20, 14, 17, 11, 5] },
  { id: 'plant', name: 'ต้นไม้ตกแต่ง', category: 'Decoration', price: 590, score: 46, x: 84, y: 35, defaultDecision: 'remove', reason: 'ช่วยเรื่องบรรยากาศแต่ไม่จำเป็นเมื่อเทียบกับงบที่เหลือ', scores: [10, 14, 12, 7, 3] },
  { id: 'pouf', name: 'เบาะนั่ง Pouffe', category: 'Pouffe', price: 790, score: 54, x: 20, y: 82, defaultDecision: 'remove', reason: 'ใช้พื้นที่ทางเดินและมีความจำเป็นต่ำกว่าเฟอร์นิเจอร์หลัก', scores: [15, 11, 14, 9, 5] },
]

const DECISIONS = [
  { id: 'keep', label: 'KEEP', detail: 'คงไว้ในแบบ' },
  { id: 'replace', label: 'REPLACE', detail: 'หาตัวเลือกใหม่' },
  { id: 'remove', label: 'REMOVE', detail: 'นำออกจากแบบ' },
]

const SCORE_LABELS = ['Function', 'Space', 'Budget', 'Style', 'Availability']
const SCORE_MAX = [30, 25, 20, 15, 10]

function DecisionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = getProject(id)
  const projectId = project?.id
  const projectStage = project?.stage
  const [activeId, setActiveId] = useState('sofa')
  const [decisions, setDecisions] = useState(() => project?.decisions ?? Object.fromEntries(OBJECTS.map((item) => [item.id, item.defaultDecision])))

  const activeObject = OBJECTS.find((item) => item.id === activeId) ?? OBJECTS[0]
  const total = useMemo(() => OBJECTS.reduce((sum, item) => decisions[item.id] === 'remove' ? sum : sum + item.price, 0), [decisions])

  useEffect(() => {
    if (projectId && projectStage !== 'product-matching' && projectStage !== 'saved') {
      updateProject(projectId, { stage: 'object-decision', status: 'in-progress', progress: 67 })
    }
  }, [projectId, projectStage])

  if (!project) {
    return <main className="decision-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>
  }

  function continueToProducts() {
    updateProject(project.id, { decisions, estimatedTotal: total, stage: 'product-matching', status: 'in-progress', progress: 84 })
    navigate(`/project/${project.id}/products`)
  }

  return (
    <div className="decision-shell">
      <header className="decision-topbar">
        <Link to={`/project/${project.id}/result`}>← กลับไปดูผลลัพธ์</Link>
        <span>ROOMLY AI · DECISION</span>
        <Link to="/home">บันทึกร่างและออก</Link>
      </header>

      <main className="decision-content">
        <header className="decision-heading">
          <div><p>04 · OBJECT DECISION</p><h1>เลือกสิ่งที่ควรเก็บ เปลี่ยน หรือนำออก</h1><span>กดหมายเลขบนภาพหรือเลือกรายการด้านขวา ระบบจะแสดงคะแนนและเหตุผลประกอบ</span></div>
          <div className="decision-budget"><span>งบประมาณ</span><strong>฿{new Intl.NumberFormat('th-TH').format(project.budget)}</strong></div>
        </header>

        <section className="decision-workspace">
          <div className="decision-visual">
            <img src={decisionRoom} alt="ภาพห้องพร้อมจุดเลือกเฟอร์นิเจอร์" />
            {OBJECTS.map((item, index) => (
              <button className={`decision-hotspot ${activeId === item.id ? 'is-active' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} type="button" onClick={() => setActiveId(item.id)} aria-label={`เลือก ${item.name}`} key={item.id}>{index + 1}</button>
            ))}
            <span className="decision-demo-label">DEMO DETECTION</span>
          </div>

          <aside className="decision-panel">
            <div className="decision-object-title"><span>{activeObject.category}</span><h2>{activeObject.name}</h2><p>ราคาประเมิน ฿{new Intl.NumberFormat('th-TH').format(activeObject.price)}</p></div>

            <div className="decision-score-summary"><div><strong>{activeObject.score}</strong><span>/ 100</span></div><p>{activeObject.reason}</p></div>

            <div className="decision-score-list">
              {SCORE_LABELS.map((label, index) => (
                <div key={label}><span>{label}</span><i><b style={{ width: `${(activeObject.scores[index] / SCORE_MAX[index]) * 100}%` }} /></i><strong>{activeObject.scores[index]}/{SCORE_MAX[index]}</strong></div>
              ))}
            </div>

            <fieldset className="decision-options">
              <legend>การตัดสินใจของคุณ</legend>
              {DECISIONS.map((option) => (
                <label className={decisions[activeObject.id] === option.id ? `is-selected is-${option.id}` : ''} key={option.id}>
                  <input type="radio" name={`decision-${activeObject.id}`} checked={decisions[activeObject.id] === option.id} onChange={() => setDecisions((current) => ({ ...current, [activeObject.id]: option.id }))} />
                  <span><strong>{option.label}</strong><small>{option.detail}</small></span><i />
                </label>
              ))}
            </fieldset>
          </aside>
        </section>

        <section className="decision-object-strip" aria-label="รายการเฟอร์นิเจอร์ทั้งหมด">
          {OBJECTS.map((item, index) => (
            <button className={activeId === item.id ? 'is-active' : ''} type="button" onClick={() => setActiveId(item.id)} key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong><small className={`is-${decisions[item.id]}`}>{decisions[item.id]}</small></button>
          ))}
        </section>

        <footer className="decision-footer">
          <div><span>ยอดประเมินหลังตัดสินใจ</span><strong>฿{new Intl.NumberFormat('th-TH').format(total)}</strong><small>{total <= project.budget ? `เหลืองบ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}` : `เกินงบ ฿${new Intl.NumberFormat('th-TH').format(total - project.budget)}`}</small></div>
          <button type="button" onClick={continueToProducts}>จับคู่สินค้าและปรับงบ →</button>
        </footer>
      </main>
    </div>
  )
}

export default DecisionPage
