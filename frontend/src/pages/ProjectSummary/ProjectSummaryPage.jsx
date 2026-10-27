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

const ROOM_TYPE_LABELS = {
  bedroom: 'ห้องนอน',
  'living-room': 'ห้องนั่งเล่น',
  studio: 'ห้องสตูดิโอ',
  workspace: 'ห้องทำงาน',
}

const STYLE_LABELS = {
  minimal: 'Minimal', japandi: 'Japandi', modern: 'Modern', scandinavian: 'Scandinavian',
  contemporary: 'Contemporary', luxury: 'Luxury', industrial: 'Industrial', 'mid-century': 'Mid-century',
  classic: 'Classic', bohemian: 'Bohemian', coastal: 'Coastal', 'wabi-sabi': 'Wabi-sabi',
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
    // What was saved wins over the catalog: the price the user agreed to (live
    // when it was read from the store) must not drift back to the catalog one.
    ...(selection.price != null ? { price: selection.price, priceSource: selection.priceSource, verifiedAt: selection.verifiedAt } : {}),
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
  const [activeAngle, setActiveAngle] = useState(0)

  useEffect(() => {
    let cancelled = false
    getProject(id).then((loaded) => !cancelled && setProject(loaded)).finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [id])

  const objectDecisions = getObjectDecisions(project?.decisions)
  const decisionObjects = project?.detectedObjects?.length
    ? project.detectedObjects
    : Object.keys(objectDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
  // An object the AI already removed from the picture counts as REMOVE.
  const decisionOf = (item) => (item.removedFromImage ? 'remove' : (objectDecisions[item.id] ?? 'keep'))
  const removedIds = new Set(decisionObjects.filter((item) => decisionOf(item) === 'remove').map((item) => item.id))
  const purchasableObjects = decisionObjects.filter((item) => !removedIds.has(item.id))
  const rawSelections = Object.entries(project?.productSelections ?? {})
    .filter(([objectId]) => objectDecisions[objectId] && !removedIds.has(objectId))
  const skippedItems = rawSelections.filter(([, selection]) => selection.skipped)
  const storedSelections = rawSelections
    .filter(([, selection]) => !selection.skipped)
    .map(([objectId, selection]) => [objectId, enrichSelection(selection)])
  const hasCompleteStoredSelections = purchasableObjects.length > 0
    && purchasableObjects.every((item) => rawSelections.some(([objectId]) => objectId === item.id))
  const isFinal = project?.stage === 'saved'
  let runningFallbackTotal = 0
  const productSelections = (hasCompleteStoredSelections || !isFinal) ? storedSelections : purchasableObjects.flatMap((item) => {
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
  const estimatedTotal = decisionObjects.reduce((sum, item) => {
    const decision = decisionOf(item)
    if (decision === 'remove') return sum
    if (decision === 'replace') return sum + (Number(project?.replacementBriefs?.[item.id]?.budget) || item.price || 0)
    return sum + (item.price ?? 0)
  }, 0)
  const productTotal = isFinal ? productSelections.reduce((sum, [, selection]) => sum + (selection.price ?? 0), 0) : estimatedTotal
  const lastVerified = productSelections.map(([, selection]) => selection.verifiedAt).filter(Boolean).sort().at(-1)

  if (isLoading) return <main className="summary-missing"><h1>กำลังโหลด...</h1></main>
  if (!project) return <main className="summary-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  const money = new Intl.NumberFormat('th-TH')
  const counts = decisionObjects.reduce((result, item) => {
    result[decisionOf(item)] += 1
    return result
  }, { keep: 0, replace: 0, remove: 0 })

  const sizeText = project.dimensions?.width && project.dimensions?.length
    ? `${project.dimensions.width} × ${project.dimensions.length}${project.dimensions.height ? ` × ${project.dimensions.height}` : ''} ม.`
    : null
  const brief = project.aiInstructions || project.notes
  const angleIndex = Math.min(activeAngle, Math.max(generatedImages.length - 1, 0))
  const activeImage = generatedImages[angleIndex]
  const goToAngle = (index) => setActiveAngle(Math.max(0, Math.min(generatedImages.length - 1, index)))
  const budgetShare = project.budget ? Math.min(100, (productTotal / project.budget) * 100) : 0
  const isOverBudget = productTotal > project.budget

  return (
    <div className="summary-shell">
      <header className="summary-topbar"><Link to={`/project/${id}/decisions`}>← กลับไปตัดสินใจ</Link><span>ROOMLY AI · SUMMARY</span><Link to="/home">คลังโปรเจกต์</Link></header>
      <main className="summary-content">
        <header className="sm-hero">
          <p className="sm-eyebrow">05 · SUMMARY</p>
          <h1>{project.name}</h1>
          <p className="sm-sub">{[ROOM_TYPE_LABELS[project.roomType] ?? project.roomType, STYLE_LABELS[project.style] ?? project.style, sizeText].filter(Boolean).join(' · ')}</p>
          <span className={`sm-status ${isFinal ? 'is-done' : ''}`}>{isFinal ? '✓ บันทึกครบแล้ว' : 'รอเลือกสินค้า'}</span>
        </header>

        <div className="sm-layout">
          <section className="sm-stage" aria-label="ภาพห้องที่ AI ออกแบบ">
            {activeImage ? (
              <div className="sm-slide" onKeyDown={(event) => {
                if (event.key === 'ArrowRight') goToAngle(angleIndex + 1)
                if (event.key === 'ArrowLeft') goToAngle(angleIndex - 1)
              }}>
                <div className="sm-slide-head">
                  <div>
                    <strong>ANGLE {String(angleIndex + 1).padStart(2, '0')}<small> / {String(generatedImages.length).padStart(2, '0')}</small></strong>
                    <span className="sm-slide-tag">{angleIndex === 0 ? 'มุมหลัก · ใช้ตัดสินใจและจับคู่สินค้า' : activeImage.syncedWith ? 'ตรงกับมุมหลักแล้ว' : 'สร้างตามมุมหลัก'}</span>
                  </div>
                  {generatedImages.length > 1 ? (
                    <div className="sm-slide-nav">
                      <button type="button" aria-label="มุมก่อนหน้า" disabled={angleIndex === 0} onClick={() => goToAngle(angleIndex - 1)}>←</button>
                      <button type="button" aria-label="มุมถัดไป" disabled={angleIndex === generatedImages.length - 1} onClick={() => goToAngle(angleIndex + 1)}>→</button>
                    </div>
                  ) : null}
                </div>
                <div className={`sm-compare ${activeImage.sourceImageUrl ? '' : 'is-single'}`}>
                  {activeImage.sourceImageUrl ? <figure className="sm-viewer"><img src={activeImage.sourceImageUrl} alt={`ภาพห้องเดิม มุมที่ ${angleIndex + 1}`} /><figcaption>BEFORE</figcaption></figure> : null}
                  <figure className="sm-viewer"><img src={activeImage.generatedImageUrl} alt={`แบบห้อง AI มุมที่ ${angleIndex + 1}`} /><figcaption>AFTER</figcaption></figure>
                </div>
                <p className="sm-slide-meta">{activeImage.history?.length ? `แก้ไขในภาพนี้ ${activeImage.history.length} ครั้ง` : 'ยังไม่มีการแก้ไขเพิ่มเติม'}</p>
              </div>
            ) : <div className="sm-viewer is-empty">ยังไม่มีภาพที่ AI สร้าง</div>}
            {generatedImages.length > 1 ? (
              <div className="sm-thumbs" role="tablist" aria-label="เลือกมุมภาพ">
                {generatedImages.map((room, index) => (
                  <button type="button" role="tab" aria-selected={index === angleIndex} className={index === angleIndex ? 'is-active' : ''} onClick={() => setActiveAngle(index)} key={room.sourceImageId ?? index}>
                    <img src={room.generatedImageUrl} alt="" />
                    <span>มุม {index + 1}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <aside className="sm-side">
            <div className="sm-budget">
              <span>{isFinal ? 'ยอดสินค้าจริงรวม' : 'ยอดประมาณการ'}</span>
              <strong>฿{money.format(productTotal)}</strong>
              <div className={`sm-meter ${isOverBudget ? 'is-over' : ''}`} role="img" aria-label={`ใช้ไป ${Math.round(budgetShare)}% ของงบ`}><i style={{ width: `${budgetShare}%` }} /></div>
              <p className={isOverBudget ? 'is-over' : 'is-good'}>{isOverBudget ? `เกินงบ ฿${money.format(productTotal - project.budget)}` : `เหลือ ฿${money.format(project.budget - productTotal)}`}<small>จากงบสูงสุด ฿{money.format(project.budget)}</small></p>
            </div>
            <dl className="sm-facts">
              <div><dt>ประเภทห้อง</dt><dd>{ROOM_TYPE_LABELS[project.roomType] ?? project.roomType}</dd></div>
              <div><dt>สไตล์</dt><dd>{STYLE_LABELS[project.style] ?? project.style}</dd></div>
              <div><dt>ขนาดห้อง</dt><dd>{sizeText ?? '–'}</dd></div>
              <div><dt>มุมที่ถ่าย</dt><dd>{generatedImages.length} มุม</dd></div>
              {brief ? <div className="is-wide"><dt>คำอธิบายถึง AI</dt><dd>{brief}</dd></div> : null}
            </dl>
            <div className="sm-actions">
              {isFinal ? <Link className="is-primary" to="/home">กลับหน้าหลัก →</Link> : <Link className="is-primary" to={`/project/${id}/products`}>ไปเลือกสินค้า →</Link>}
              {isFinal ? <Link to={`/project/${id}/products`}>แก้ไขสินค้า</Link> : null}
              <Link to={`/project/${id}`}>ดูรายละเอียดโปรเจกต์</Link>
            </div>
          </aside>
        </div>

        <section className="sm-section" aria-label="ผลการตัดสินใจ">
          <div className="sm-section-head">
            <div><span>OBJECT DECISIONS</span><h2>ผล Keep / Replace / Remove</h2></div>
            <div className="sm-pills"><span className="is-keep">✓ {counts.keep} Keep</span><span className="is-replace">↻ {counts.replace} Replace</span><span className="is-remove">− {counts.remove} Remove</span></div>
          </div>
          <div className="sm-decisions">{decisionObjects.map((item) => {
            const decision = decisionOf(item)
            const config = DECISION_LABELS[decision]
            const brief = project.replacementBriefs?.[item.id]
            const detail = decision === 'replace'
              ? [brief?.budget ? `ตั้งงบ ฿${money.format(Number(brief.budget))}` : null, brief?.note || config.detail].filter(Boolean).join(' · ')
              : decision === 'remove' && item.removedFromImage ? 'AI ลบออกจากภาพแล้ว · ไม่นับในงบและไม่จับคู่สินค้า' : config.detail
            return <article className={`is-${decision}`} key={item.id}><b>{config.icon}</b><div><strong>{item.name}</strong><small>{detail}</small></div><em>{config.label}</em></article>
          })}</div>
        </section>

        {!isFinal && !productSelections.length ? (
          <section className="sm-section sm-next" aria-label="ขั้นถัดไป">
            <div><span>NEXT STEP</span><h2>เลือกสินค้าจริง</h2><p>จับคู่แบบ AI กับสินค้าที่มีอยู่จริงจาก IKEA / HomePro ภายในงบ ฿{money.format(project.budget)}</p></div>
            <Link className="is-primary" to={`/project/${id}/products`}>ไปเลือกสินค้า →</Link>
          </section>
        ) : (
          <section className="sm-section" aria-label="สินค้าจริงที่เลือก">
            <div className="sm-section-head"><div><span>VERIFIED PRODUCTS</span><h2>สินค้าจริงที่เลือก</h2></div><small>{productSelections.length} รายการ</small></div>
            {productSelections.length ? (
              <div className="sm-products">{productSelections.map(([objectId, selection]) => (
                <article key={objectId}>
                  <a className="sm-product-image" href={selection.url} target="_blank" rel="noreferrer"><img src={selection.imageUrl} alt={selection.name} /></a>
                  <div className="sm-product-body">
                    <div className="sm-product-meta"><span>{selection.store} · SKU {selection.sku || selection.productId}{selection.priceSource === 'live' ? ' · ราคาสดจากร้าน' : ''}</span><em>{selection.isLegacyReplacement ? 'อัปเดตข้อมูลจริง' : (selection.decision || objectDecisions[objectId]) === 'replace' ? 'REPLACE' : 'KEEP'}</em></div>
                    <small>{selection.objectName}</small>
                    <h3>{selection.name || selection.productId}</h3>
                    {selection.size ? <p>{selection.size}</p> : null}
                    {selection.visualTags?.length ? <p>อ้างอิงจากภาพ AI: {selection.visualTags.join(', ')}</p> : null}
                    <footer><strong>฿{money.format(selection.price ?? 0)}</strong><a href={selection.url} target="_blank" rel="noreferrer">ดูสินค้าจริง ↗</a></footer>
                  </div>
                </article>
              ))}</div>
            ) : <p className="summary-empty">ยังไม่มีสินค้าที่เลือก</p>}
            {skippedItems.length ? <p className="sm-note">ข้ามการซื้อ: {skippedItems.map(([, selection]) => selection.objectName).join(', ')} (ไม่มีสินค้าที่เหมาะในแคตตาล็อก หรือเลือกใช้ของเดิม)</p> : null}
            <p className="sm-note">{lastVerified ? `ราคาอ้างอิงตรวจเมื่อ ${new Date(lastVerified).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · ` : ''}ราคาและสต็อกอาจเปลี่ยนแปลง โปรดตรวจสอบข้อมูลล่าสุดจากลิงก์หน้าสินค้าก่อนสั่งซื้อ</p>
          </section>
        )}
      </main>
    </div>
  )
}
