// Discover (Round 7 Step 2 design): a Hinge-style profile, photos and prompts interleaved. Like a photo or a prompt, or
// Pass. Mobile: full-bleed first photo you can drag (right = like, left = pass; it tilts and snaps back if not far enough).
// Liking a specific photo/prompt with a comment, preferences and report/block arrive with plan 30 S3.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { Baby, Cigarette, Compass, Heart, MapPin, Target, Wine, X } from 'lucide-react'
import { Btn, Empty, LikeBtn, LiveBadge, Sheet, Shell, Shimmer, T, TabBar, photoOf } from '../components/r7'
import { useMobile } from '../components/prelude'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

const SCENES = ['portrait', 'trek', 'sketch', 'cafe', 'city']
const DRINK = { never: 'Doesn’t drink', socially: 'Drinks socially', regularly: 'Drinks regularly' }
const SMOKE = { never: 'Doesn’t smoke', socially: 'Smokes socially', regularly: 'Smokes', trying_to_quit: 'Trying to quit smoking' }
const KIDS = { yes: 'Wants kids', no: 'Doesn’t want kids', open: 'Open to kids', unsure: 'Not sure about kids' }
const label = (t) => String(t ?? '').replace(/_/g, ' ')

/** Photos to show: their own, plus illustrated scenes for demo people with fewer than 3. */
const photosOf = (p) => {
  const own = (p.photos ?? []).map((_, i) => photoOf(p, i)).filter(Boolean)
  const scenes = SCENES.filter((s) => !(own.length && s === 'portrait')).map((s) => photoOf({ ...p, photos: [] }, 0, s))
  return [...own, ...scenes].slice(0, Math.max(3, own.length))
}

const Photo = ({ src, i, n, name, h, onLike, busy }) => (
  <figure className="ph" style={h ? { height: h } : undefined}>
    <img src={src} alt={`${name}, photo ${i + 1} of ${n}`} />
    <LikeBtn what={`photo ${i + 1}`} light onLike={onLike} disabled={busy} />
  </figure>
)
const Prompt = ({ p, onLike, busy }) => <article className="prompt card"><p className="pq">{p.q}</p><p className="pa">{p.a}</p><LikeBtn what={`their answer to “${p.q}”`} onLike={onLike} disabled={busy} /></article>
function Basics({ p }) {
  const l = p.tags?.lifestyle ?? {}
  const rows = [[MapPin, p.city], [Target, p.tags?.relationshipGoal && `Looking for ${label(p.tags.relationshipGoal)}`], [Wine, DRINK[l.drinking]], [Cigarette, SMOKE[l.smoking]], [Baby, KIDS[p.tags?.wantsKids]]].filter(([, t]) => t)
  return (
    <section className="basics card" aria-label="Basics">
      {rows.length > 0 && <ul className="bas-row">{rows.map(([I, t]) => <li key={t}><I size={17} strokeWidth={1.7} aria-hidden="true" />{t}</li>)}</ul>}
      {p.bio && <p className="small">{p.bio}</p>}
      {p.tags?.interests?.length > 0 && <div className="interests">{p.tags.interests.map((x) => <span key={x} className="tag">{x}</span>)}</div>}
    </section>
  )
}

/** Prompts and photos interleaved, the way the design reads: prompt, basics, prompt, photo, prompt, photo… */
function ProfileBody({ p, photos, mobile, onLike, busy }) {
  const prompts = p.prompts ?? []
  const items = [prompts[0] && <Prompt key="q0" p={prompts[0]} onLike={onLike} busy={busy} />, <Basics key="b" p={p} />]
  for (let i = 1; i < Math.max(prompts.length, photos.length); i++) {
    if (prompts[i]) items.push(<Prompt key={`q${i}`} p={prompts[i]} onLike={onLike} busy={busy} />)
    if (photos[i]) items.push(<Photo key={`p${i}`} src={photos[i]} i={i} n={photos.length} name={p.name} h={mobile ? 420 : 520} onLike={onLike} busy={busy} />)
  }
  return items.filter(Boolean)
}

/** Mobile hero: drag right to like, left to pass. Reduced motion: no tilt; the buttons do the same thing. */
function DragHero({ p, photos, onDecide, busy }) {
  const rm = useReducedMotion()
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], rm ? [0, 0] : [-6, 6])
  const likeO = useTransform(x, [30, 120], [0, 1]), passO = useTransform(x, [-120, -30], [1, 0])
  return (
    <motion.figure className="hero-ph" drag={busy ? false : 'x'} dragSnapToOrigin dragElastic={0.5} dragTransition={{ bounceStiffness: 420, bounceDamping: 34 }} style={{ x, rotate }} whileDrag={{ scale: 0.985 }}
      onDragEnd={(_, info) => { if (info.offset.x > 140) onDecide(true); else if (info.offset.x < -140) onDecide(false) }}>
      <img src={photos[0]} alt={`${p.name}, photo 1 of ${photos.length}. Drag right to like, left to pass.`} draggable={false} />
      <div className="ph-bars" aria-hidden="true">{photos.map((_, i) => <i key={i} className={i === 0 ? 'on' : ''} />)}</div>
      <LikeBtn what="photo 1" light onLike={() => onDecide(true)} disabled={busy} />
      <motion.span className="drag-tag like" style={{ opacity: likeO }}>Like</motion.span>
      <motion.span className="drag-tag pass" style={{ opacity: passO }}>Pass</motion.span>
      <figcaption className="ph-cap"><h1>{p.name}{p.age ? `, ${p.age}` : ''}</h1><p>{p.liveChecked && <LiveBadge onPhoto />}{p.city && <span>{p.city}</span>}</p></figcaption>
    </motion.figure>
  )
}

export default function Discover() {
  const mobile = useMobile()
  const toast = useToast()
  const navigate = useNavigate()
  const [deck, setDeck] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [matched, setMatched] = useState(null)
  const load = useCallback(() => {
    setError(null)
    api.get('/api/discover', { params: { limit: 20 } }).then((r) => setDeck(r.data.profiles)).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])

  async function decide(liked) {
    const p = deck[0]
    setBusy(true)
    try {
      const { data } = await api.post('/api/likes', { toUserId: p.userId, liked })
      if (data.matched) setMatched({ profile: p, matchId: data.matchId })
      else if (liked) toast(`You liked ${p.name}. If they like you back, your agents say hello.`)
      setDeck((d) => d.slice(1))
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setBusy(false)
    }
  }

  const p = deck?.[0]
  const photos = p ? photosOf(p) : []
  const matchSheet = (
    <Sheet open={Boolean(matched)} title="It’s a match" onClose={() => setMatched(null)}
      footer={<><Btn kind="ghost" onClick={() => setMatched(null)}>Keep browsing</Btn><Btn icon={Heart} onClick={() => navigate(`/matches/${matched.matchId}`)}>Watch your agents</Btn></>}>
      <p className="lead sm">You and {matched?.profile.name} liked each other. Your agents check each other’s profile, then say hello for you. You can read every line and take over any time.</p>
    </Sheet>
  )

  if (error || !deck || !p) {
    return (
      <Shell title={mobile ? 'Discover' : null}>
        {error ? <Empty icon={Compass} title="We couldn’t load Discover" action={<Btn kind="secondary" onClick={load}>Try again</Btn>}>{error}</Empty>
          : !deck ? <div className="page narrow" aria-busy="true"><Shimmer w="40%" /><Shimmer /><Shimmer w="80%" /></div>
            : <Empty icon={Compass} title="You’ve seen everyone nearby">New people join every day. Come back tomorrow, or check what your agent knows about you in the meantime.</Empty>}
        {matchSheet}
      </Shell>
    )
  }

  if (mobile) return (
    <div className="scr app-scr m discover">
      <div className="d-scroll">
        <DragHero key={p.userId} p={p} photos={photos} onDecide={decide} busy={busy} />
        <div className="d-stack"><ProfileBody p={p} photos={photos} mobile onLike={() => decide(true)} busy={busy} /></div>
      </div>
      <div className="d-actions" role="group" aria-label={`Decide on ${p.name}`}>
        <Btn kind="secondary" size="lg" icon={X} onClick={() => decide(false)} disabled={busy}>Pass</Btn>
        <p className="small">Like a photo or prompt to say hello</p>
      </div>
      <TabBar /> {/* full-bleed screen: it places the tab bar itself, as in the design */}
      {matchSheet}
    </div>
  )
  return (
    <Shell className="discover">
      <div className="d-sub"><span className="small">{deck.length} {deck.length === 1 ? 'person' : 'people'} near {p.city ?? 'you'} who fit what you’re looking for</span></div>
      <motion.div className="d-grid" key={p.userId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={T.slow}>
        <div className="d-left">
          <Photo src={photos[0]} i={0} n={photos.length} name={p.name} h={600} onLike={() => decide(true)} busy={busy} />
          <div className="d-under">
            <div className="d-thumbs" aria-label="More photos">{photos.map((s, i) => <img key={s} src={s} alt="" className={i === 0 ? 'on' : ''} />)}</div>
            <Btn kind="secondary" icon={X} onClick={() => decide(false)} disabled={busy}>Pass</Btn>
          </div>
        </div>
        <div className="d-right">
          <header className="d-head"><div><h1 className="h1">{p.name}{p.age ? `, ${p.age}` : ''}</h1>{p.city && <p className="d-meta"><MapPin size={16} strokeWidth={1.7} aria-hidden="true" />{p.city}</p>}</div></header>
          {p.liveChecked && <LiveBadge tip />}
          <ProfileBody p={p} photos={photos} onLike={() => decide(true)} busy={busy} />
        </div>
      </motion.div>
      {matchSheet}
    </Shell>
  )
}
