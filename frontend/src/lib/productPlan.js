import { REAL_PRODUCT_CATALOG } from '../data/realProductCatalog'

// Categories worth furnishing per room type, in priority order.
const ROOM_CATEGORIES = {
  'living-room': ['sofa', 'coffee-table', 'rug', 'chair', 'television', 'lamp', 'curtain', 'plant'],
  bedroom: ['bed', 'nightstand', 'rug', 'curtain', 'lamp', 'mirror', 'plant'],
  studio: ['bed', 'sofa', 'coffee-table', 'desk', 'rug', 'lamp', 'curtain'],
  workspace: ['desk', 'chair', 'shelf', 'cabinet', 'lamp', 'rug', 'plant'],
}
const MAX_ITEMS = 7

/**
 * Picks real catalog products to furnish the room with, so the AI image is
 * generated from them up front: best style match per category, in room-type
 * priority order, while the running total stays within the project budget.
 */
export function planProducts({ style, budget, roomType, catalog = REAL_PRODUCT_CATALOG }) {
  const categories = ROOM_CATEGORIES[roomType] ?? ROOM_CATEGORIES['living-room']
  const plan = []
  const storeCount = {}
  let total = 0
  for (const category of categories) {
    if (plan.length >= MAX_ITEMS) break
    // Style fit first, then spread picks across stores, then catalog match.
    const best = catalog
      .filter((product) => product.category === category && product.image_url && total + product.price <= budget)
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
