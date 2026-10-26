// A Hinge-style profile (Round 7 Step 2 design), shared by Discover, the profile view (/u/:id) and Likes you:
// photos and prompts interleaved, each with its own Like; liking opens a sheet with an optional comment (plan 30 S3.4).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { Baby, Briefcase, Cigarette, GraduationCap, Languages, MapPin, MessageCircle, PenLine, Ruler, Target, Utensils, Wine } from 'lucide-react'
import { Btn, Field, LikeBtn, Sheet, photoOf } from './r7'

const SCENES = ['portrait', 'trek', 'sketch', 'cafe', 'city']
const DRINK = { never: 'Doesn’t drink', socially: 'Drinks socially', regularly: 'Drinks regularly' }
const SMOKE = { never: 'Doesn’t smoke', socially: 'Smokes socially', regularly: 'Smokes', trying_to_quit: 'Trying to quit smoking' }
const KIDS = { yes: 'Wants kids', no: 'Doesn’t want kids', open: 'Open to kids', unsure: 'Not sure about kids', have_already: 'Has kids' }
// Plan 31 A2: basics filled from section-B answers (values as stored in the gate).
const GOAL = { long_term: 'Looking for long-term', open_to_long_term: 'Open to long-term', short_term: 'Looking for something short-term', figuring_it_out: 'Figuring out what they want' }
const DIET = { veg: 'Vegetarian', non_veg: 'Eats non-veg', vegan: 'Vegan', jain: 'Jain food', eggetarian: 'Eggetarian' }
const label = (t) => String(t ?? '').replace(/_/g, ' ')
export const COMMENT_MAX = 150

/** Photos to show: their own, plus illustrated scenes for demo people with fewer than 3. */
export const photosOf = (p) => {
  const own = (p.photos ?? []).map((_, i) => photoOf(p, i)).filter(Boolean)
  const scenes = SCENES.filter((s) => !(own.length && s === 'portrait')).map((s) => photoOf({ ...p, photos: [] }, 0, s))
  return [...own, ...scenes].slice(0, Math.max(3, own.length))
}

export const Photo = ({ src, i, n, name, h, onLike, busy }) => (
  <figure className="ph" style={h ? { height: h } : undefined}>
    <img src={src} alt={`${name}, photo ${i + 1} of ${n}`} />
    {onLike && <LikeBtn what={`photo ${i + 1}`} light onLike={() => onLike({ kind: 'photo', ref: String(i) })} disabled={busy} />}
  </figure>
)
export const Prompt = ({ p, onLike, busy }) => (
  <article className="prompt card"><p className="pq">{p.q}</p><p className="pa">{p.a}</p>
    {onLike && <LikeBtn what={`their answer to “${p.q}”`} onLike={() => onLike({ kind: 'prompt', ref: p.q })} disabled={busy} />}
  </article>
)
export function Basics({ p }) {
  const l = p.tags?.lifestyle ?? {}
  const rows = [
    [Briefcase, [p.job, p.workplace].filter(Boolean).join(' · ')], [GraduationCap, p.education], [MapPin, p.city], [Ruler, p.height],
    [Languages, p.languages?.length && p.languages.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')],
    [Target, p.tags?.relationshipGoal && (GOAL[p.tags.relationshipGoal] ?? `Looking for ${label(p.tags.relationshipGoal)}`)], [Wine, DRINK[l.drinking]], [Cigarette, SMOKE[l.smoking]], [Baby, KIDS[p.tags?.wantsKids]], [Utensils, DIET[l.diet]],
  ].filter(([, t]) => t)
  return (
    <section className="basics card" aria-label="Basics">
      {rows.length > 0 && <ul className="bas-row">{rows.map(([I, t]) => <li key={t}><I size={17} strokeWidth={1.7} aria-hidden="true" />{t}</li>)}</ul>}
      {p.bio && <p className="bas-bio">{p.bio}</p>}
      {p.tags?.interests?.length > 0 && <div className="interests">{p.tags.interests.map((x) => <span key={x} className="tag">{x}</span>)}</div>}
    </section>
  )
}

/** Prompts and photos interleaved, the way the design reads: prompt, basics, prompt, photo, prompt, photo… */
export function ProfileBody({ p, photos, mobile, onLike, busy }) {
  const prompts = p.prompts ?? []
  const items = [prompts[0] && <Prompt key="q0" p={prompts[0]} onLike={onLike} busy={busy} />, <Basics key="b" p={p} />]
  for (let i = 1; i < Math.max(prompts.length, photos.length); i++) {
    if (prompts[i]) items.push(<Prompt key={`q${i}`} p={prompts[i]} onLike={onLike} busy={busy} />)
    if (photos[i]) items.push(<Photo key={`p${i}`} src={photos[i]} i={i} n={photos.length} name={p.name} h={mobile ? 420 : 520} onLike={onLike} busy={busy} />)
  }
  return items.filter(Boolean)
}

/** Like a photo or a prompt, with an optional comment. onSend(comment | ''). */
export function LikeSheet({ like, p, photos, onClose, onSend, busy }) {
  const [comment, setComment] = useState('')
  const prompt = like?.kind === 'prompt' && p.prompts?.find((x) => x.q === like.ref)
  const close = () => { setComment(''); onClose() }
  const send = (c) => { onSend(c); setComment('') }
  return (
    <Sheet open={Boolean(like)} title={like?.kind === 'profile' ? `Like ${p?.name ?? 'them'}` : `Like ${p?.name ?? 'their'}’s ${like?.kind === 'prompt' ? 'prompt' : 'photo'}`} onClose={close}
      footer={<><Btn kind="ghost" onClick={close} disabled={busy}>Cancel</Btn><Btn onClick={() => send(comment.trim())} loading={busy}>Send like</Btn></>}>
      {prompt ? <article className="prompt mini"><p className="pq">{prompt.q}</p><p className="pa">{prompt.a}</p></article>
        : like?.kind === 'photo' && <img className="like-ph" src={photos?.[Number(like.ref)]} alt="The photo you’re liking" />}
      <Field label="Add a comment" optional hint={`A comment makes it easy to start talking. ${COMMENT_MAX - comment.length} characters left.`}>
        {(id) => <textarea id={id} className="ta" rows={2} maxLength={COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} />}
      </Field>
    </Sheet>
  )
}

/** It's a match: how do you want to start? (S3.6). onStart(choice). */
export function MatchChoice({ open, name, defaultChoice = 'agents', onStart, onClose, busy }) {
  const [choice, setChoice] = useState(defaultChoice)
  const opts = [['agents', PenLine, 'Let our agents break the ice (~3 min)', 'They talk in your styles, you both can read along, and each of you gets a private letter.'], ['self', MessageCircle, 'Chat myself now', 'Skip the agents and say hello yourself.']]
  return (
    <Sheet open={open} title={`You and ${name} liked each other`} onClose={onClose} footer={<Btn onClick={() => onStart(choice)} loading={busy}>Start</Btn>}>
      <p className="lead sm">How do you want to start?</p>
      <div className="mt-opts" role="radiogroup" aria-label="How to start">
        {opts.map(([k, I, t, d]) => <button key={k} type="button" role="radio" aria-checked={choice === k} className={`mt-opt card ${choice === k ? 'on' : ''}`} onClick={() => setChoice(k)}><I size={22} strokeWidth={1.6} aria-hidden="true" /><b>{t}</b><span>{d}</span></button>)}
      </div>
      <p className="small">{name} chooses too. If either of you picks “Chat myself now”, you both chat directly.</p>
    </Sheet>
  )
}


/** Send a like (or pass); on a match, ask how to start, then open the room. → { send, busy, ui } */
export function useLikeFlow() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [matched, setMatched] = useState(null)
  const [busy, setBusy] = useState(false)
  async function send(p, { liked = true, target, comment } = {}) {
    setBusy(true)
    try {
      const { data } = await api.post('/api/likes', { toUserId: p.userId, liked, ...(liked && { target: target ?? { kind: 'profile' }, comment: comment || undefined }) })
      if (data.matched) setMatched({ profile: p, matchId: data.matchId })
      else if (liked) toast(`You liked ${p.name}. If they like you back, you’ll match.`)
      return true
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
      return false
    } finally { setBusy(false) }
  }
  async function start(choice) {
    setBusy(true)
    await api.post(`/api/matches/${matched.matchId}/choice`, { choice }).catch(() => {})
    setBusy(false)
    navigate(`/matches/${matched.matchId}`)
  }
  const ui = <MatchChoice open={Boolean(matched)} name={matched?.profile.name} defaultChoice={user?.agentMode === 'off' ? 'self' : 'agents'} onStart={start} onClose={() => setMatched(null)} busy={busy} />
  return { send, busy, ui }
}
