/** Frame style that shows an image at its own aspect ratio (nothing cropped), capped to a share of the viewport height. */
export function fitFrameStyle(ratio, maxViewportHeight = 78) {
  if (!ratio) return {}
  return {
    aspectRatio: String(ratio),
    height: 'auto',
    minHeight: 0,
    width: `min(100%, ${(maxViewportHeight * ratio).toFixed(1)}vh)`,
    marginInline: 'auto',
  }
}

export function naturalRatio(event) {
  const { naturalWidth, naturalHeight } = event.currentTarget
  return naturalWidth && naturalHeight ? naturalWidth / naturalHeight : null
}
