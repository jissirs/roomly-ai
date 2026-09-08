import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getProject, updateProject } from '../../lib/projects'
import productBoard from '../../assets/steps/shop-products.png'
import './ProductsPage.css'

const ITEM_LABELS = {
  sofa: 'โซฟา',
  table: 'โต๊ะกลาง',
  chair: 'เก้าอี้',
  plant: 'ของตกแต่ง',
  pouf: 'เบาะนั่ง',
}

const DEFAULT_DECISIONS = { sofa: 'keep', table: 'keep', chair: 'replace', plant: 'remove', pouf: 'remove' }

const CATALOG = [
  { id: 'ikea-glostad', objectId: 'sofa', name: 'GLOSTAD โซฟา 2 ที่นั่ง', store: 'IKEA', price: 2790, match: 94, size: 'กะทัดรัด เหมาะกับห้องขนาดเล็ก', url: 'https://www.ikea.com/th/th/cat/sofas-fu003/' },
  { id: 'shopee-sofa', objectId: 'sofa', name: 'โซฟาผ้าโทนเข้ม 2 ที่นั่ง', store: 'Shopee', price: 2490, match: 88, size: 'ค้นหาตัวเลือกขนาดใกล้เคียง', url: 'https://shopee.co.th/search?keyword=%E0%B9%82%E0%B8%8B%E0%B8%9F%E0%B8%B2%202%20%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B8%99%E0%B8%B1%E0%B9%88%E0%B8%87' },
  { id: 'ikea-coffee-table', objectId: 'table', name: 'โต๊ะกลางไม้ทรงเรียบ', store: 'IKEA', price: 1290, match: 91, size: 'หน้าโต๊ะขนาดกลาง ทางเดินยังเพียงพอ', url: 'https://www.ikea.com/th/th/cat/coffee-side-tables-10705/' },
  { id: 'shopee-coffee-table', objectId: 'table', name: 'โต๊ะกลางทรงกลม Minimal', store: 'Shopee', price: 990, match: 86, size: 'ตัวเลือกประหยัดงบ', url: 'https://shopee.co.th/search?keyword=%E0%B9%82%E0%B8%95%E0%B9%8A%E0%B8%B0%E0%B8%81%E0%B8%A5%E0%B8%B2%E0%B8%87%20minimal' },
  { id: 'ikea-armchair', objectId: 'chair', name: 'อาร์มแชร์โทนธรรมชาติ', store: 'IKEA', price: 1990, match: 89, size: 'เหมาะกับมุมอ่านหนังสือ', url: 'https://www.ikea.com/th/th/cat/armchairs-chaise-longues-16239/' },
  { id: 'shopee-rattan-chair', objectId: 'chair', name: 'เก้าอี้ไม้สานสไตล์ Japandi', store: 'Shopee', price: 1590, match: 92, size: 'ตัวเลือกทดแทนที่ประหยัดกว่า', url: 'https://shopee.co.th/search?keyword=%E0%B9%80%E0%B8%81%E0%B9%89%E0%B8%B2%E0%B8%AD%E0%B8%B5%E0%B9%89%20japandi' },
  { id: 'ikea-decoration', objectId: 'plant', name: 'ต้นไม้ประดิษฐ์พร้อมกระถาง', store: 'IKEA', price: 590, match: 80, size: 'เพิ่มสีเขียวโดยไม่ใช้พื้นที่มาก', url: 'https://www.ikea.com/th/th/cat/artificial-plants-flowers-20492/' },
  { id: 'shopee-pouf', objectId: 'pouf', name: 'เบาะนั่งถักสีธรรมชาติ', store: 'Shopee', price: 690, match: 84, size: 'ใช้เป็นที่นั่งเสริมได้', url: 'https://shopee.co.th/search?keyword=%E0%B9%80%E0%B8%9A%E0%B8%B2%E0%B8%B0%E0%B8%99%E0%B8%B1%E0%B9%88%E0%B8%87%20pouf' },
]

function ProductCard({ product, selected, onSelect }) {
  return (
    <article className={`products-card ${selected ? 'is-selected' : ''}`}>
      <div className="products-card-image"><img src={productBoard} alt="ตัวอย่างกลุ่มสินค้าเฟอร์นิเจอร์" /><span>{product.match}% MATCH</span></div>
      <div className="products-card-body">
        <div className="products-card-source"><span className={`is-${product.store.toLowerCase()}`}>{product.store}</span><small>Curated catalog</small></div>
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <div className="products-card-price"><strong>฿{new Intl.NumberFormat('th-TH').format(product.price)}</strong><small>ราคาอ้างอิง</small></div>
        <div className="products-card-actions">
          <button type="button" onClick={onSelect}>{selected ? 'เลือกแล้ว ✓' : 'เลือกชิ้นนี้'}</button>
          <a href={product.url} target="_blank" rel="noreferrer">ไปหน้าร้าน ↗</a>
        </div>
      </div>
    </article>
  )
}

function ProductsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = getProject(id)
  const decisions = project?.decisions ?? DEFAULT_DECISIONS
  const visibleObjectIds = Object.keys(ITEM_LABELS).filter((objectId) => decisions[objectId] !== 'remove')
  const [activeObjectId, setActiveObjectId] = useState(visibleObjectIds[0] ?? 'sofa')
  const [selections, setSelections] = useState(() => project?.productSelections ?? Object.fromEntries(visibleObjectIds.map((objectId) => [objectId, CATALOG.find((product) => product.objectId === objectId)?.id])))

  const total = useMemo(() => Object.values(selections).reduce((sum, productId) => sum + (CATALOG.find((product) => product.id === productId)?.price ?? 0), 0), [selections])
  const alternatives = CATALOG.filter((product) => product.objectId === activeObjectId)

  if (!project) return <main className="products-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  function saveProject() {
    updateProject(project.id, { productSelections: selections, estimatedTotal: total, stage: 'saved', status: 'done', progress: 100 })
    navigate(`/project/${project.id}/summary`)
  }

  return (
    <div className="products-shell">
      <header className="products-topbar"><Link to={`/project/${project.id}/decisions`}>← กลับไปตัดสินใจ</Link><span>ROOMLY AI · PRODUCT MATCH</span><Link to="/home">บันทึกร่างและออก</Link></header>
      <main className="products-content">
        <header className="products-heading">
          <div><p>05 · PRODUCT ALTERNATIVES</p><h1>เลือกสินค้าที่ใกล้เคียงกับแบบ</h1><span>ราคาเป็นข้อมูลอ้างอิงจาก Curated Catalog กรุณาตรวจสอบราคาและสถานะสินค้าที่หน้าร้านอีกครั้ง</span></div>
          <div className={`products-budget-status ${total > project.budget ? 'is-over' : ''}`}><span>ยอดที่เลือก / งบ</span><strong>฿{new Intl.NumberFormat('th-TH').format(total)} <small>/ ฿{new Intl.NumberFormat('th-TH').format(project.budget)}</small></strong><i><b style={{ width: `${Math.min(100, (total / project.budget) * 100)}%` }} /></i></div>
        </header>

        <section className="products-category-tabs" aria-label="หมวดสินค้าที่ต้องเลือก">
          {visibleObjectIds.map((objectId, index) => <button className={activeObjectId === objectId ? 'is-active' : ''} type="button" onClick={() => setActiveObjectId(objectId)} key={objectId}><span>{String(index + 1).padStart(2, '0')}</span>{ITEM_LABELS[objectId]}<small>{selections[objectId] ? 'เลือกแล้ว' : 'ยังไม่เลือก'}</small></button>)}
        </section>

        <section className="products-layout">
          <aside className="products-preview"><img src={productBoard} alt="ตัวอย่างสินค้าที่จับคู่กับแบบห้อง" /><div><span>SELECTED SET</span><strong>{Object.values(selections).filter(Boolean).length} รายการ</strong><p>{total <= project.budget ? `อยู่ในงบ เหลือ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}` : `เกินงบ ฿${new Intl.NumberFormat('th-TH').format(total - project.budget)}`}</p></div></aside>
          <div className="products-alternatives">
            <div className="products-section-title"><div><span>{ITEM_LABELS[activeObjectId]}</span><h2>สินค้าที่แนะนำ</h2></div><small>{alternatives.length} ตัวเลือก</small></div>
            <div className="products-grid">{alternatives.map((product) => <ProductCard product={product} selected={selections[activeObjectId] === product.id} onSelect={() => setSelections((current) => ({ ...current, [activeObjectId]: product.id }))} key={product.id} />)}</div>
            {!alternatives.length ? <div className="products-empty">ยังไม่มีสินค้าใน Curated Catalog สำหรับหมวดนี้</div> : null}
          </div>
        </section>

        <footer className="products-footer"><div><span>สรุปชุดสินค้า</span><strong>{Object.values(selections).filter(Boolean).length} ชิ้น · ฿{new Intl.NumberFormat('th-TH').format(total)}</strong><small>{total <= project.budget ? 'อยู่ภายในงบประมาณ' : 'กรุณาเลือกตัวเลือกที่ประหยัดกว่า'}</small></div><button type="button" disabled={!Object.values(selections).filter(Boolean).length || total > project.budget} onClick={saveProject}>บันทึกโปรเจกต์ฉบับสมบูรณ์ →</button></footer>
      </main>
    </div>
  )
}

export default ProductsPage
