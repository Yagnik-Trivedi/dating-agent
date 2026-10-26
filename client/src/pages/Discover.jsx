// Discover (Round 7 Step 2 design): a Hinge-style profile, photos and prompts interleaved. Like a photo or a prompt, or
// Pass. Mobile: full-bleed first photo you can drag (right = like, left = pass; it tilts and snaps back if not far enough).
// Liking a photo or prompt opens a comment sheet (plan 30 S3.4); a match asks how to start (S3.6).
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { Compass, MapPin, ShieldAlert, SlidersHorizontal, X } from 'lucide-react'
import { Btn, Empty, IconBtn, LikeBtn, Shell, Shimmer, T, TabBar } from '../components/r7'
import { LikeSheet, Photo, ProfileBody, photosOf, useLikeFlow } from '../components/ProfileParts'
import Preferences from '../components/Preferences'
import DemoMatchCard, { DemoChip } from '../components/DemoMatch'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

/** Mobile hero: drag right to like, left to pass. Reduced motion: no tilt; the buttons do the same thing. */
function DragHero({ p, photos, onDecide, onLikePhoto, busy }) {
  const rm = useReducedMotion()
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], rm ? [0, 0] : [-6, 6])
  const likeO = useTransform(x, [30, 120], [0, 1]), passO = useTransform(x, [-120, -30], [1, 0])
  return (
    <motion.figure className="hero-ph" drag={busy ? false : 'x'} dragSnapToOrigin dragElastic={0.5} dragTransition={{ bounceStiffness: 420, bounceDamping: 34 }} style={{ x, rotate }} whileDrag={{ scale: 0.985 }}
      onDragEnd={(_, info) => { if (info.offset.x > 140) onDecide(true); else if (info.offset.x < -140) onDecide(false) }}>
      <img src={photos[0]} alt={`${p.name}, photo 1 of ${photos.length}. Drag right to like, left to pass.`} draggable={false} />
      <div className="ph-bars" aria-hidden="true">{photos.map((_, i) => <i key={i} className={i === 0 ? 'on' : ''} />)}</div>
      <LikeBtn what="photo 1" light onLike={() => onLikePhoto({ kind: 'photo', ref: '0' })} disabled={busy} />
      <motion.span className="drag-tag like" style={{ opacity: likeO }}>Like</motion.span>
      <motion.span className="drag-tag pass" style={{ opacity: passO }}>Pass</motion.span>
      <figcaption className="ph-cap"><h1>{p.name}{p.age ? `, ${p.age}` : ''}</h1><p><DemoChip p={p} />{p.city && <span>{p.city}</span>}</p></figcaption>
    </motion.figure>
  )
}

export default function Discover() {
  const mobile = useMobile()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [deck, setDeck] = useState(null)
  const [error, setError] = useState(null)
  const [liking, setLiking] = useState(null) // { kind, ref } being liked with a comment
  const [prefs, setPrefs] = useState(false)
  const { send, busy, ui: matchUI } = useLikeFlow()
  const load = useCallback(() => {
    setError(null)
    api.get('/api/discover', { params: { limit: 20 } }).then((r) => setDeck(r.data.profiles)).catch((e) => setError(e))
  }, [])
  useEffect(load, [load])

  async function decide(liked, target, comment) {
    if (await send(deck[0], { liked, target, comment })) { setLiking(null); setDeck((d) => d.slice(1)) }
  }

  const p = deck?.[0]
  const photos = p ? photosOf(p) : []
  const matchSheet = <>{matchUI}{p && <LikeSheet like={liking} p={p} photos={photos} busy={busy} onClose={() => setLiking(null)} onSend={(c) => decide(true, liking, c)} />}<Preferences open={prefs} onClose={() => setPrefs(false)} onSaved={() => { setPrefs(false); setDeck(null); load() }} /></>
  const prefsBtn = <IconBtn icon={SlidersHorizontal} label="Preferences" onClick={() => setPrefs(true)} />

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
        <div className="pad demo-wrap"><DemoMatchCard /></div>
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
        <div className="demo-wrap m"><DemoMatchCard /></div>
        <DragHero key={p.userId} p={p} photos={photos} onDecide={(liked) => decide(liked, { kind: 'profile' })} onLikePhoto={setLiking} busy={busy} />
        <div className="d-stack"><ProfileBody p={p} photos={photos} mobile onLike={setLiking} busy={busy} /></div>
      </div>
      <div className="d-actions" role="group" aria-label={`Decide on ${p.name}`}>
        <Btn kind="secondary" size="lg" icon={X} onClick={() => decide(false)} disabled={busy}>Pass</Btn>
        <p className="small">Like a photo or prompt to say hello</p>
        {prefsBtn}
      </div>
      <TabBar /> {/* full-bleed screen: it places the tab bar itself, as in the design */}
      {matchSheet}
    </div>
  )
  return (
    <Shell className="discover">
      <div className="demo-wrap"><DemoMatchCard /></div>
      <div className="d-sub">{prefsBtn}<span className="small">{deck.length} {deck.length === 1 ? 'person' : 'people'} near {p.city ?? 'you'} who fit what you’re looking for</span></div>
      <motion.div className="d-grid" key={p.userId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={T.slow}>
        <div className="d-left">
          <Photo src={photos[0]} i={0} n={photos.length} name={p.name} h={600} onLike={setLiking} busy={busy} />
          <div className="d-under">
            <div className="d-thumbs" aria-label="More photos">{photos.map((s, i) => <img key={s} src={s} alt="" className={i === 0 ? 'on' : ''} />)}</div>
            <Btn kind="secondary" icon={X} onClick={() => decide(false)} disabled={busy}>Pass</Btn>
          </div>
        </div>
        <div className="d-right">
          <header className="d-head"><div><h1 className="h1">{p.name}{p.age ? `, ${p.age}` : ''}</h1>{p.city && <p className="d-meta"><MapPin size={16} strokeWidth={1.7} aria-hidden="true" />{p.city}</p>}<DemoChip p={p} /></div></header>
          <ProfileBody p={p} photos={photos} onLike={setLiking} busy={busy} />
        </div>
      </motion.div>
      {matchSheet}
    </Shell>
  )
}
