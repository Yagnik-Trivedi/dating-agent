// Plan 30 S3.1 photos: crop to 4:5 in the browser, resize to 1080 px wide, JPEG ≤ 300 KB, then upload straight to
// Cloudinary with a server-signed ticket (or, without Cloudinary keys, send the JPEG to the server's local stub).
import { api } from './api'

const W = 1080, H = 1350, MAX_BYTES = 300_000

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('That file isn’t an image we can read. Try a JPG or PNG.'))
  img.src = src
})
const toBlob = (canvas, q) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))

/** area: react-easy-crop's croppedAreaPixels. → JPEG Blob, 1080×1350 at most, ≤ 300 KB */
export async function cropToJpeg(src, area) {
  const img = await loadImage(src)
  const scale = Math.min(1, W / area.width)
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(area.width * scale), height: Math.round(area.height * scale) })
  canvas.getContext('2d').drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  for (let q = 0.86; q >= 0.4; q -= 0.08) {
    const blob = await toBlob(canvas, q)
    if (blob.size <= MAX_BYTES) return Object.assign(blob, { w: canvas.width, h: canvas.height })
  }
  throw new Error('That photo is too detailed to shrink. Try another one.')
}

const base64 = (blob) => new Promise((resolve) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1])
  r.readAsDataURL(blob)
})

/** Upload a cropped JPEG; onProgress(0..1). → the saved photo (status 'pending' until moderation). */
export async function uploadPhoto(blob, onProgress) {
  const { data: t } = await api.post('/api/photos/ticket')
  if (t.stub) {
    const { data } = await api.post('/api/photos', { jpegBase64: await base64(blob), w: blob.w, h: blob.h }, { onUploadProgress: (e) => onProgress?.(e.progress ?? 0) })
    return data.photo
  }
  const form = new FormData()
  Object.entries({ file: blob, api_key: t.apiKey, timestamp: t.timestamp, signature: t.signature, folder: t.folder }).forEach(([k, v]) => form.append(k, v))
  const res = await fetch(`https://api.cloudinary.com/v1_1/${t.cloudName}/image/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('The upload didn’t go through. Try again.')
  onProgress?.(1)
  const up = await res.json()
  const { data } = await api.post('/api/photos', { url: up.secure_url, publicId: up.public_id, w: up.width, h: up.height })
  return data.photo
}
