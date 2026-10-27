// Plan 30 S3.1: 2–6 photos. Pick a file → crop to 4:5 → upload; drag to reorder (or "Make main" from the keyboard);
// remove. New photos show "Being checked" until moderation finishes; a rejected one shows why.
import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import { Reorder } from 'motion/react'
import { CircleAlert, Crop, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react'
import { Btn, IconBtn, Sheet } from './r7'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { cropToJpeg, uploadPhoto } from '../lib/photos'

export const MAX_PHOTOS = 6

/** → { photos, setPhotos, reload }. Polls while any photo is still being checked. */
export function usePhotos() {
  const [photos, setPhotos] = useState(null)
  const reload = useCallback(() => api.get('/api/photos').then((r) => setPhotos(r.data.photos)).catch(() => {}), [])
  useEffect(() => { reload() }, [reload])
  const pending = photos?.some((p) => p.status === 'pending')
  useEffect(() => {
    if (!pending) return
    const t = setInterval(reload, 3000)
    return () => clearInterval(t)
  }, [pending, reload])
  return { photos, setPhotos, reload }
}

export default function PhotoGrid({ photos, setPhotos, onError }) {
  const input = useRef(null)
  const [src, setSrc] = useState(null) // the file being cropped
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState(null)
  const [upload, setUpload] = useState(null) // progress 0..1 while uploading
  const [replacing, setReplacing] = useState(null) // UI polish A8: a rejected photo being replaced
  const list = photos ?? []
  const toast = useToast()
  // A8: say what the check decided as soon as it finishes (it used to change silently).
  const seen = useRef(null)
  useEffect(() => {
    const before = seen.current
    seen.current = Object.fromEntries(list.map((p) => [p._id, p.status]))
    if (!before) return
    for (const [i, p] of list.entries()) {
      if (before[p._id] !== 'pending' || p.status === 'pending') continue
      if (p.status === 'rejected') toast(`Photo ${i + 1} wasn’t approved: ${p.reasons?.[0] ?? 'it doesn’t meet the photo rules'}`, { tone: 'bad' })
      else if (p.status === 'ok') toast(`Photo ${i + 1} is approved and visible to others`)
    }
  }, [list, toast])
  const rejected = list.map((p, i) => ({ p, i })).filter(({ p }) => p.status === 'rejected')

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return onError?.('Choose a JPG, PNG or WebP photo.')
    setCrop({ x: 0, y: 0 }); setZoom(1); setSrc(URL.createObjectURL(file))
  }
  const close = () => { if (src) URL.revokeObjectURL(src); setSrc(null) }
  const cancel = () => { close(); setReplacing(null) }
  async function use() {
    try {
      const blob = await cropToJpeg(src, area)
      close()
      setUpload(0)
      const photo = await uploadPhoto(blob, setUpload)
      if (replacing) {
        // A8 Replace: the new photo takes the rejected one's place.
        const next = list.map((x) => (x._id === replacing._id ? photo : x))
        setReplacing(null)
        await api.delete(`/api/photos/${replacing._id}`).catch(() => {})
        await save(next)
      } else setPhotos([...list, photo])
    } catch (err) { onError?.(errMsg(err)) } finally { setUpload(null) }
  }
  const save = async (next) => {
    const before = list
    setPhotos(next)
    try { setPhotos((await api.put('/api/photos/order', { ids: next.map((p) => p._id) })).data.photos) } catch (err) { setPhotos(before); onError?.(errMsg(err)) }
  }
  const remove = async (p) => {
    try { setPhotos((await api.delete(`/api/photos/${p._id}`)).data.photos) } catch (err) { onError?.(errMsg(err)) }
  }
  const empty = Math.max(0, MAX_PHOTOS - list.length - (upload !== null ? 1 : 0))

  return (
    <div className="photo-step">
      <Reorder.Group as="div" axis="x" values={list} onReorder={setPhotos} className="slots">
        {list.map((p, i) => (
          <Reorder.Item as="div" key={p._id} value={p} className={`slot filled s-${p.status}`} onDragEnd={() => save(list)}>
            <img src={p.url} alt={`Your photo ${i + 1}${i === 0 ? ' (main)' : ''}`} draggable={false} />
            {i === 0 && <span className="slot-main">Main</span>}
            {p.status === 'pending' && <span className="slot-badge" role="status" title="Usually under a minute"><Loader2 className="spin" size={13} strokeWidth={2} aria-hidden="true" />Checking…</span>}
            {p.status === 'rejected' && (
              <span className="slot-rej" role="group" aria-label={`Photo ${i + 1} not approved`}>
                <span className="slot-rej-why" title={p.reasons?.join(' ')}><CircleAlert size={14} strokeWidth={2} aria-hidden="true" />Not approved</span>
                <span className="sr-only">{p.reasons?.join(' ')}</span>
                <button type="button" className="slot-replace" onClick={() => { setReplacing(p); input.current?.click() }}><RefreshCw size={13} strokeWidth={2} aria-hidden="true" />Replace</button>
              </span>
            )}
            <span className="slot-acts">
              {i > 0 && <IconBtn icon={Star} label={`Make photo ${i + 1} your main photo`} className="sm" onClick={() => save([p, ...list.filter((x) => x !== p)])} />}
              <IconBtn icon={Trash2} label={`Remove photo ${i + 1}`} className="sm" onClick={() => remove(p)} />
            </span>
          </Reorder.Item>
        ))}
        {upload !== null && <div className="slot filled s-uploading"><span className="slot-prog" role="progressbar" aria-label="Uploading" aria-valuenow={Math.round(upload * 100)}><i style={{ width: `${Math.round(upload * 100)}%` }} /></span></div>}
        {Array.from({ length: empty }, (_, k) => (
          <button key={`e${k}`} type="button" className="slot empty" aria-label={`Add photo ${list.length + k + 1}`} onClick={() => input.current?.click()} disabled={upload !== null}>
            <ImagePlus size={22} strokeWidth={1.6} aria-hidden="true" /><span>{list.length + k < 2 ? 'Required' : 'Add'}</span>
          </button>
        ))}
      </Reorder.Group>
      {rejected.length > 0 && (
        <div className="photo-rej-note" role="alert">
          <CircleAlert size={18} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <b>{rejected.length === 1 ? 'One photo wasn’t approved' : `${rejected.length} photos weren’t approved`}, so others don’t see {rejected.length === 1 ? 'it' : 'them'}.</b>
            <ul>{rejected.map(({ p, i }) => <li key={p._id}>Photo {i + 1}: {p.reasons?.join(' ') || 'it doesn’t meet the photo rules.'}</li>)}</ul>
            <span className="small">Replace {rejected.length === 1 ? 'it' : 'them'} with a clear photo of you: your face visible, no text-heavy images or screenshots.</span>
          </div>
        </div>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      <Sheet open={Boolean(src)} title="Crop to 4:5" onClose={cancel} footer={<><Btn kind="secondary" onClick={() => input.current?.click()}>Replace</Btn><Btn icon={Crop} onClick={use} disabled={!area}>Use photo</Btn></>}>
        <div className="crop-stage">{src && <Cropper image={src} crop={crop} zoom={zoom} aspect={4 / 5} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />}</div>
        <label className="crop-zoom small">Zoom <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      </Sheet>
    </div>
  )
}
