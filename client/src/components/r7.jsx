// Prelude Round 7 Step 2 kit (Frontend-Design/07-prelude-step2/source/src/ui.jsx, plan 30 S6): the one component set.
// Same markup and motion as the design; the board's demo state is replaced by props (controlled inputs, real counts,
// real routes). Motion: transform + opacity only; MotionConfig reducedMotion="user" (App) + useReducedMotion here.
import { createContext, useContext, useEffect, useId, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react'
import { Compass, Users, MessageCircle, Orbit, Bell, Globe, MessageCircleQuestion, Lock, Plus, X, Check, ChevronLeft, ImagePlus, SendHorizontal, CircleCheck } from 'lucide-react'
import { illustration } from '../lib/art'
import { useMobile } from './prelude'

/* ---------- motion tokens (the design's motion spec) ---------- */
export const T = {
  fast: { duration: 0.15, ease: [0.2, 0.7, 0.2, 1] },
  base: { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] },
  slow: { duration: 0.25, ease: [0.2, 0.7, 0.2, 1] },
  spring: { type: 'spring', visualDuration: 0.28, bounce: 0 }, // sheets, shared elements, tab pill
  drag: { type: 'spring', stiffness: 420, damping: 34 }, // snap back after drag
}
export const ICON = { size: 20, strokeWidth: 1.6 }

export const Btn = ({ kind = 'primary', size = '', block, icon: I, iconRight: R, loading, children, className = '', disabled, ...p }) => (
  <button className={`btn ${kind} ${size} ${block ? 'block' : ''} ${loading ? 'is-loading' : ''} ${className}`} aria-busy={loading || undefined} disabled={disabled || loading} {...p}>
    {loading ? <Dots small /> : I && <I size={size === 'lg' ? 20 : 18} strokeWidth={1.8} aria-hidden="true" />}{children}{R && <R size={18} strokeWidth={1.8} aria-hidden="true" />}
  </button>
)
export const IconBtn = ({ icon: I, label, className = '', ...p }) => <button type="button" className={`ibtn ${className}`} aria-label={label} title={label} {...p}><I {...ICON} /></button>
/** A person's picture: their photo, else (demo people) an illustration from their id. Never a real person's photo in seed data. */
export const photoOf = (p, i = 0, scene) => {
  const ph = p?.photos?.[i]
  return (typeof ph === 'string' ? ph : ph?.url) || (i === 0 || scene ? illustration(String(p?.userId ?? p?._id ?? p?.name ?? '?'), scene ?? 'portrait') : null)
}
export const Avatar = ({ p, src, size = 40, ring }) => <img className={`avatar ${ring ? 'ring' : ''}`} src={src ?? photoOf(p, 0, 'portrait2')} width={size} height={size} alt="" />
export const Wordmark = ({ light }) => <span className={`wordmark ${light ? 'light' : ''}`}>Prelude</span>

export const STATUS = { agents: 'Agents chatting', compatible: 'Compatible', maybe: 'Maybe', not: 'Not compatible', flagged: 'Flagged', chatting: 'You’re chatting', waiting: 'Getting ready', closed: 'Closed', paused: 'Paused' }
/** Server match status → the design's six chips. */
export const chipOf = (status) => ({ agent_chatting: 'agents', compatible: 'compatible', handed_off: 'chatting', maybe: 'maybe', incompatible: 'not', flagged_fake: 'flagged', closed: 'closed', evaluating: 'agents', matched: 'waiting', trust_check: 'waiting', briefing: 'waiting', scheduled: 'waiting' }[status] ?? 'waiting')
export const StatusChip = ({ s, live }) => <span className={`st st-${['waiting', 'closed', 'paused'].includes(s) ? 'chatting' : s}`}>{live && <i className="dot" aria-hidden="true" />}{STATUS[s] ?? s}</span>

/* Agent "thinking" loader: three soft dots, or a shimmer line. Never sparkles. */
export const Dots = ({ small, label = 'Writing' }) => <span className={`dots ${small ? 'sm' : ''}`} role="status" aria-label={label}><i /><i /><i /></span>
export const Shimmer = ({ w = '100%' }) => <span className="shimmer" style={{ width: w }} aria-hidden="true" />

/* Smooth sliding tabs (shared pill via layoutId). items: [[key, label, count?]] */
export function Tabs({ items, value, onChange, id, full }) {
  const uid = useId()
  return (
    <LayoutGroup id={id || uid}>
      <div className={`tabs2 ${full ? 'full' : ''}`} role="tablist">
        {items.map(([k, l, n]) => (
          <button type="button" key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange?.(k)}>
            {value === k && <motion.span layoutId="pill" className="pill" transition={T.spring} />}
            <span className="tl">{l}{n != null && <b>{n}</b>}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

/* Privacy: Public / Only if asked / Private (values match KgFact.disclosure). */
export function Privacy({ value = 'public', onChange, compact, disabled }) {
  const opts = [['public', 'Public', Globe], ['if_asked', 'Only if asked', MessageCircleQuestion], ['private', 'Private', Lock]]
  return (
    <div className={`seg ${compact ? 'c' : ''}`} role="radiogroup" aria-label="Who can see this">
      {opts.map(([k, l, I]) => <button type="button" key={k} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} disabled={disabled} onClick={() => onChange?.(k)}><I size={15} strokeWidth={1.8} aria-hidden="true" />{l}</button>)}
    </div>
  )
}
export function Seg({ items, value, onChange, label }) {
  return <div className="seg" role="radiogroup" aria-label={label}>{items.map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange?.(k)}>{l}</button>)}</div>
}

/* Like with a small micro-interaction: the plus turns into a check, the pill presses in. */
export function LikeBtn({ what, light, liked = false, onLike, disabled }) {
  return (
    <motion.button type="button" className={`like ${light ? 'light' : ''} ${liked ? 'liked' : ''}`} aria-pressed={liked} aria-label={`Like ${what}`} whileTap={{ scale: 0.94 }} transition={T.fast}
      disabled={disabled} onClick={onLike}>
      <motion.span className="lk-i" animate={{ rotate: liked ? 90 : 0 }} transition={T.base}>{liked ? <Check size={18} strokeWidth={2.2} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true" /> : <Plus size={18} strokeWidth={2} aria-hidden="true" />}</motion.span>
      {liked ? 'Liked' : 'Like'}
    </motion.button>
  )
}

/* Form fields */
export function Field({ label, hint, error, children, id, optional }) {
  const uid = useId(); const fid = id || uid
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={fid}>{label}{optional && <em> · optional</em>}</label>
      {typeof children === 'function' ? children(fid) : children}
      {error ? <p className="f-err" role="alert">{error}</p> : hint ? <p className="f-hint">{hint}</p> : null}
    </div>
  )
}
export const Input = ({ icon: I, right, className = '', ...p }) => (
  <span className={`input ${className}`}>{I && <I size={18} strokeWidth={1.7} aria-hidden="true" />}<input {...p} />{right}</span>
)
export const Check2 = ({ checked, onChange, children, required }) => (
  <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange?.(e.target.checked)} required={required} /><span className="box" aria-hidden="true"><Check size={14} strokeWidth={2.6} /></span><span>{children}</span></label>
)
/** items: strings or [value, label]; value: string (single) or array (multi). */
export function Chips({ items, value, multi, onChange, label }) {
  const v = multi ? (value ?? []) : value
  const on = (k) => (multi ? v.includes(k) : v === k)
  const tog = (k) => onChange?.(multi ? (on(k) ? v.filter((x) => x !== k) : [...v, k]) : k)
  return (
    <div className="chips" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {items.map((it) => { const [k, l] = Array.isArray(it) ? it : [it, it]; return (
        <button type="button" key={k} role={multi ? undefined : 'radio'} aria-checked={multi ? undefined : on(k)} aria-pressed={multi ? on(k) : undefined} className={`chipx ${on(k) ? 'on' : ''}`} onClick={() => tog(k)}>
          {multi && on(k) && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}{l}
        </button>
      ) })}
    </div>
  )
}
/* Importance: nothing pre-selected. value: 'low' | 'medium' | 'high' | null */
const IMP = [['low', 'Not important'], ['medium', 'Somewhat'], ['high', 'Very']]
export function Importance({ value = null, onChange }) {
  const idx = IMP.findIndex(([k]) => k === value)
  return <div className="imp" role="radiogroup" aria-label="How important is this to you?">{IMP.map(([k, l], i) => <button type="button" key={k} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange?.(k)}><span className="imp-dots" aria-hidden="true">{[0, 1, 2].map((d) => <i key={d} className={d <= i && idx === i ? 'f' : ''} />)}</span>{l}</button>)}</div>
}
export const Toggle = ({ on, onChange, label, disabled }) => <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`tg ${on ? 'on' : ''}`} onClick={() => onChange?.(!on)}><motion.i layout transition={T.spring} /></button>

/* Toast stack (AnimatePresence + layout). items: [{ id, text, icon?, action?, onAction? }] */
export function Toasts({ items, className = '' }) {
  return (
    <div className={`toasts ${className}`} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((t) => (
          <motion.div key={t.id} layout className="toast" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={T.base}>
            {t.icon ? <t.icon size={18} strokeWidth={1.8} aria-hidden="true" /> : <CircleCheck size={18} strokeWidth={1.8} aria-hidden="true" />}<span>{t.text}</span>{t.action && <button type="button" className="link" onClick={t.onAction}>{t.action}</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
/* Bottom sheet (mobile) / modal (desktop). Esc and the scrim close it. */
export function Sheet({ open, title, onClose, children, footer, wide }) {
  const mobile = useMobile()
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="scrim app-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.base} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} className={`sheet ${mobile ? 'bottom' : 'modal'} ${wide ? 'wide' : ''}`}
            initial={mobile ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.98 }} animate={mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }} exit={mobile ? { y: '100%' } : { opacity: 0, y: 8 }} transition={T.spring}>
            {mobile && <i className="grab" aria-hidden="true" />}
            <header className="sh-h"><h2>{title}</h2>{onClose && <IconBtn icon={X} label="Close" onClick={onClose} />}</header>
            <div className="sh-b">{children}</div>
            {footer && <footer className="sh-f">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
/* Chat composer: photo button, auto-growing field, send (Enter sends, Shift+Enter is a new line). */
export function Composer({ value, onChange, onSend, onPhoto, placeholder = 'Message', disabled }) {
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(120, el.scrollHeight)}px` } }, [value])
  return (
    <form className={`composer ${disabled ? 'disabled' : ''}`} onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSend?.() }}>
      {onPhoto && <IconBtn icon={ImagePlus} label="Add a photo" onClick={onPhoto} disabled={disabled} />}
      <textarea ref={ref} rows={1} className="cm-field" aria-label="Message" placeholder={placeholder} value={value} disabled={disabled} maxLength={1000}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (value.trim()) onSend?.() } }} />
      <button type="submit" className="send" aria-label="Send" disabled={disabled || !value.trim()}><SendHorizontal size={18} strokeWidth={1.9} /></button>
    </form>
  )
}

/* anime.js line drawing: draws every [data-draw] path inside ref once mounted (skipped under reduced motion).
   anime.js is imported lazily so it only loads on screens that draw. */
export function useDraw(ref, { duration = 1000, delay = 0, ease = 'inOutQuad', stagger = 0, deps = [] } = {}) {
  const rm = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    const paths = el?.querySelectorAll('[data-draw]')
    if (rm || !paths?.length) return
    let a, alive = true
    import('animejs').then(({ animate, svg }) => {
      if (!alive) return
      a = animate(svg.createDrawable(paths), { draw: ['0 0', '0 1'], duration, delay: stagger ? (_, i) => delay + i * stagger : delay, ease })
    })
    return () => { alive = false; a?.revert?.() }
  }, [rm, ...deps])
}

/* Navigation. Counts come from the shell context (Layout). "Likes you" arrives in plan 30 S3. */
export const ShellCtx = createContext({ counts: {}, user: null })
const NAV = [['/discover', 'Discover', Compass, 'discover'], ['/likes', 'Likes you', Users, 'likes'], ['/matches', 'Matches', MessageCircle, 'matches'], ['/you', 'This is you', Orbit, 'you']]
const navOn = ({ isActive }) => (isActive ? 'on' : '')
export function TopNav() {
  const { counts, user } = useContext(ShellCtx)
  const navigate = useNavigate()
  return (
    <header className="topnav">
      <NavLink to="/discover" aria-label="Prelude home"><Wordmark /></NavLink>
      <nav aria-label="Main">{NAV.filter(([to]) => to !== '/likes' || counts.likesEnabled).map(([to, l, I, k]) => (
        <NavLink key={to} to={to} className={navOn}><I size={18} strokeWidth={1.7} aria-hidden="true" />{l}{k === 'likes' && counts.likes > 0 && <b className="count">{counts.likes}</b>}{k === 'matches' && counts.matches > 0 && <i className="ndot" aria-label="new" />}</NavLink>
      ))}</nav>
      <div className="topnav-r">
        <span className="bell"><IconBtn icon={Bell} label={counts.notifications ? `Notifications, ${counts.notifications} new` : 'Notifications'} onClick={() => navigate('/notifications')} />{counts.notifications > 0 && <i className="ndot" />}</span>
        <NavLink to="/settings" aria-label="Your account and settings"><Avatar p={user} size={34} /></NavLink>
      </div>
    </header>
  )
}
export function TabBar() {
  const { counts } = useContext(ShellCtx)
  return (
    <nav className="tabbar" aria-label="Main">{NAV.filter(([to]) => to !== '/likes' || counts.likesEnabled).map(([to, l, I, k]) => (
      <NavLink key={to} to={to} className={navOn}><span className="tb-i"><I size={22} strokeWidth={1.7} aria-hidden="true" />{k === 'likes' && counts.likes > 0 && <b className="count">{counts.likes}</b>}{k === 'matches' && counts.matches > 0 && <i className="ndot" />}</span>{k === 'you' ? 'You' : l}</NavLink>
    ))}</nav>
  )
}
export function MBar({ title, back, right, sub }) {
  const navigate = useNavigate()
  return <header className="mbar">{back && <IconBtn icon={ChevronLeft} label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))} />}<div className="mb-t"><h1>{title}</h1>{sub && <span>{sub}</span>}</div>{right}</header>
}
/** App shell: desktop top nav + page, or mobile top bar + content + tab bar (the design's Shell). */
export function Shell({ title, back, right, sub, tab = true, nav = true, children, className = '' }) {
  const mobile = useMobile()
  if (mobile) return <div className={`scr app-scr m ${className}`}>{title && <MBar title={title} back={back} right={right} sub={sub} />}<div className={`m-body ${tab ? 'with-tab' : ''}`}>{children}</div>{tab && <TabBar />}</div>
  return <div className={`scr app-scr d ${className}`}>{nav && <TopNav />}<div className={`d-body ${nav ? '' : 'no-nav'}`}>{children}</div></div>
}
/* Empty / error / loading blocks */
export const Empty = ({ icon: I, title, children, action }) => (
  <div className="empty" role="status">{I && <span className="em-i"><I size={26} strokeWidth={1.5} aria-hidden="true" /></span>}<h2>{title}</h2>{children && <p>{children}</p>}{action}</div>
)
