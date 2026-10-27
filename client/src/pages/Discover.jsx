// Discover (Round 7 Step 2 design): a Hinge-style profile, photos and prompts interleaved. Like a photo or a prompt with a
// comment, or use the fast path (UX P0-2): drag the whole card (right = like, left = pass; it tilts, a stamp fades in,
// past the threshold it flies off and the next card rises in), the round Pass / Like bar, or ← / → on a keyboard.
// A pass can be undone for 5 s. Reduced motion: no tilt or fly-off; the buttons and keys do the same thing.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { Compass, Heart, MapPin, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { Btn, Empty, IconBtn, LikeBtn, Shell, Shimmer, T, TabBar } from '../components/r7'
import { LikeSheet, Photo, ProfileBody, photosOf, useLikeFlow } from '../components/ProfileParts'
import Preferences from '../components/Preferences'
import DemoMatchCard, { DemoChip } from '../components/DemoMatch'
import PhotoNudge from '../components/PhotoNudge'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

const THRESHOLD = 140 // px dragged before a card counts as a decision
const HINT_KEY = 'twine.swipeHint' // per-browser convenience: the keyboard hint shows once
const seenHint = () => { try { return localStorage.getItem(HINT_KEY) === '1' } catch { return true } }
const hideHint = () => { try { localStorage.setItem(HINT_KEY, '1') } catch { /* storage blocked */ } }

/** The whole profile card: drag left/right to decide. `flyRef.current(liked)` lets the buttons and keys use the same exit. */
function SwipeCard({ children, onDecide, disabled, flyRef, className }) {
  const rm = useReducedMotion()
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-320, 320], rm ? [0, 0] : [-8, 8])
  const likeO = useTransform(x, [40, THRESHOLD], [0, 1]), nopeO = useTransform(x, [-THRESHOLD, -40], [1, 0])
  const fly = useCallback(async (liked) => {
    if (!rm) await animate(x, liked ? window.innerWidth : -window.innerWidth, { duration: 0.28, ease: 'easeIn' })
    onDecide(liked)
  }, [rm, x, onDecide])
  useEffect(() => { flyRef.current = fly }, [fly, flyRef])
  return (
    <motion.div className={`swipe ${className ?? ''}`} drag={disabled ? false : 'x'} dragDirectionLock dragElastic={0.6} dragMomentum={false}
      style={{ x, rotate, touchAction: 'pan-y' }} initial={rm ? false : { opacity: 0, scale: 0.96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={T.base}
      onDragEnd={(_, info) => {
        if (info.offset.x > THRESHOLD || info.velocity.x > 900) fly(true)
        else if (info.offset.x < -THRESHOLD || info.velocity.x < -900) fly(false)
        else animate(x, 0, { type: 'spring', stiffness: 420, damping: 34 })
      }}>
      <motion.span className="drag-tag like" style={{ opacity: likeO }} aria-hidden="true">Like</motion.span>
      <motion.span className="drag-tag pass" style={{ opacity: nopeO }} aria-hidden="true">Nope</motion.span>
      {children}
    </motion.div>
  )
}

/** Mobile hero: the first photo full-bleed (tap to see the next one); the card around it is what's dragged. */
function Hero({ p, photos, idx, onNext, onLikePhoto, busy }) {
  return (
    <figure className="hero-ph" onClick={onNext}>
      <img src={photos[idx]} alt={`${p.name}, photo ${idx + 1} of ${photos.length}. Swipe right to like, left to pass.`} draggable={false} />
      <div className="ph-bars" aria-hidden="true">{photos.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}</div>
      <LikeBtn what={`photo ${idx + 1}`} light onLike={() => onLikePhoto({ kind: 'photo', ref: String(idx) })} disabled={busy} />
      <figcaption className="ph-cap"><h1>{p.name}{p.age ? `, ${p.age}` : ''}</h1><p><DemoChip p={p} />{p.city && <span>{p.city}</span>}</p></figcaption>
    </figure>
  )
}

/** The round Pass / Like bar (both layouts). Like opens the comment sheet; the comment is optional. */
const ActionBar = ({ name, onPass, onLike, busy, extra }) => (
  <div className="act-bar" role="group" aria-label={`Decide on ${name}`}>
    <button type="button" className="act-btn act-pass" onClick={onPass} disabled={busy} aria-label={`Pass on ${name}`}><X size={28} strokeWidth={2} aria-hidden="true" /></button>
    <button type="button" className="act-btn act-like" onClick={onLike} disabled={busy} aria-label={`Like ${name}`}><Heart size={28} strokeWidth={2} aria-hidden="true" /></button>
    {extra}
  </div>
)

export default function Discover() {
  const mobile = useMobile()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [deck, setDeck] = useState(null)
  const [error, setError] = useState(null)
  const [liking, setLiking] = useState(null) // { kind, ref } being liked with a comment
  const [prefs, setPrefs] = useState(false)
  const [photo, setPhoto] = useState({ of: null, i: 0 }) // photo shown on the main image, per profile
  const [hint, setHint] = useState(() => !seenHint())
  const flyRef = useRef(null)
  const { send, busy, ui: matchUI } = useLikeFlow()
  const load = useCallback(() => {
    setError(null)
    api.get('/api/discover', { params: { limit: 20 } }).then((r) => setDeck(r.data.profiles)).catch((e) => setError(e))
  }, [])
  useEffect(load, [load])

  const p = deck?.[0]
  const photos = p ? photosOf(p) : []
  const idx = photo.of === p?.userId ? photo.i : 0
  const showPhoto = useCallback((i) => setPhoto({ of: p?.userId, i }), [p?.userId])
  const nextPhoto = useCallback(() => showPhoto((idx + 1) % Math.max(1, photos.length)), [showPhoto, idx, photos.length])

  const decide = useCallback(async (liked, target, comment) => {
    const cur = deck?.[0]
    if (!cur) return
    if (await send(cur, { liked, target: liked ? target ?? { kind: 'profile' } : undefined, comment })) {
      setLiking(null)
      setDeck((d) => d.slice(1))
      if (hint) { setHint(false); hideHint() }
      if (!liked) { // one level of undo, for 5 s (the toast's lifetime)
        toast(`You passed on ${cur.name}.`, {
          action: 'Undo',
          onAction: async () => {
            try { await api.delete(`/api/likes/${cur.userId}`); setDeck((d) => [cur, ...(d ?? []).filter((x) => x.userId !== cur.userId)]) } catch (err) { toast(errMsg(err), { tone: 'bad' }) }
          },
        })
      }
    }
  }, [deck, send, hint, toast])

  // Keyboard (desktop): ← pass, → like, ↑ / Space next photo. Never while typing or while a sheet is open.
  useEffect(() => {
    const onKey = (e) => {
      if (!p || busy || liking || prefs || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]') || document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); flyRef.current?.(false) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); flyRef.current?.(true) }
      else if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); nextPhoto() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p, busy, liking, prefs, nextPhoto])

  const matchSheet = <>{matchUI}{p && <LikeSheet like={liking} p={p} photos={photos} busy={busy} onClose={() => setLiking(null)} onSend={(c) => decide(true, liking, c)} />}<Preferences open={prefs} onClose={() => setPrefs(false)} onSaved={() => { setPrefs(false); setDeck(null); load() }} /></>
  const prefsBtn = <IconBtn icon={SlidersHorizontal} label="Preferences" onClick={() => setPrefs(true)} />
  const likeProfile = () => setLiking({ kind: 'profile' })

  // Plan 30 S2: a held profile can't browse.
  if (error?.response?.data?.error?.code === 'PROFILE_HELD') return (
    <Shell title={mobile ? 'Discover' : null}>
      <Empty icon={ShieldAlert} title="Your profile needs a fix" action={<Btn onClick={() => navigate('/profile')}>Fix my profile</Btn>}>
        Our automatic check found something that looks unsafe, so your profile is hidden for now.
        {profile?.selfCheck?.reasons?.length > 0 && <ul className="held-why">{profile.selfCheck.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        Change it and we check again right away.
      </Empty>
    </Shell>
  )

  if (error || !deck || !p) {
    return (
      <Shell title={mobile ? 'Discover' : null}>
        <div className="pad demo-wrap"><PhotoNudge /><DemoMatchCard /></div>
        {error ? <Empty icon={Compass} title="We couldn’t load Discover" action={<Btn kind="secondary" onClick={load}>Try again</Btn>}>{errMsg(error)}</Empty>
          : !deck ? <div className="page narrow" aria-busy="true"><Shimmer w="40%" /><Shimmer /><Shimmer w="80%" /></div>
            : <Empty icon={Compass} title="You’ve seen everyone nearby" action={<Btn kind="secondary" icon={SlidersHorizontal} onClick={() => setPrefs(true)}>Change preferences</Btn>}>New people join every day. Come back tomorrow, or check what your agent knows about you in the meantime.</Empty>}
        {matchSheet}
      </Shell>
    )
  }

  if (mobile) return (
    <div className="scr app-scr m discover">
      <div className="d-scroll">
        {/* UI polish M2: the photo reminder is a slim pill over the photo's top edge, so it doesn't push the photo down */}
        <div className="nudge-over"><PhotoNudge /></div>
        <div className="demo-wrap m"><DemoMatchCard /></div>
        <SwipeCard key={p.userId} onDecide={(liked) => decide(liked)} disabled={busy} flyRef={flyRef}>
          <Hero p={p} photos={photos} idx={idx} onNext={nextPhoto} onLikePhoto={setLiking} busy={busy} />
          <div className="d-stack"><ProfileBody p={p} photos={photos} mobile onLike={setLiking} busy={busy} /></div>
        </SwipeCard>
      </div>
      <div className="d-actions">
        <ActionBar name={p.name} onPass={() => flyRef.current?.(false)} onLike={likeProfile} busy={busy} extra={prefsBtn} />
      </div>
      <TabBar /> {/* full-bleed screen: it places the tab bar itself, as in the design */}
      {matchSheet}
    </div>
  )
  return (
    <Shell className="discover">
      <div className="demo-wrap"><PhotoNudge /><DemoMatchCard /></div>
      <div className="d-sub">{prefsBtn}<span className="small">{deck.length} {deck.length === 1 ? 'person' : 'people'} near {p.city ?? 'you'} who fit what you’re looking for</span>
        {hint && <button type="button" className="kbd-hint" onClick={() => { setHint(false); hideHint() }} aria-label="Keyboard: left arrow to pass, right arrow to like. Dismiss">← pass · → like</button>}
      </div>
      <SwipeCard key={p.userId} className="d-grid" onDecide={(liked) => decide(liked)} disabled={busy} flyRef={flyRef}>
        <div className="d-left">
          <Photo src={photos[idx]} i={idx} n={photos.length} name={p.name} onLike={setLiking} busy={busy} />
          <div className="d-under">
            <div className="d-thumbs" aria-label="More photos">{photos.map((s, i) => <button type="button" key={s} className="thumb-btn" onClick={() => showPhoto(i)} aria-label={`Show photo ${i + 1}`} aria-pressed={i === idx}><img src={s} alt="" className={i === idx ? 'on' : ''} draggable={false} /></button>)}</div>
          </div>
        </div>
        <div className="d-right">
          <header className="d-head"><div><h1 className="h1">{p.name}{p.age ? `, ${p.age}` : ''}</h1>{p.city && <p className="d-meta"><MapPin size={16} strokeWidth={1.7} aria-hidden="true" />{p.city}</p>}<DemoChip p={p} /></div></header>
          <ProfileBody p={p} photos={photos} onLike={setLiking} busy={busy} />
        </div>
      </SwipeCard>
      <ActionBar name={p.name} onPass={() => flyRef.current?.(false)} onLike={likeProfile} busy={busy} />
      {matchSheet}
    </Shell>
  )
}
