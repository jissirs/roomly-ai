import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CATALOG_VERIFIED_AT, REAL_PRODUCT_CATALOG } from '../../data/realProductCatalog'
import { getObjectDecisions, getProject, updateProject, withWorkflowData } from '../../lib/projects'
import { api } from '../../lib/api'
import { getObjectOutlines } from '../../lib/objectOutlines'
import { fitsRoom } from '../../lib/productPlan'
import { fetchLivePrices, formatCheckedTime } from '../../lib/livePrices'
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

function sourceHost(url) {
  try {
    const { hostname, pathname } = new URL(url)
    return `${hostname.replace(/^www\./, '')}${pathname.split('/').slice(1, 3).map((part) => `/${part}`).join('')}`
  } catch {
    return 'หน้าสินค้า'
  }
}

function formatCheckedDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(date)
}

function ProductCard({ product, selected, disabled, onSelect, styleMatch, styleLabel, oversizeNote, livePrice, pricePending }) {
  const isLive = Boolean(livePrice?.price)
  const shownPrice = isLive ? livePrice.price : product.price
  const outOfStock = livePrice?.in_stock === false
  return (
    <article className={`products-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-unaffordable' : ''}`.trim()}>
      <div className="products-card-image"><img src={product.image_url || productBoard} alt={product.name} /><span>{product.match}% MATCH</span></div>
      <div className="products-card-body">
        <div className="products-card-source"><span className={`is-${product.store.toLowerCase()}`}>{product.store}</span><small>SKU {product.sku || product.id}</small></div>
        {styleMatch ? <span className="products-card-style-badge">ตรงสไตล์ {styleLabel}</span> : null}
        <h3>{product.name}</h3>{oversizeNote ? <p className="products-card-warning">{oversizeNote}</p> : null}
        <p>{product.size}</p>
        <div className="products-card-price"><strong>฿{new Intl.NumberFormat('th-TH').format(shownPrice)}</strong><small className={isLive ? 'is-live' : ''}>{isLive ? 'ราคาสดจากร้านค้า' : pricePending ? 'กำลังตรวจราคาจากร้านค้า…' : 'ราคาอ้างอิง'}</small></div>
        {isLive && livePrice.price !== product.price ? <p className="products-card-price-diff">ราคาในแคตตาล็อกเดิม ฿{new Intl.NumberFormat('th-TH').format(product.price)} · ร้านค้าปรับราคาแล้ว</p> : null}
        {livePrice?.error ? <p className="products-card-price-diff">ดึงราคาจากร้านไม่สำเร็จ ใช้ราคาอ้างอิงจากแคตตาล็อกแทน</p> : null}
        {outOfStock ? <p className="products-card-price-diff is-out">ร้านค้าแจ้งว่าสินค้าหมด</p> : null}
        <p className="products-card-source-note">
          ที่มาของราคา: <a href={product.url} target="_blank" rel="noreferrer">{sourceHost(product.url)}</a> · ตรวจเมื่อ {isLive ? formatCheckedTime(livePrice.checked_at) : formatCheckedDate(product.price_checked_at || product.verified_at || CATALOG_VERIFIED_AT)}
        </p>
        <div className="products-card-actions"><button type="button" disabled={disabled || (outOfStock && !selected)} onClick={onSelect}>{selected ? 'เลือกแล้ว ✓' : outOfStock ? 'สินค้าหมด' : disabled ? 'เกินงบที่กำหนด' : 'เลือกชิ้นนี้'}</button><a href={product.affiliate_url || product.url} target="_blank" rel={product.affiliate_url ? 'noreferrer sponsored' : 'noreferrer'}>ดูสินค้าจริง ↗</a></div>
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
  const [skipped, setSkipped] = useState([])
  const [livePrices, setLivePrices] = useState({})
  const [pricesPending, setPricesPending] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [rebalanceNotes, setRebalanceNotes] = useState([])
  const [priceRetry, setPriceRetry] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [showLeave, setShowLeave] = useState(false)
  const userTouched = useRef(new Set())
  const requestedPrices = useRef(new Set())
  const pendingPriceRequests = useRef(0)
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)

  const objectDecisions = getObjectDecisions(project?.decisions)
  const objects = useMemo(() => {
    if (project?.detectedObjects?.length) return project.detectedObjects
    return Object.keys(objectDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
  }, [objectDecisions, project?.detectedObjects])
  const visibleObjects = objects.filter((item) => objectDecisions[item.id] !== 'remove' && !item.removedFromImage)

  useEffect(() => {
    let cancelled = false
    getProject(id).then(async (loaded) => {
      if (cancelled || !loaded) return
      setProject(loaded)
      const loadedDecisions = getObjectDecisions(loaded.decisions)
      const loadedObjects = loaded.detectedObjects?.length
        ? loaded.detectedObjects
        : Object.keys(loadedDecisions).map((objectId) => ({ id: objectId, ...(LEGACY_OBJECTS[objectId] ?? { name: objectId, category: objectId }) }))
      const matchableObjects = loadedObjects.filter((item) => loadedDecisions[item.id] !== 'remove' && !item.removedFromImage)
      setActiveObjectId(matchableObjects[0]?.id ?? '')

      const { data } = await supabase.from('products').select('*')
      if (cancelled) return
      const catalog = mergeCatalog(data ?? [])
      setProducts(catalog)

      const planned = new Set((loaded.plannedProducts ?? []).map((item) => item.productId))
      const existing = loaded.productSelections ?? {}
      let runningTotal = 0
      const initialSelections = {}
      const initialSkipped = []
      for (const item of matchableObjects) {
        const category = normalizeCategory(item)
        if (existing[item.id]?.skipped || !catalog.some((product) => product.category === category)) {
          initialSkipped.push(item.id)
          continue
        }
        const brief = loaded.replacementBriefs?.[item.id]
        const itemBudget = loadedDecisions[item.id] === 'replace' && Number(brief?.budget) > 0 ? Number(brief.budget) : loaded.budget
        const candidates = catalog.filter((product) => product.category === category && product.price <= itemBudget)
        const preferred = candidates.find((product) => product.id === existing[item.id]?.productId)
        const ranked = [...candidates].sort((first, second) => {
          const noteDiff = visualMatchScore(second, item, brief?.note) - visualMatchScore(first, item, brief?.note)
          const styleDiff = Number(isStyleMatch(second, loaded.style)) - Number(isStyleMatch(first, loaded.style))
          const plannedDiff = Number(planned.has(second.id)) - Number(planned.has(first.id))
          const fitDiff = Number(fitsRoom(second, loaded.dimensions)) - Number(fitsRoom(first, loaded.dimensions))
          return fitDiff || plannedDiff || noteDiff || styleDiff || second.match - first.match || first.price - second.price
        })
        const affordable = [preferred, ...ranked].filter(Boolean).find((product) => runningTotal + product.price <= loaded.budget)
        if (affordable) {
          initialSelections[item.id] = affordable.id
          runningTotal += affordable.price
        }
      }
      setSelections(initialSelections)
      setSkipped(initialSkipped)
    }).finally(() => !cancelled && setIsLoading(false))
    return () => { cancelled = true }
  }, [id])

  const priceOf = (product) => livePrices[product?.id]?.price ?? product?.price ?? 0
  const total = useMemo(() => Object.values(selections).reduce((sum, productId) => {
    const product = products.find((item) => item.id === productId)
    return sum + (livePrices[productId]?.price ?? product?.price ?? 0)
  }, 0), [selections, products, livePrices])
  const activeObject = visibleObjects.find((item) => item.id === activeObjectId) ?? visibleObjects[0]
  const activeCategory = normalizeCategory(activeObject)
  const activeBrief = project?.replacementBriefs?.[activeObject?.id]
  const activeDecision = objectDecisions[activeObject?.id] ?? 'keep'
  const selectedProductForActive = products.find((product) => product.id === selections[activeObject?.id])
  const totalWithoutActive = total - (selectedProductForActive ? priceOf(selectedProductForActive) : 0)
  const remainingForActive = Math.max(0, (project?.budget ?? 0) - totalWithoutActive)
  const itemLimit = activeDecision === 'replace' && Number(activeBrief?.budget) > 0 ? Math.min(remainingForActive, Number(activeBrief.budget)) : remainingForActive
  const alternatives = products.filter((product) => product.category === activeCategory).sort((first, second) => {
    const noteDiff = visualMatchScore(second, activeObject, activeBrief?.note) - visualMatchScore(first, activeObject, activeBrief?.note)
    const styleDiff = Number(isStyleMatch(second, project?.style)) - Number(isStyleMatch(first, project?.style))
    const fitDiff = Number(fitsRoom(second, project?.dimensions)) - Number(fitsRoom(first, project?.dimensions))
    return fitDiff || noteDiff || styleDiff || second.match - first.match
  })
  const resolvedCount = visibleObjects.filter((item) => selections[item.id] || skipped.includes(item.id)).length
  const skippedCount = visibleObjects.filter((item) => skipped.includes(item.id) && !selections[item.id]).length
  const soldOutSelected = visibleObjects.filter((item) => selections[item.id] && livePrices[selections[item.id]]?.in_stock === false)
  const allItemsSelected = visibleObjects.length > 0 && resolvedCount === visibleObjects.length && soldOutSelected.length === 0
  const catalogTotal = Object.values(selections).reduce((sum, productId) => sum + (products.find((product) => product.id === productId)?.price ?? 0), 0)
  const livePriceDelta = total - catalogTotal

  const wantedPriceIds = [...new Set([...alternatives.map((product) => product.id), ...Object.values(selections).filter(Boolean)])].join(',')
  useEffect(() => {
    if (!project || !wantedPriceIds) return
    const wanted = products.filter((product) => wantedPriceIds.split(',').includes(product.id) && !requestedPrices.current.has(product.id))
    if (!wanted.length) return
    // Results are merged by product id, so a reply that arrives after the page
    // re-rendered is still valid and must not be thrown away.
    wanted.forEach((product) => requestedPrices.current.add(product.id))
    pendingPriceRequests.current += 1
    setPricesPending(true)
    fetchLivePrices(wanted).then((result) => {
      setLivePrices((current) => ({ ...current, ...result }))
    }).finally(() => {
      pendingPriceRequests.current -= 1
      if (pendingPriceRequests.current === 0) setPricesPending(false)
    })
  }, [wantedPriceIds, products, project, priceRetry])

  // The first pick uses catalog prices. Once live prices arrive and push the
  // total over budget, swap picks the user has not touched for cheaper ones.
  useEffect(() => {
    if (!project || pricesPending) return
    const priceFor = (product) => livePrices[product.id]?.price ?? product.price
    const byId = new Map(products.map((product) => [product.id, product]))
    const next = { ...selections }
    const totalNow = () => Object.values(next).reduce((sum, productId) => sum + (byId.has(productId) ? priceFor(byId.get(productId)) : 0), 0)
    if (totalNow() <= project.budget) return
    const swaps = []
    const autoIds = Object.keys(next)
      .filter((objectId) => !userTouched.current.has(objectId) && byId.has(next[objectId]))
      .sort((first, second) => priceFor(byId.get(next[second])) - priceFor(byId.get(next[first])))
    for (const objectId of autoIds) {
      if (totalNow() <= project.budget) break
      const current = byId.get(next[objectId])
      const cheaper = products
        .filter((product) => product.category === current.category && priceFor(product) < priceFor(current) && livePrices[product.id]?.in_stock !== false)
        .sort((first, second) => second.match - first.match)
      if (!cheaper.length) continue
      const pick = cheaper.find((product) => totalNow() - priceFor(current) + priceFor(product) <= project.budget)
        ?? [...cheaper].sort((first, second) => priceFor(first) - priceFor(second))[0]
      next[objectId] = pick.id
      swaps.push(`${objects.find((item) => item.id === objectId)?.name ?? current.category}: ${current.name} → ${pick.name}`)
    }
    if (!swaps.length) return
    setSelections(next)
    setRebalanceNotes((currentNotes) => [...new Set([...currentNotes, ...swaps])])
  }, [selections, livePrices, pricesPending, project, products, objects])

  // Closing the tab with unsaved choices
  useEffect(() => {
    if (!isDirty) return undefined
    const warn = (event) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  if (isLoading) return <main className="products-missing"><h1>กำลังโหลดโปรเจกต์...</h1></main>
  if (!project) return <main className="products-missing"><h1>ไม่พบโปรเจกต์</h1><Link to="/home">กลับไปที่คลัง</Link></main>

  function buildProductSelections() {
    const skippedEntries = visibleObjects
      .filter((item) => skipped.includes(item.id) && !selections[item.id])
      .map((item) => [item.id, { skipped: true, objectName: item.name, category: normalizeCategory(item), decision: objectDecisions[item.id] ?? 'keep' }])
    const chosenEntries = Object.entries(selections).filter(([, productId]) => productId).map(([objectId, productId]) => {
      const product = products.find((item) => item.id === productId)
      const object = objects.find((item) => item.id === objectId)
      return [objectId, {
        productId, objectName: object?.name, category: normalizeCategory(object), decision: objectDecisions[objectId] ?? 'keep',
        name: product?.name, price: priceOf(product), priceSource: livePrices[productId]?.price ? 'live' : 'catalog', inStock: livePrices[productId]?.in_stock ?? null, store: product?.store, sku: product?.sku, size: product?.size,
        url: product?.affiliate_url || product?.url, imageUrl: product?.image_url, match: product?.match, verifiedAt: livePrices[productId]?.checked_at || product?.price_checked_at || product?.verified_at || CATALOG_VERIFIED_AT,
        visualTags: object?.visual_tags ?? object?.visualTags ?? [],
      }]
    })
    return Object.fromEntries([...chosenEntries, ...skippedEntries])
  }

  async function saveProject() {
    if (!allItemsSelected || total > project.budget || savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    setSaveError('')
    try {
      await updateProject(project.id, { productSelections: buildProductSelections(), estimatedTotal: total, stage: 'saved', status: 'done', progress: 100 })
      navigate(`/project/${project.id}/summary`)
    } catch (error) {
      setSaveError(error.message || 'บันทึกชุดสินค้าไม่สำเร็จ')
      savingRef.current = false
      setIsSaving(false)
    }
  }

  async function saveDraft() {
    if (savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    setSaveError('')
    try {
      await updateProject(project.id, { productSelections: buildProductSelections(), estimatedTotal: total, stage: 'product-matching', status: 'in-progress', progress: 92 })
      navigate('/home')
    } catch (error) {
      setSaveError(error.message || 'บันทึกร่างไม่สำเร็จ')
      savingRef.current = false
      setIsSaving(false)
    }
  }

  function selectProduct(product) {
    if (!activeObject || priceOf(product) > itemLimit || totalWithoutActive + priceOf(product) > project.budget || livePrices[product.id]?.in_stock === false) return
    userTouched.current.add(activeObject.id)
    setIsDirty(true)
    setRebalanceNotes([])
    setSelections((current) => ({ ...current, [activeObject.id]: product.id }))
    setSkipped((current) => current.filter((objectId) => objectId !== activeObject.id))
  }

  function skipActiveObject() {
    if (!activeObject) return
    userTouched.current.add(activeObject.id)
    setIsDirty(true)
    setRebalanceNotes([])
    setSelections((current) => {
      const next = { ...current }
      delete next[activeObject.id]
      return next
    })
    setSkipped((current) => (current.includes(activeObject.id) ? current : [...current, activeObject.id]))
  }

  // Does the AI picture show the product that is selected? The picture was
  // generated from specific real products; picking another one here (or a
  // Replace the AI invented) means the picture and the shopping list differ.
  const pictureDesign = project.generatedImages?.find((room) => room.sourceImageId === activeObject?.roomId) ?? project.generatedImages?.[0]
  const selectedProduct = products.find((product) => product.id === selections[activeObject?.id])
  const pictureProductId = activeObject?.shownProductId ?? activeObject?.realProduct?.productId ?? null
  const pictureMatches = Boolean(selectedProduct) && pictureProductId === selectedProduct.id

  async function applyProductToPicture() {
    if (!selectedProduct || !pictureDesign?.generatedImageUrl || isApplying) return
    setIsApplying(true)
    setApplyError('')
    try {
      const result = await api.post(`/projects/${project.id}/decisions/regenerate`, {
        image_url: pictureDesign.generatedImageUrl,
        object_name: activeObject.name,
        category: activeObject.category,
        outlines: getObjectOutlines(activeObject),
        action: 'replace',
        style: project.style,
        product_name: selectedProduct.name,
        product_image_url: selectedProduct.image_url,
      })
      const lastAction = [...(pictureDesign.history ?? [])].reverse().find((entry) => entry.objectId === activeObject.id)?.action
      const nextDesign = {
        ...pictureDesign,
        generatedImageUrl: result.image_url,
        history: [...(pictureDesign.history ?? []), {
          imageUrl: pictureDesign.generatedImageUrl,
          objectId: activeObject.id,
          objectName: activeObject.name,
          action: 'replace',
          previousDecision: lastAction ?? 'keep',
          appliedProductId: selectedProduct.id,
          previousShownProductId: pictureProductId,
        }].slice(-10),
        future: [],
      }
      const nextDesigns = project.generatedImages.map((room) => (room.sourceImageId === pictureDesign.sourceImageId ? nextDesign : room))
      const nextObjects = project.detectedObjects.map((item) => (item.id === activeObject.id ? { ...item, shownProductId: selectedProduct.id } : item))
      const updated = await updateProject(project.id, {
        decisions: withWorkflowData(project.decisions ?? {}, { generatedImages: nextDesigns, detectedObjects: nextObjects }),
        generatedImageUrl: nextDesigns[0]?.generatedImageUrl,
      })
      setProject(updated)
    } catch (error) {
      setApplyError(error.message || 'ใส่สินค้าลงในภาพไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsApplying(false)
    }
  }

  function retryPrices() {
    Object.entries(livePrices).forEach(([productId, value]) => { if (value.error) requestedPrices.current.delete(productId) })
    setLivePrices((current) => Object.fromEntries(Object.entries(current).filter(([, value]) => !value.error)))
    setPriceRetry((count) => count + 1)
  }
  const livePriceFailures = Object.values(livePrices).filter((value) => value.error).length

  const roomPreview = project.generatedImages?.find((room) => room.sourceImageId === activeObject?.roomId)?.generatedImageUrl
  const activeVisualTags = activeObject?.visual_tags ?? activeObject?.visualTags ?? []

  return (
    <div className="products-shell">
      <header className="products-topbar"><Link to={`/project/${project.id}/summary`} onClick={(event) => { if (isDirty) { event.preventDefault(); setShowLeave(true) } }}>← กลับไปดูสรุป</Link><span>ROOMLY AI · PRODUCT MATCH</span><button className="products-save-draft" type="button" disabled={isSaving} onClick={saveDraft}>บันทึกร่างและออก</button></header>
      <main className="products-content">
        <header className="products-heading"><div><p>06 · REAL PRODUCT MATCH</p><h1>จับคู่แบบ AI กับสินค้าที่มีอยู่จริง</h1><span>ใช้ประเภทวัตถุ สไตล์ โจทย์ Replace และงบคงเหลือในการจัดอันดับ พร้อมลิงก์ตรงไปยังหน้าสินค้า</span></div><div className={`products-budget-status ${total > project.budget ? 'is-over' : ''}`}><span>HARD BUDGET LIMIT · ห้ามเกิน</span><strong>฿{new Intl.NumberFormat('th-TH').format(total)} <small>/ ฿{new Intl.NumberFormat('th-TH').format(project.budget)}</small></strong><i><b style={{ width: `${Math.min(100, (total / project.budget) * 100)}%` }} /></i><p className="products-budget-note">{total > project.budget ? `เกินงบอยู่ ฿${new Intl.NumberFormat('th-TH').format(total - project.budget)}` : `เหลืองบ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}`}{livePriceDelta ? ` · ราคาสดต่างจากแคตตาล็อก ${livePriceDelta > 0 ? '+' : '−'}฿${new Intl.NumberFormat('th-TH').format(Math.abs(livePriceDelta))}` : ''}</p></div></header>
        {saveError ? <p className="products-error" role="alert">{saveError}</p> : null}
        {rebalanceNotes.length ? <p className="products-rebalance" role="status">ราคาสดสูงกว่าแคตตาล็อก ระบบจึงเปลี่ยนสินค้าที่เลือกอัตโนมัติให้อยู่ในงบ: {rebalanceNotes.join(' · ')}</p> : null}
        <nav className="products-category-tabs" aria-label="วัตถุที่ต้องจับคู่">{visibleObjects.map((item, index) => <button className={activeObject?.id === item.id ? 'is-active' : ''} type="button" onClick={() => setActiveObjectId(item.id)} key={item.id}><span>{String(index + 1).padStart(2, '0')}</span>{item.name || CATEGORY_LABELS[normalizeCategory(item)]}<small>{selections[item.id] ? (livePrices[selections[item.id]]?.in_stock === false ? 'สินค้าหมด' : 'เลือกแล้ว') : skipped.includes(item.id) ? 'ข้ามแล้ว' : 'ยังไม่เลือก'}</small></button>)}</nav>
        {activeObject ? <section className="products-layout"><aside className="products-preview"><img src={roomPreview || project.generatedImageUrl || productBoard} alt={`ภาพ AI ที่ใช้จับคู่ ${activeObject.name}`} /><div><span>AI GENERATED REFERENCE</span><strong>{activeObject.name}</strong><p>{activeDecision === 'replace' ? `Replace · ${activeBrief?.note || 'ใช้สไตล์และประเภทวัตถุเป็นหลัก'}` : 'Keep · ค้นหาสินค้าจริงที่ใกล้แบบ AI'}{activeVisualTags.length ? ` · AI มองเห็น: ${activeVisualTags.join(', ')}` : ''}</p>{selectedProduct ? <div className={`products-picture-sync ${pictureMatches ? 'is-match' : ''}`}>{pictureMatches ? <p>✓ ภาพ AI แสดงสินค้าชิ้นนี้จริง</p> : <><p>ภาพ AI ยังไม่ได้ใช้สินค้าที่เลือก</p><button type="button" disabled={isApplying || !pictureDesign?.generatedImageUrl} onClick={applyProductToPicture}>{isApplying ? 'กำลังใส่สินค้าลงในภาพ…' : 'ใช้สินค้านี้ในภาพ (ใช้เครดิต AI 1 ครั้ง)'}</button></>}{applyError ? <small role="alert">{applyError}</small> : null}{project.generatedImages?.length > 1 && pictureDesign?.history?.length ? <small>มุมอื่นยังไม่ตรงกับมุมหลัก <Link to={`/project/${project.id}/decisions`}>ไปอัปเดตที่หน้าตัดสินใจ</Link></small> : null}</div> : null}</div></aside><section className="products-alternatives"><div className="products-section-title"><div><span>{CATEGORY_LABELS[activeCategory] ?? activeObject.category}</span><h2>สินค้าจริงที่แนะนำ</h2></div><small>รายการนี้ใช้ได้ไม่เกิน ฿{new Intl.NumberFormat('th-TH').format(itemLimit)}</small><button className="products-skip" type="button" onClick={skipActiveObject} disabled={skipped.includes(activeObject.id) && !selections[activeObject.id]}>{skipped.includes(activeObject.id) && !selections[activeObject.id] ? 'ข้ามแล้ว ✓ เลือกสินค้าเพื่อยกเลิกการข้าม' : 'ข้ามชิ้นนี้ ไม่ซื้อสินค้า'}</button></div><div className="products-grid">{alternatives.length ? alternatives.map((product) => <ProductCard product={product} selected={selections[activeObject.id] === product.id} disabled={selections[activeObject.id] !== product.id && priceOf(product) > itemLimit} onSelect={() => selectProduct(product)} styleMatch={isStyleMatch(product, project.style)} styleLabel={formatStyleLabel(project.style)} livePrice={livePrices[product.id]} pricePending={pricesPending && !livePrices[product.id]} oversizeNote={!fitsRoom(product, project.dimensions) ? `อาจใหญ่เกินไปสำหรับห้องขนาด ${project.dimensions.width}×${project.dimensions.length} ม.` : ''} key={product.id} />) : <p className="products-empty">ยังไม่มีสินค้าจริงในหมวดนี้ที่ตรวจสอบแหล่งอ้างอิงแล้ว ระบบจะไม่แนะนำสินค้าคนละประเภทแทน</p>}</div></section></section> : <p className="products-empty">ไม่มีวัตถุที่ต้องจับคู่สินค้า</p>}
        {livePriceFailures ? <p className="products-price-retry" role="alert">ตรวจราคาสดไม่สำเร็จ {livePriceFailures} รายการ ใช้ราคาอ้างอิงจากแคตตาล็อกอยู่ <button type="button" onClick={retryPrices}>ลองตรวจราคาใหม่</button></p> : null}
        <p className="products-catalog-note">{pricesPending ? 'กำลังตรวจราคาปัจจุบันจากหน้าร้านค้า… · ' : ''}รายการที่ขึ้น “ราคาสดจากร้านค้า” ดึงจากหน้าสินค้าของร้านขณะเปิดหน้านี้ ส่วนรายการอื่นใช้ราคาอ้างอิงจากแคตตาล็อก (ตรวจล่าสุด {CATALOG_VERIFIED_AT}) · กรุณาตรวจสอบราคาและสต็อกจากหน้าร้านอีกครั้งก่อนสั่งซื้อ</p>
        <footer className="products-footer"><div><span>สรุปชุดสินค้า</span><strong>{resolvedCount}/{visibleObjects.length} ชิ้น{skippedCount ? ` (ข้าม ${skippedCount})` : ''} · ฿{new Intl.NumberFormat('th-TH').format(total)}</strong><small>{total > project.budget ? 'ยอดรวมเกินงบ ระบบไม่อนุญาตให้บันทึก' : soldOutSelected.length ? `ร้านค้าแจ้งว่าสินค้าที่เลือกหมด ${soldOutSelected.length} ชิ้น (${soldOutSelected.map((item) => item.name).join(', ')}) กรุณาเปลี่ยนสินค้า` : !allItemsSelected ? 'เลือกสินค้าหรือกด “ข้าม” ให้ครบทุกชิ้น โดยต้องอยู่ในงบ' : `ผ่านเงื่อนไข · เหลือ ฿${new Intl.NumberFormat('th-TH').format(project.budget - total)}`}</small></div><button type="button" disabled={!allItemsSelected || total > project.budget || isSaving} onClick={saveProject}>{isSaving ? 'กำลังบันทึก...' : 'บันทึกโปรเจกต์ฉบับสมบูรณ์ →'}</button></footer>
      </main>
      {showLeave ? (
        <div className="products-modal" role="dialog" aria-modal="true" aria-label="ออกโดยไม่บันทึก">
          <div>
            <h2>มีการเลือกสินค้าที่ยังไม่ได้บันทึก</h2>
            <p>ถ้าออกตอนนี้ สินค้าที่เลือกไว้ในหน้านี้จะหายไป</p>
            <div className="products-modal-actions">
              <button type="button" onClick={() => setShowLeave(false)}>อยู่ต่อ</button>
              <button type="button" onClick={() => navigate(`/project/${project.id}/summary`)}>ออกโดยไม่บันทึก</button>
              <button type="button" className="is-primary" disabled={isSaving} onClick={saveDraft}>บันทึกร่างและออก</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ProductsPage
