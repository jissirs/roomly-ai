import { REAL_PRODUCT_CATALOG } from '../data/realProductCatalog'

// Categories worth furnishing per room type, in priority order.
const ROOM_CATEGORIES = {
  'living-room': ['sofa', 'coffee-table', 'rug', 'chair', 'television', 'lamp', 'curtain', 'plant'],
  bedroom: ['bed', 'nightstand', 'rug', 'curtain', 'lamp', 'mirror', 'plant'],
  studio: ['bed', 'sofa', 'coffee-table', 'desk', 'rug', 'lamp', 'curtain'],
  workspace: ['desk', 'chair', 'shelf', 'cabinet', 'lamp', 'rug', 'plant'],
}
const MAX_ITEMS = 7

// Categories that stand on the floor and use up walking space (a rug lies
// under other furniture, so it only has to fit inside the room).
const FLOOR_CATEGORIES = new Set(['bed', 'coffee-table', 'desk', 'nightstand', 'cabinet', 'shelf', 'television'])
// Hanging or wall items (curtain, mirror, lamp, plant) have sizes that are not a floor footprint.
const SIZED_CATEGORIES = new Set(['bed', 'rug', 'coffee-table', 'desk', 'nightstand', 'cabinet', 'shelf', 'television'])
const MAX_SHARE_OF_FLOOR = { bed: 0.35, rug: 0.5 }
const DEFAULT_MAX_SHARE = 0.2
const MAX_TOTAL_FLOOR_SHARE = 0.45

/** Reads "150x200 ซม." / "120x35x36 ซม." / "160CM" from a product's size or name; null when unknown. */
export function parseFootprintCm(product) {
  const text = `${product.size ?? ''} ${product.name ?? ''}`
  const pair = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:ซม|cm)/i)
  if (pair) return { a: Number(pair[1]), b: Number(pair[2]) }
  const single = text.match(/(\d{2,3})\s*(?:ซม|cm)/i)
  return single ? { a: Number(single[1]), b: null } : null
}

/** Valid {width,length} in metres, or null when the room size is missing/implausible. */
export function getRoomSize(dimensions) {
  const width = Number(dimensions?.width)
  const length = Number(dimensions?.length)
  return width > 0 && length > 0 ? { width, length } : null
}

/** Whether a product is a sensible size for the room. Unknown sizes are allowed. */
export function fitsRoom(product, dimensions, floorUsed = 0) {
  const room = getRoomSize(dimensions)
  const footprint = parseFootprintCm(product)
  if (!room || !footprint || !SIZED_CATEGORIES.has(product.category)) return true
  const area = room.width * room.length
  const longest = Math.max(footprint.a, footprint.b ?? 0) / 100
  if (longest > Math.max(room.width, room.length) - 0.3) return false
  if (footprint.b === null) return true
  const used = (footprint.a * footprint.b) / 10000
  if (used > area * (MAX_SHARE_OF_FLOOR[product.category] ?? DEFAULT_MAX_SHARE)) return false
  return !(FLOOR_CATEGORIES.has(product.category) && floorUsed + used > area * MAX_TOTAL_FLOOR_SHARE)
}

/** Adds the room size to a generate request's query string. */
export function appendRoomSize(query, dimensions) {
  const room = getRoomSize(dimensions)
  if (!room) return
  query.set('room_width', String(room.width))
  query.set('room_length', String(room.length))
  if (Number(dimensions?.height) > 0) query.set('room_height', String(Number(dimensions.height)))
}

/**
 * Picks real catalog products to furnish the room with, so the AI image is
 * generated from them up front: best style match per category, in room-type
 * priority order, while the running total stays within the project budget.
 */
export function planProducts({ style, budget, roomType, dimensions, catalog = REAL_PRODUCT_CATALOG }) {
  const categories = ROOM_CATEGORIES[roomType] ?? ROOM_CATEGORIES['living-room']
  const plan = []
  const storeCount = {}
  let total = 0
  let floorUsed = 0
  for (const category of categories) {
    if (plan.length >= MAX_ITEMS) break
    // Style fit first, then spread picks across stores, then catalog match.
    const best = catalog
      .filter((product) => product.category === category && product.image_url && total + product.price <= budget && fitsRoom(product, dimensions, floorUsed))
      .sort((a, b) => (
        Number(b.styles?.includes(style)) - Number(a.styles?.includes(style))
        || (storeCount[a.store] ?? 0) - (storeCount[b.store] ?? 0)
        || b.match - a.match
        || a.price - b.price
      ))[0]
    if (best) {
      plan.push(best)
      storeCount[best.store] = (storeCount[best.store] ?? 0) + 1
      total += best.price
      const footprint = parseFootprintCm(best)
      if (FLOOR_CATEGORIES.has(best.category) && footprint?.b) floorUsed += (footprint.a * footprint.b) / 10000
    }
  }
  return plan
}

/** Body sent to the generate endpoint. */
export function toGenerateProducts(plan) {
  return plan.map((product) => ({ id: product.id, name: product.name, category: product.category, image_url: product.image_url }))
}

/** Compact record kept on the project so Product Match preselects the same items. */
export function toPlannedRecord(plan) {
  return plan.map((product) => ({ productId: product.id, category: product.category, price: product.price }))
}
