// Prelude primitives, ported from the owner's design (Frontend-Design/04-direction/source/src/ui.jsx): one primary
// button per screen, a calm status pill, "Drafted by your agent", typing dots, word-by-word agent text, the verdict
// reveal. Motion: 200–450 ms ease-in-out, never a bounce; reduced motion shows everything at once.
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PenLine, ShieldCheck, ShieldAlert } from 'lucide-react'

const DUR = { fast: 0.2, base: 0.3, slow: 0.45 }
const EASE = [0.45, 0, 0.55, 1]
export const calm = { duration: DUR.base, ease: EASE }
export const ICON = { size: 18, strokeWidth: 1.6 }

/** The design's two layouts: `.m` up to 820 px, `.d` above. */
export function useMobile(max = 820) {
  const query = `(max-width: ${max}px)`
  const [m, setM] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}

export const Btn = ({ kind = 'primary', size, block, icon: Ic, loading, children, disabled, ...p }) => (
  <button className={`btn ${kind} ${size || ''} ${block ? 'block' : ''}`} disabled={disabled || loading} aria-busy={loading || undefined} {...p}>
    {Ic && <Ic {...ICON} aria-hidden="true" />}{children}
  </button>
)

/** chatting · paused · you (took over / handed off) · done (the agents stepped back) */
export function Status({ state = 'chatting', short }) {
  const text = { chatting: short ? 'Your agent is chatting' : 'Your agent is chatting for you', paused: 'Paused · nothing is being sent', you: 'You’re chatting', done: 'The agents stepped back' }[state]
  return <span className={`status s-${state}`} role="status"><i aria-hidden="true" />{text}</span>
}

/** Our real trust check (no selfie or liveness claims: verification isn't built). level: ok · caution · likely_fake */
export function TrustBadge({ level, short }) {
  if (level === 'likely_fake') return <span className="verified flag"><ShieldAlert size={15} strokeWidth={1.7} aria-hidden="true" />{short ? 'Looks fake' : 'Your agent thinks this profile is fake'}</span>
  if (level === 'caution') return <span className="verified caution"><ShieldCheck size={15} strokeWidth={1.7} aria-hidden="true" />{short ? 'Checked · a few questions' : 'Checked for fakes · a few things to ask'}</span>
  if (level === 'ok') return <span className="verified"><ShieldCheck size={15} strokeWidth={1.7} aria-hidden="true" />{short ? 'Checked' : 'Profile checked for fakes'}</span>
  return null
}

export const Drafted = ({ children }) => <span className="drafted"><PenLine size={13} strokeWidth={1.7} aria-hidden="true" />Drafted by your agent{children}</span>

/** Profile photo, blurred until you both say yes (the design's rule). */
export function Thumb({ src, name, size = 44, ratio = 1.25, clear = false }) {
  return (
    <span className={`thumb-wrap ${clear ? '' : 'blur'}`} style={{ width: size, height: Math.round(size * ratio) }}>
      {src ? <img className="thumb" src={src} width={size} height={Math.round(size * ratio)} alt={clear ? `${name ?? 'Their'} photo` : 'Profile photo, blurred until you both say yes'} />
        : <span className="thumb thumb-ph" aria-hidden="true">{(name ?? '?').slice(0, 1)}</span>}
    </span>
  )
}

export const Typing = ({ label = 'typing' }) => <span className="typing" role="status" aria-label={label}><i /><i /><i /></span>

const DEVA = /[ऀ-ॿ]/
/** Plain text in runs, with Devanagari set in Noto Sans Devanagari. */
function runs(text) {
  return String(text ?? '').split(/(\s+)/).filter(Boolean).map((w) => ({ s: w, hi: DEVA.test(w) }))
}
export function Line({ text }) {
  return runs(text).map((r, i) => (r.hi ? <span key={i} className="deva" lang="hi">{r.s}</span> : r.s))
}

/** The agent's words arrive one by one (200 ms fade, 30 ms stagger) when `animate`; otherwise, or with reduced motion, at once. */
export function Stream({ text, animate = true }) {
  const rm = useReducedMotion()
  if (rm || !animate) return <Line text={text} />
  let n = 0
  return runs(text).map((r, i) => {
    if (/^\s+$/.test(r.s)) return r.s
    const k = n++
    return <motion.span key={i} className={r.hi ? 'deva' : undefined} lang={r.hi ? 'hi' : undefined}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DUR.fast, ease: EASE, delay: Math.min(k, 60) * 0.03 }}>{r.s}</motion.span>
  })
}

/** Calm reveal: fades up 8 px (450 ms); sections follow 60 ms apart. */
export function Reveal({ i = 0, children, className = '' }) {
  const rm = useReducedMotion()
  return <motion.div className={className} initial={rm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow, ease: EASE, delay: 0.15 + i * 0.06 }}>{children}</motion.div>
}

/** Loading skeleton, empty and error states (design: States.jsx). */
export function EmptyNote({ title, children, action }) {
  return <div className="st-center"><h2 className="t-h2">{title}</h2>{children && <p className="t-body muted">{children}</p>}{action}</div>
}
