import { api } from './api'

const MAX_ITEMS = 12

/**
 * Current price and stock of catalog products, read from the store's own page
 * by the backend. Returns {productId: {price, in_stock, checked_at} | {error}};
 * an {error} entry per product when the lookup is unavailable (callers fall
 * back to the catalog price and can retry).
 */
export async function fetchLivePrices(products) {
  const items = products.filter((product) => product.url).map((product) => ({ id: product.id, url: product.url }))
  const batches = []
  for (let start = 0; start < items.length; start += MAX_ITEMS) batches.push(items.slice(start, start + MAX_ITEMS))
  const replies = await Promise.all(batches.map((batch) => api.post('/products/prices', { items: batch }).then((result) => result.prices ?? {}).catch(() => Object.fromEntries(batch.map((item) => [item.id, { error: 'ติดต่อระบบตรวจราคาไม่ได้' }])))))
  return Object.assign({}, ...replies)
}

export function formatCheckedTime(isoString) {
  const date = new Date(isoString)
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
