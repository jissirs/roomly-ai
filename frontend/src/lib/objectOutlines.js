/** The silhouette(s) of a detected object as 0-100 % polygons; falls back to its box. */
export function getObjectOutlines(item) {
  if (Array.isArray(item.outlines) && item.outlines.length) {
    const valid = item.outlines.filter((outline) => Array.isArray(outline) && outline.length >= 3)
    if (valid.length) return valid
  }
  if (Array.isArray(item.outline) && item.outline.length >= 3) return [item.outline]
  const xMin = item.box_x_min ?? Math.max(0, item.x - 12)
  const xMax = item.box_x_max ?? Math.min(100, item.x + 12)
  const yMin = item.box_y_min ?? Math.max(0, item.y - 15)
  const yMax = item.box_y_max ?? Math.min(100, item.y + 15)
  return [[[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]]]
}
