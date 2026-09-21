/** Downscale a photo to a JPEG no larger than maxEdge on its long side and return the base64 body. Browser only. */
export async function photoToBase64Jpeg(photo: Blob, maxEdge = 1024): Promise<string> {
  const bitmap = await createImageBitmap(photo)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the photo.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
