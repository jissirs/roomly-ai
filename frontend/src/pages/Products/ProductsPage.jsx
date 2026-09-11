import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CATALOG_VERIFIED_AT, REAL_PRODUCT_CATALOG } from '../../data/realProductCatalog'
import { getObjectDecisions, getProject, updateProject } from '../../lib/projects'
import { supabase } from '../../lib/supabase'
import productBoard from '../../assets/steps/shop-products.png'
import './ProductsPage.css'

const CATEGORY_LABELS = {
  sofa: 'โซฟา', chair: 'เก้าอี้', 'coffee-table': 'โต๊ะกลาง', 'side-table': 'โต๊ะข้าง',
  'dining-table': 'โต๊ะอาหาร', desk: 'โต๊ะทำงาน', cabinet: 'ตู้เก็บของ', shelf: 'ชั้นวาง',
  rug: 'พรม', lamp: 'โคมไฟ', plant: 'ต้นไม้ตกแต่ง', curtain: 'ผ้าม่าน', bed: 'เตียง',
  nightstand: 'ตู้ข้างเตียง', ottoman: 'สตูล/เบาะนั่ง', mirror: 'กระจก', 'wall-art': 'ของตกแต่งผนัง',
  television: 'โทรทัศน์', bench: 'ม้านั่ง',
}

const LEGACY_OBJECTS = {
  sofa: { name: 'โซฟา', category: 'sofa' }, table: { name: 'โต๊ะกลาง', category: 'coffee-table' },
  chair: { name: 'เก้าอี้', category: 'chair' }, plant: { name: 'ต้นไม้ตกแต่ง', category: 'plant' },
  pouf: { name: 'เบาะนั่ง', category: 'ottoman' },
}

function normalizeCategory(item) {
  const value = `${item?.category ?? ''} ${item?.sourceObjectId ?? ''} ${item?.id ?? ''}`.toLowerCase()
  const aliases = [
    [['side table', 'end table', 'side-table', 'side_table'], 'side-table'], [['dining table', 'dining-table', 'dining_table'], 'dining-table'],
    [['coffee table', 'center table', 'coffee-table', 'coffee_table'], 'coffee-table'],
    [['nightstand', 'bedside'], 'nightstand'], [['armchair', 'chair'], 'chair'], [['sectional', 'sofa', 'couch'], 'sofa'],
    [['sideboard', 'credenza', 'cabinet', 'dresser', 'storage'], 'cabinet'], [['bookshelf', 'shelf'], 'shelf'],
    [['area rug', 'rug', 'carpet'], 'rug'], [['lamp', 'lighting'], 'lamp'], [['plant', 'tree'], 'plant'],
    [['curtain', 'drape'], 'curtain'], [['ottoman', 'pouf', 'pouffe'], 'ottoman'], [['wall art', 'picture', 'artwork'], 'wall-art'],
    [['tv stand', 'tv_stand', 'tv bench', 'media console'], 'television'], [['television', ' tv'], 'television'],
    [['desk'], 'desk'], [['bed'], 'bed'], [['mirror'], 'mirror'], [['bench'], 'bench'],
  ]
  const matched = aliases.find(([keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[1]
  if (matched) return matched
  if (/\btable\b/.test(value)) return 'coffee-table'
  return item?.category?.toLowerCase()
}

function isStyleMatch(product, style) {
  return Array.isArray(product.styles) && product.styles.includes(style)
}

function formatStyleLabel(style) {
  return style?.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') ?? ''
}

function visualMatchScore(product, object, note = '') {
  const visualTags = object?.visual_tags ?? object?.visualTags ?? []
  const desired = [...visualTags, note].join(' ').trim().toLowerCase()
  if (!desired) return 0
  return (product.tags ?? []).reduce((score, tag) => score + (desired.includes(String(tag).toLowerCase()) ? 1 : 0), 0)
}

function mergeCatalog(databaseProducts = []) {
  const merged = new Map(REAL_PRODUCT_CATALOG.map((product) => [product.id, product]))
  databaseProducts
    .filter((product) => product.image_url && product.url?.includes('/p/'))
    .forEach((product) => {
      const bundled = merged.get(product.id)
      merged.set(product.id, {
        ...bundled,
        ...product,
        styles: [...new Set([...(bundled?.styles ?? []), ...(product.styles ?? [])])],
        tags: [...new Set([...(bundled?.tags ?? []), ...(product.tags ?? [])])],
      })
    })
  return [...merged.values()]
}

function ProductCard({ product, selected, disabled, onSelect, styleMatch, styleLabel }) {
  return (
    <article className={`products-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-unaffordable' : ''}`.trim()}>
      <div className="products-card-image"><img src={product.image_url || productBoard} alt={product.name} /><span>{product.match}% MATCH</span></div>
      <div className="products-card-body">
        <div className="products-card-source"><span className={`is-${product.store.toLowerCase()}`}>{product.store}</span><small>SKU {product.sku || product.id}</small></div>
        {styleMatch ? <span className="products-card-style-badge">ตรงสไตล์ {styleLabel}</span> : null}
        <h3>{product.name}</h3>
        <p>{product.size}</p>
        <div className="products-card-price"><strong>฿{new Intl.NumberFormat('th-TH').format(product.price)}</strong><small>ราคาอ้างอิง</small></div>
        <div className="products-card-actions"><button type="button" disabled={disabled} onClick={onSelect}>{selected ? 'เลือกแล้ว ✓' : disabled ? 'เกินงบที่กำหนด' : 'เลือกชิ้นนี้'}</button><a href={product.url} target="_blank" rel="noreferrer">ดูสินค้าจริง ↗</a></div>
      </div>
    </article>
  )
}

function ProductsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [products, setProducts] = useState(REAL_PRODUCT_CATALOG)
  const [activeObjectId, setActiveObjectId] = useState('')
  const [selections, setSelections] = useState({})
  const [saveError, setSaveError] = useState('')

  const objectDecisions = getObjectDecisions(project?.decisions)
  const objects = useMemo(() => {
    if (project?.detectedObjects?.length) return project.detectedObjects
    return Object.keys(objectDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
  }, [objectDecisions, project?.detectedObjects])
  const visibleObjects = objects.filter((item) => objectDecisions[item.id] !== 'remove')

  useEffect(() => {
    let cancelled = false
    getProject(id).then(async (loaded) => {
      if (cancelled || !loaded) return
      setProject(loaded)
      const loadedDecisions = getObjectDecisions(loaded.decisions)
      const loadedObjects = loaded.detectedObjects?.length
        ? loaded.detectedObjects
        : Object.keys(loadedDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
      const matchableObjects = loadedObjects.filter((item) => loadedDecisions[item.id] !== 'remove')
      setActiveObjectId(matchableObjects[0]?.id ?? '')

      const { data } = await supabase.from('products').select('*')
      if (cancelled) return
      const catalog = mergeCatalog(data ?? [])
      setProducts(catalog)

      const existing = loaded.productSelections ?? {}
      let runningTotal = 0
      const initialSelections = {}
      for (const item of matchableObjects) {
        const category = normalizeCategory(item)
        const brief = loaded.replacementBriefs?.[item.id]
        const itemBudget = loadedDecisions[item.id] === 'replace' && Number(brief?.budget) > 0 ? Number(brief.budget) : loaded.budget
        const candidates = catalog.filter((product) => product.category === category && product.price <= itemBudget)
        const preferred = candidates.find((product) => product.id === existing[item.id]?.productId)
        const ranked = [...candidates].sort((first, second) => {
          const noteDiff = visualMatchScore(second, item, brief?.note) - visualMatchScore(first, item, brief?.note)
          const styleDiff = Number(isStyleMatch(second, loaded.style)) - Number(isStyleMatch(first, loaded.style))
          return noteDiff || styleDiff || second.match - first.match || first.price - second.price
        })
        const affordable = [preferred, ...ranked].filter(Boolean).find((product) => runningTotal + product.price <= loaded.budget)
        if (affordable) {
          initialSelections[item.id] = affordable.id
          runningTotal += affordable.price
        }
      }
      setSelections(initialSelections)
    }).finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [id])

  const total = useMemo(() => Object.values(selections).reduce((sum, productId) => sum + (products.find((product) => product.id === productId)?.price ?? 0), 0), [selections, products])
  const activeObject = visibleObjects.find((item) => item.id === activeObjectId) ?? visibleObjects[0]
  const activeCategory = normalizeCategory(activeObject)
  const activeBrief = project?.replacementBriefs?.[activeObject?.id]
  const activeDecision = objectDecisions[activeObject?.id] ?? 'keep'
  const selectedProductForActive = products.find((product) => product.id === selections[activeObject?.id])
  const totalWithoutActive = total - (selectedProductForActive?.price ?? 0)
  const remainingForActive = Math.max(0, (project?.budget ?? 0) - totalWithoutActive)
  const itemLimit = activeDecision === 'replace' && Number(activeBrief?.budget) > 0 ? Math.min(remainingForActive, Number(activeBrief.budget)) : remainingForActive
  const alternatives = products.filter((product) => product.category === activeCategory).sort((first, second) => {
    const noteDiff = visualMatchScore(second, activeObject, activeBrief?.note) - visualMatchScore(first, activeObject, activeBrief?.note)
    const styleDiff = Number(isStyleMatch(second, project?.style)) - Number(isStyleMatch(first, project?.style))
    return noteDiff || styleDiff || second.match - first.match
  })
  const selectedCount = Object.values(selections).filter(Boolean).length
  const allItemsSelected = selectedCount === visibleObjects.length

  if (isLoading) return <main className="products-missing"><h1>กำลังโหลดโปรเจกต์...</h1></main>
  if (!project) return <main className="products-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  function buildProductSelections() {
    return Object.fromEntries(Object.entries(selections).filter(([, productId]) => productId).map(([objectId, productId]) => {
      const product = products.find((item) => item.id === productId)
      const object = objects.find((item) => item.id === objectId)
      return [objectId, {
        productId, objectName: object?.name, category: normalizeCategory(object), decision: objectDecisions[objectId] ?? 'keep',
        name: product?.name, price: product?.price, store: product?.store, sku: product?.sku, size: product?.size,
        url: product?.url, imageUrl: product?.image_url, match: product?.match, verifiedAt: CATALOG_VERIFIED_AT,
        visualTags: object?.visual_tags ?? object?.visualTags ?? [],
      }]
    }))
  }

  async function saveProject() {
    if (!allItemsSelected || total > project.budget) return
    setSaveError('')
    try {
      await updateProject(project.id, { productSelections: buildProductSelections(), estimatedTotal: total, stage: 'saved', status: 'done', progress: 100 })
      navigate(`/project/${project.id}/summary`)
    } catch (error) {
      setSaveError(error.message || 'บันทึกชุดสินค้าไม่สำเร็จ')
    }
  }

  async function saveDraft() {
    setSaveError('')
    try {
      await updateProject(project.id, { productSelections: buildProductSelections(), estimatedTotal: total, stage: 'product-matching', status: 'in-progress', progress: 84 })
      navigate('/home')
    } catch (error) {
      setSaveError(error.message || 'บันทึกร่างไม่สำเร็จ')
    }
  }

  function selectProduct(product) {
    if (!activeObject || product.price > itemLimit || totalWithoutActive + product.price > project.budget) return
    setSelections((current) => ({ ...current, [activeObject.id]: product.id }))
  }

  const roomPreview = project.generatedImages?.find((room) => room.sourceImageId === activeObject?.roomId)?.generatedImageUrl
  const activeVisualTags = activeObject?.visual_tags ?? activeObject?.visualTags ?? []

  return (
    <div className="products-shell">
      <header className="products-topbar"><Link to={`/project/${project.id}/decisions`}>← กลับไปตัดสินใจ</Link><span>ROOMLY AI · PRODUCT MATCH</span><button className="products-save-draft" type="button" onClick={saveDraft}>บันทึกร่างและออก</button></header>
      <main className="products-content">
        <header className="products-heading"><div><p>05 · REAL PRODUCT MATCH</p><h1>จับคู่แบบ AI กับสินค้าที่มีอยู่จริง</h1><span>ใช้ประเภทวัตถุ สไตล์ โจทย์ Replace และงบคงเหลือในการจัดอันดับ พร้อมลิงก์ตรงไปยังหน้าสินค้า</span></div><div className={`products-budget-status ${total > project.budget ? 'is-over' : ''}`}><span>HARD BUDGET LIMIT · ห้ามเกิน</span><strong>฿{new Intl.NumberFormat('th-TH').format(total)} <small>/ ฿{new Intl.NumberFormat('th-TH').format(project.budget)}</small></strong><i><b style={{ width: `${Math.min(100, (total / project.budget) * 100)}%` }} /></i></div></header>
        {saveError ? <p className="products-error" role="alert">{saveError}</p> : null}
        <nav className="products-category-tabs" aria-label="วัตถุที่ต้องจับคู่">{visibleObjects.map((item, index) => <button className={activeObject?.id === item.id ? 'is-active' : ''} type="button" onClick={() => setActiveObjectId(item.id)} key={item.id}><span>{String(index + 1).padStart(2, '0')}</span>{item.name || CATEGORY_LABELS[normalizeCategory(item)]}<small>ห้อง {item.roomNumber ?? 1} · {selections[item.id] ? 'เลือกแล้ว' : 'ยังไม่เลือก'}</small></button>)}</nav>
        {activeObject ? <section className="products-layout"><aside className="products-preview"><img src={roomPreview || project.generatedImageUrl || productBoard} alt={`ภาพ AI ที่ใช้จับคู่ ${activeObject.name}`} /><div><span>AI GENERATED REFERENCE</span><strong>{activeObject.name}</strong><p>{activeDecision === 'replace' ? `Replace · ${activeBrief?.note || 'ใช้สไตล์และประเภทวัตถุเป็นหลัก'}` : 'Keep · ค้นหาสินค้าจริงที่ใกล้แบบ AI'}{activeVisualTags.length ? ` · AI มองเห็น: ${activeVisualTags.join(', ')}` : ''}</p></div></aside><section className="products-alternatives"><div className="products-section-title"><div><span>{CATEGORY_LABELS[activeCategory] ?? activeObject.category}</span><h2>สินค้าจริงที่แนะนำ</h2></div><small>รายการนี้ใช้ได้ไม่เกิน ฿{new Intl.NumberFormat('th-TH').format(itemLimit)}</small></div><div className="products-grid">{alternatives.length ? alternatives.map((product) => <ProductCard product={product} selected={selections[activeObject.id] === product.id} disabled={selections[activeObject.id] !== product.id && product.price > itemLimit} onSelect={() => selectProduct(product)} styleMatch={isStyleMatch(product, project.style)} styleLabel={formatStyleLabel(project.style)} key={product.id} />) : <p className="products-empty">ยังไม่มีสินค้าจริงในหมวดนี้ที่ตรวจสอบแหล่งอ้างอิงแล้ว ระบบจะไม่แนะนำสินค้าคนละประเภทแทน</p>}</div></section></section> : <p className="products-empty">ไม่มีวัตถุที่ต้องจับคู่สินค้า</p>}
        <p className="products-catalog-note">ข้อมูลและราคาอ้างอิงตรวจสอบล่าสุด {CATALOG_VERIFIED_AT} · กรุณาตรวจสอบราคาและสต็อกปัจจุบันจากหน้าร้านก่อนสั่งซื้อ</p>
        <footer className="products-footer"><div><span>สรุปชุดสินค้า</span><strong>{selectedCount}/{visibleObjects.length} ชิ้น · ฿{new Intl.NumberFormat('th-TH').format(total)}</strong><small>{total > project.budget ? 'ยอดรวมเกินงบ ระบบไม่อนุญาตให้บันทึก' : !allItemsSelected ? 'เลือกสินค้าให้ครบทุกชิ้นโดยต้องอยู่ในงบ' : `ผ่านเงื่อนไข · เหลือ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}`}</small></div><button type="button" disabled={!allItemsSelected || total > project.budget} onClick={saveProject}>บันทึกโปรเจกต์ฉบับสมบูรณ์ →</button></footer>
      </main>
    </div>
  )
}

export default ProductsPage
