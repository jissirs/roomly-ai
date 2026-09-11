import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { REAL_PRODUCT_CATALOG } from '../../data/realProductCatalog'
import { getObjectDecisions, getProject } from '../../lib/projects'
import './ProjectSummaryPage.css'

const DECISION_LABELS = {
  keep: { label: 'KEEP', detail: 'คงไว้และจับคู่สินค้าที่ใกล้แบบ AI', icon: '✓' },
  replace: { label: 'REPLACE', detail: 'เปลี่ยนตามโจทย์ที่ระบุ', icon: '↻' },
  remove: { label: 'REMOVE', detail: 'นำออกจากรายการสินค้าและงบ', icon: '−' },
}

const LEGACY_PRODUCT_CATEGORIES = {
  'shopee-pouf': 'ottoman', 'shopee-rattan-chair': 'chair', 'ikea-armchair': 'chair',
  'ikea-decoration': 'plant', 'shopee-coffee-table': 'coffee-table', 'ikea-coffee-table': 'coffee-table',
  'ikea-glostad': 'sofa', 'shopee-sofa': 'sofa',
}

const LEGACY_OBJECTS = {
  rug: { name: 'พรม', category: 'rug' }, sofa: { name: 'โซฟา', category: 'sofa' },
  coffee_table: { name: 'โต๊ะกลาง', category: 'coffee-table' }, table: { name: 'โต๊ะกลาง', category: 'coffee-table' },
  tv_stand: { name: 'ตู้วางทีวี', category: 'television' }, curtain: { name: 'ผ้าม่าน', category: 'curtain' },
  chair: { name: 'เก้าอี้', category: 'chair' }, plant: { name: 'ต้นไม้ตกแต่ง', category: 'plant' },
}

function inferCategory(item) {
  const value = `${item?.category ?? ''} ${item?.id ?? ''}`.toLowerCase().replaceAll('_', ' ')
  const aliases = [
    [['tv stand', 'tv bench'], 'television'], [['coffee table', 'center table'], 'coffee-table'],
    [['rug', 'carpet'], 'rug'], [['sofa', 'couch'], 'sofa'], [['curtain', 'drape'], 'curtain'],
    [['plant', 'tree'], 'plant'], [['chair'], 'chair'], [['lamp'], 'lamp'], [['cabinet'], 'cabinet'],
    [['mirror'], 'mirror'], [['bed'], 'bed'], [['desk'], 'desk'], [['ottoman', 'pouf'], 'ottoman'],
  ]
  return aliases.find(([keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[1] ?? item?.category
}

function enrichSelection(selection) {
  const category = selection.category || LEGACY_PRODUCT_CATEGORIES[selection.productId]
  const catalogProduct = REAL_PRODUCT_CATALOG.find((product) => product.id === selection.productId)
    || REAL_PRODUCT_CATALOG.find((product) => product.category === category)
  if (!catalogProduct) return selection
  return {
    ...selection,
    ...catalogProduct,
    decision: selection.decision,
    objectName: selection.objectName,
    productId: catalogProduct.id,
    imageUrl: catalogProduct.image_url,
    isLegacyReplacement: !selection.imageUrl,
  }
}

export default function ProjectSummaryPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getProject(id).then((loaded) => !cancelled && setProject(loaded)).finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [id])

  const objectDecisions = getObjectDecisions(project?.decisions)
  const decisionObjects = project?.detectedObjects?.length
    ? project.detectedObjects
    : Object.keys(objectDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
  const purchasableObjects = decisionObjects.filter((item) => objectDecisions[item.id] !== 'remove')
  const storedSelections = Object.entries(project?.productSelections ?? {})
    .filter(([objectId]) => objectDecisions[objectId] && objectDecisions[objectId] !== 'remove')
    .map(([objectId, selection]) => [objectId, enrichSelection(selection)])
  const hasCompleteStoredSelections = purchasableObjects.length > 0
    && purchasableObjects.every((item) => storedSelections.some(([objectId]) => objectId === item.id))
  let runningFallbackTotal = 0
  const productSelections = hasCompleteStoredSelections ? storedSelections : purchasableObjects.flatMap((item) => {
    const product = REAL_PRODUCT_CATALOG
      .filter((candidate) => candidate.category === inferCategory(item))
      .sort((first, second) => second.match - first.match || first.price - second.price)
      .find((candidate) => runningFallbackTotal + candidate.price <= (project?.budget ?? 0))
    if (!product) return []
    runningFallbackTotal += product.price
    return [[item.id, {
      ...product, productId: product.id, objectName: item.name, decision: objectDecisions[item.id],
      imageUrl: product.image_url, isLegacyReplacement: true,
    }]]
  })
  const generatedImages = project?.generatedImages?.length
    ? project.generatedImages
    : project?.generatedImageUrl ? [{ sourceImageId: 'legacy', generatedImageUrl: project.generatedImageUrl }] : []
  const productTotal = productSelections.reduce((sum, [, selection]) => sum + (selection.price ?? 0), 0)

  if (isLoading) return <main className="summary-missing"><h1>กำลังโหลด...</h1></main>
  if (!project) return <main className="summary-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>
  if (project.stage !== 'saved') return <main className="summary-missing"><h1>โปรเจกต์ยังไม่สมบูรณ์</h1><p>เลือกสินค้าและบันทึกโปรเจกต์ให้เสร็จก่อนเปิดหน้าสรุป</p><Link to={`/project/${id}/products`}>กลับไปเลือกสินค้า</Link></main>

  const money = new Intl.NumberFormat('th-TH')
  const counts = decisionObjects.reduce((result, item) => {
    const decision = objectDecisions[item.id] ?? 'keep'
    result[decision] += 1
    return result
  }, { keep: 0, replace: 0, remove: 0 })

  return (
    <div className="summary-shell">
      <header className="summary-topbar"><Link to={`/project/${id}/products`}>← กลับไปเลือกสินค้า</Link><span>ROOMLY AI · SAVED</span><Link to="/home">คลังโปรเจกต์</Link></header>
      <main className="summary-content">
        <div className="summary-success"><span>✓</span><p>06 · SAVE PROJECT</p><h1>โปรเจกต์พร้อมแล้ว</h1><strong>{project.name}</strong><small>รวมแบบ AI การตัดสินใจ และสินค้าจริงที่อ้างอิงได้ไว้ในหน้าเดียว</small></div>

        <section className="summary-metrics"><article><span>สไตล์</span><strong>{project.style}</strong></article><article><span>งบประมาณสูงสุด</span><strong>฿{money.format(project.budget)}</strong></article><article><span>ยอดสินค้าจริง</span><strong>฿{money.format(productTotal)}</strong></article><article><span>สถานะงบ</span><strong className={productTotal <= project.budget ? 'is-good' : 'is-over'}>{productTotal <= project.budget ? `เหลือ ฿${money.format(project.budget - productTotal)}` : `เกิน ฿${money.format(productTotal - project.budget)}`}</strong></article></section>

        {generatedImages.length ? <section className="summary-card"><div className="summary-section-heading"><div><span>AI GENERATED ROOMS</span><h2>แบบห้องที่ใช้จับคู่สินค้า</h2></div><small>{generatedImages.length} ภาพ</small></div><div className="summary-room-gallery">{generatedImages.map((room, index) => <figure key={room.sourceImageId ?? index}><img src={room.generatedImageUrl} alt={`แบบห้อง AI ภาพที่ ${index + 1}`} /><figcaption>ROOM {String(index + 1).padStart(2, '0')}</figcaption></figure>)}</div></section> : null}

        <section className="summary-card"><div className="summary-section-heading"><div><span>OBJECT DECISIONS</span><h2>ผล Keep / Replace / Remove</h2></div><small>{decisionObjects.length} รายการ</small></div><div className="summary-decision-stats"><span className="is-keep">✓ {counts.keep} Keep</span><span className="is-replace">↻ {counts.replace} Replace</span><span className="is-remove">− {counts.remove} Remove</span></div><div className="summary-decisions">{decisionObjects.map((item) => {
          const decision = objectDecisions[item.id] ?? 'keep'
          const config = DECISION_LABELS[decision]
          const replacementNote = project.replacementBriefs?.[item.id]?.note
          return <article className={`is-${decision}`} key={item.id}><b>{config.icon}</b><div><strong>{item.name}</strong><small>ห้อง {item.roomNumber ?? 1} · {replacementNote || config.detail}</small></div><em>{config.label}</em></article>
        })}</div></section>

        <section className="summary-card"><div className="summary-section-heading"><div><span>VERIFIED PRODUCTS</span><h2>สินค้าจริงที่เลือก</h2></div><small>{productSelections.length} รายการ</small></div>{productSelections.length ? <div className="summary-product-grid">{productSelections.map(([objectId, selection]) => <article key={objectId}><a className="summary-product-image" href={selection.url} target="_blank" rel="noreferrer"><img src={selection.imageUrl} alt={selection.name} /></a><div className="summary-product-body"><div><span>{selection.store} · SKU {selection.sku || selection.productId}</span><em>{selection.isLegacyReplacement ? 'อัปเดตข้อมูลจริง' : (selection.decision || objectDecisions[objectId]) === 'replace' ? 'REPLACE' : 'KEEP'}</em></div><small>{selection.objectName}</small><h3>{selection.name || selection.productId}</h3><p>{selection.size}</p>{selection.visualTags?.length ? <p>อ้างอิงจากภาพ AI: {selection.visualTags.join(', ')}</p> : null}<footer><strong>฿{money.format(selection.price ?? 0)}</strong><a href={selection.url} target="_blank" rel="noreferrer">ดูสินค้าจริง ↗</a></footer></div></article>)}</div> : <p className="summary-empty">ยังไม่มีสินค้าที่เลือก</p>}<p className="summary-price-note">ราคาและสต็อกอาจเปลี่ยนแปลง โปรดตรวจสอบข้อมูลล่าสุดจากลิงก์หน้าสินค้าก่อนสั่งซื้อ</p></section>

        <section className="summary-actions"><Link to={`/project/${id}`}>ดูรายละเอียดโปรเจกต์</Link><Link className="is-primary" to="/home">กลับหน้าหลัก →</Link></section>
      </main>
    </div>
  )
}
