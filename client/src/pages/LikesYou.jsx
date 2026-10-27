// Plan 30 S3.5 Likes you (design: People.jsx#LikesYou): everyone who liked you, with what they liked and their comment.
// Free and never blurred. Like back (→ match) or Pass; tap a person to see their full profile.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Camera, Check, MessageSquareQuote, Users, X } from 'lucide-react'
import { Btn, Empty, Shell, Shimmer, T, photoOf } from '../components/r7'
import PhotoNudge from '../components/PhotoNudge'
import { useLikeFlow } from '../components/ProfileParts'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useSocketEvent } from '../hooks/useSocket'
import { api, errMsg } from '../lib/api'

const WHAT = { photo: 'your photo', prompt: 'your prompt', profile: 'your profile' }

function LikeTile({ l, i, mine, onAnswer, busy }) {
  const rm = useReducedMotion()
  const navigate = useNavigate()
  const p = l.profile
  return (
    <motion.article className="lt-tile card" initial={rm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...T.base, delay: i * 0.04 }}>
      <button type="button" className="lt-open" onClick={() => navigate(`/u/${p.userId}`, { state: { from: 'likes', like: l } })} aria-label={`See ${p.name}’s full profile`}>
        <img src={photoOf(p, 0, 'portrait')} alt="" className="lt-ph" />
      </button>
      <div className="lt-b">
        <b>{p.name}{p.age ? `, ${p.age}` : ''}</b>
        <p className="lt-what">Liked {WHAT[l.target.kind]}</p>
        {l.target.kind === 'prompt' && <p className="lt-item">“{l.target.ref}”</p>}
        {l.target.kind === 'photo' && mine.photos?.[Number(l.target.ref)] && <img className="lt-thumb" src={mine.photos[Number(l.target.ref)]} alt="Your photo they liked" />}
        {l.comment && <p className="lt-c">{l.comment}</p>}
        <div className="lt-a">
          <Btn kind="secondary" size="sm" icon={X} aria-label={`Pass on ${p.name}`} onClick={() => onAnswer(l, false)} disabled={busy}>Pass</Btn>
          <Btn size="sm" icon={Check} onClick={() => onAnswer(l, true)} disabled={busy}>Like back</Btn>
        </div>
      </div>
    </motion.article>
  )
}

// UI polish A7: light, kind humour for an empty page that can sting (never "no one likes you"). One line per visit.
const EMPTY_LINES = [
  ['No likes yet.', 'Your future crush is probably still choosing their prompts.'],
  ['Quiet in here… for now.', 'Profiles with 2+ photos get way more likes 👀'],
  ['Plot twist:', 'the best ones take their time.'],
]
function NoLikes({ onGo }) {
  const [[title, sub]] = useState(() => EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)])
  return (
    <div className="no-likes card">
      <Users size={28} strokeWidth={1.6} aria-hidden="true" />
      <h2 className="h2">{title}</h2>
      <p className="lead">{sub}</p>
      <ul className="nl-tips">
        <li><Camera size={18} strokeWidth={1.7} aria-hidden="true" /><span><b>Add 2 or more clear photos.</b> People like what they can see.</span></li>
        <li><MessageSquareQuote size={18} strokeWidth={1.7} aria-hidden="true" /><span><b>Answer all 3 prompts.</b> A good answer is the easiest thing to like.</span></li>
      </ul>
      <div className="nl-ctas"><Btn onClick={() => onGo('/profile#photos')}>Add photos</Btn><Btn kind="secondary" onClick={() => onGo('/profile')}>Write my prompts</Btn></div>
      <p className="small">When someone likes your photo or prompt, they show up here with what they liked.</p>
    </div>
  )
}

export default function LikesYou() {
  const mobile = useMobile()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [likes, setLikes] = useState(null)
  const [error, setError] = useState(null)
  const { send, busy, ui } = useLikeFlow()
  const load = useCallback(() => { setError(null); api.get('/api/likes/incoming').then((r) => setLikes(r.data.likes)).catch((e) => setError(errMsg(e))) }, [])
  useEffect(load, [load])
  useSocketEvent('like:new', load)

  const answer = async (l, liked) => { if (await send(l.profile, { liked })) setLikes((xs) => xs.filter((x) => x !== l)) }
  const n = likes?.length ?? 0
  const body = error ? <Empty icon={Users} title="We couldn’t load your likes" action={<Btn kind="secondary" onClick={load}>Try again</Btn>}>{error}</Empty>
    : !likes ? <div className="page narrow" aria-busy="true"><Shimmer w="40%" /><Shimmer /></div>
      : !n ? <NoLikes onGo={navigate} />
        : <div className="lt-grid">{likes.map((l, i) => <LikeTile key={l.profile.userId} l={l} i={i} mine={profile ?? {}} onAnswer={answer} busy={busy} />)}</div>
  if (mobile) return <Shell title="Likes you" sub={n ? `${n} ${n === 1 ? 'person' : 'people'} · free to see` : undefined}><div className="pad"><PhotoNudge />{body}</div>{ui}</Shell>
  return (
    <Shell>
      <div className="page"><PhotoNudge /><div className="pg-h"><div><h1 className="h1">Likes you</h1>{n > 0 && <p className="lead">{n === 1 ? 'One person' : `${n} people`} liked something on your profile. Seeing them is always free.</p>}</div></div>{body}</div>
      {ui}
    </Shell>
  )
}
