import { Link, useParams } from 'react-router-dom'
import { getProject } from '../../lib/projects'
import './ProjectSummaryPage.css'

const LABELS = { sofa: 'โซฟา', table: 'โต๊ะกลาง', chair: 'เก้าอี้', plant: 'ของตกแต่ง', pouf: 'เบาะนั่ง' }
const PRODUCT_NAMES = { 'ikea-glostad': 'GLOSTAD โซฟา 2 ที่นั่ง', 'shopee-sofa': 'โซฟาผ้าโทนเข้ม 2 ที่นั่ง', 'ikea-coffee-table': 'โต๊ะกลางไม้ทรงเรียบ', 'shopee-coffee-table': 'โต๊ะกลางทรงกลม Minimal', 'ikea-armchair': 'อาร์มแชร์โทนธรรมชาติ', 'shopee-rattan-chair': 'เก้าอี้ไม้สานสไตล์ Japandi', 'ikea-decoration': 'ต้นไม้ประดิษฐ์พร้อมกระถาง', 'shopee-pouf': 'เบาะนั่งถักสีธรรมชาติ' }

export default function ProjectSummaryPage() {
  const { id } = useParams()
  const project = getProject(id)
  if (!project) return <main className="summary-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>
  const selections = Object.entries(project.productSelections ?? {})
  const money = new Intl.NumberFormat('th-TH')
  return (
    <div className="summary-shell">
      <header className="summary-topbar"><Link to={`/project/${id}/products`}>← กลับไปเลือกสินค้า</Link><span>ROOMLY AI · SAVED</span><Link to="/home">คลังโปรเจกต์</Link></header>
      <main className="summary-content">
        <div className="summary-success"><span>✓</span><p>06 · SAVE PROJECT</p><h1>โปรเจกต์พร้อมแล้ว</h1><strong>{project.name}</strong><small>บันทึกแบบห้อง การตัดสินใจ และชุดสินค้าเรียบร้อย</small></div>
        <section className="summary-metrics"><article><span>สไตล์</span><strong>{project.style}</strong></article><article><span>งบประมาณ</span><strong>฿{money.format(project.budget)}</strong></article><article><span>ยอดชุดสินค้า</span><strong>฿{money.format(project.estimatedTotal ?? 0)}</strong></article><article><span>สถานะงบ</span><strong className={(project.estimatedTotal ?? 0) <= project.budget ? 'is-good' : 'is-over'}>{(project.estimatedTotal ?? 0) <= project.budget ? `เหลือ ฿${money.format(project.budget - (project.estimatedTotal ?? 0))}` : `เกิน ฿${money.format((project.estimatedTotal ?? 0) - project.budget)}`}</strong></article></section>
        <section className="summary-card"><div className="summary-section-heading"><div><span>SELECTED PRODUCTS</span><h2>ชุดสินค้าที่เลือก</h2></div><small>{selections.length} รายการ</small></div>{selections.length ? <div className="summary-products">{selections.map(([objectId, productId], index) => <article key={objectId}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{LABELS[objectId] ?? objectId}</small><strong>{PRODUCT_NAMES[productId] ?? productId}</strong></div><em>เลือกแล้ว</em></article>)}</div> : <p className="summary-empty">ยังไม่มีสินค้าที่เลือก</p>}</section>
        <section className="summary-actions"><Link to={`/project/${id}`}>ดูรายละเอียดโปรเจกต์</Link><Link className="is-primary" to="/create-project">สร้างโปรเจกต์ใหม่ →</Link></section>
      </main>
    </div>
  )
}
