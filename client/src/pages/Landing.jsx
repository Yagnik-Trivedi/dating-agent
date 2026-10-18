// Landing (owner's design: screens/Landing.jsx): photography slot with the live agent conversation as the product
// moment. The demo loops the design's scripted chat (fictional people) and then the hand-off to the humans.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Eye, Hand, Lock, Menu, ShieldCheck, X } from 'lucide-react'
import { Btn, ICON, Typing, calm, useMobile } from '../components/prelude'
import { HANDOFF, PEOPLE, SCRIPT } from '../lib/demoScript'
import { duskPhoto } from '../lib/placeholderPhoto'

const TRUST = [
  [ShieldCheck, 'Every profile is checked for fakes before anyone says hello'],
  [Eye, 'You can read everything your agent says'],
  [Hand, 'Take over or pause at any time'],
]

/** Steps through the demo chat like a real one: typing, then the line; loops after the hand-off. */
function useDemo(pace = 2800) {
  const rm = useReducedMotion()
  const all = [...SCRIPT, { sys: true }, ...HANDOFF]
  const [shown, setShown] = useState(rm ? all.length : 0)
  const [typing, setTyping] = useState(null)
  useEffect(() => {
    if (rm) return
    let alive = true
    let i = 0
    const timers = []
    const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms))
    const tick = () => {
      if (i >= all.length) { later(() => { i = 0; setShown(0); later(tick, 900) }, 6000); return }
      const m = all[i]
      if (m.sys) { i++; setShown(i); later(tick, pace * 1.3); return }
      setTyping(m.from)
      later(() => { setTyping(null); i++; setShown(i); later(tick, pace * 0.45) }, Math.min(pace * 1.1, 500 + m.t.length * 18))
    }
    later(tick, 600)
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [rm]) // eslint-disable-line react-hooks/exhaustive-deps
  const visible = all.slice(0, shown)
  return { visible, typing, handoff: visible.some((m) => m.sys) }
}

/** Phrases that became shared ground are set in the signature colour (the design's `hl`). */
function Highlighted({ m }) {
  if (!m.hl?.length) return m.t
  const parts = m.t.split(new RegExp(`(${m.hl.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`))
  return parts.map((p, i) => (m.hl.includes(p) ? <span key={i} className="hl">{p}</span> : p))
}

function LiveCard({ mobile }) {
  const demo = useDemo()
  const lines = demo.visible.filter((m) => !m.sys).slice(mobile ? -1 : -2)
  return (
    <div className="live-card" aria-live="polite">
      <div className="live-h"><span>First conversation</span><span className="live-s"><i aria-hidden="true" />{demo.handoff ? 'They’re chatting now' : 'Both agents chatting'}</span></div>
      <AnimatePresence initial={false} mode="popLayout">
        {lines.map((m) => (
          <motion.div layout="position" key={demo.visible.indexOf(m)} className={`live-line ${m.from} ${m.human ? 'human' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={calm}>
            <span className="who">{PEOPLE[m.from].name}<em>{m.human ? 'in person' : 'drafted by their agent'}</em></span>
            <p><Highlighted m={m} /></p>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="live-foot">{demo.typing ? <><Typing />{PEOPLE[demo.typing].name}’s agent is writing</> : demo.handoff ? 'The agents stepped back after 11 messages.' : 'You can read along at any time.'}</div>
    </div>
  )
}

const STEPS = [
  ['You both say yes', 'Like someone’s profile. If they like you back, it’s a match. Your agent first checks their profile for fakes and inconsistencies.'],
  ['Your agents talk first', 'Your agent has the early conversation in your own words, from what you told it about yourself. It never makes things up about you; when it doesn’t know, it asks you.'],
  ['You get an honest read', 'Compatible, Maybe or Not compatible, with their own words as evidence. Only you see your read. You decide what happens next.'],
]
const PRINCIPLES = [
  [Lock, 'You stay in control', 'Watch every line, pause your agent, or take over in one tap. Agents only start after you both agree to it at sign-up.'],
  [ShieldCheck, 'Private stays private', 'Things you mark private are never sent as something your agent may say. The other person’s agent never sees your profile notes.'],
  [Eye, 'No guessing about who you are', 'Your agent never infers religion, caste, ethnicity or anything else from names or photos.'],
]

export default function Landing() {
  const mobile = useMobile(1000)
  const [menu, setMenu] = useState(false)
  return (
    <div className={`scr landing ${mobile ? 'm' : 'd'}`}>
      <nav className="l-nav">
        <span className="wordmark">Prelude</span>
        {!mobile && <div className="l-links"><a href="#how">How it works</a><a href="#principles">Safety</a><a href="#principles">Our principles</a></div>}
        {mobile ? <button className="icon-btn" aria-label={menu ? 'Close menu' : 'Menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X {...ICON} /> : <Menu {...ICON} />}</button>
          : <div className="l-right"><Link className="l-login" to="/login">Log in</Link><Link to="/signup" className="btn primary">Get started</Link></div>}
      </nav>
      {mobile && menu && <div className="l-menu card"><a href="#how" onClick={() => setMenu(false)}>How it works</a><a href="#principles" onClick={() => setMenu(false)}>Safety and principles</a><Link to="/login">Log in</Link></div>}
      <figure className="l-photo">
        <img src={duskPhoto()} alt="" />
        <figcaption className="ph-tag">Placeholder photo · an evening walk, city at dusk, no faces</figcaption>
        <LiveCard mobile={mobile} />
      </figure>
      <section className="l-copy">
        {!mobile && <p className="eyebrow">Dating, with an introduction</p>}
        <h1 className="t-display">Introduced by someone who knows you.</h1>
        <p className="t-lead">After you both like each other, your agents have the first conversation, in your own words. You read every line, and you step in when it feels right.</p>
        <div className="l-ctas"><Link to="/signup" className={`btn primary lg ${mobile ? 'block' : ''}`}>Get started</Link>{!mobile && <a className="text-link" href="#how">See how it works <ArrowRight size={16} strokeWidth={1.6} /></a>}</div>
        <ul className="l-trust">{TRUST.slice(0, mobile ? 2 : 3).map(([I, t]) => <li key={t}><I {...ICON} aria-hidden="true" />{t}</li>)}</ul>
      </section>

      <section className="l-more" id="how">
        <h2 className="t-h2">How it works</h2>
        <ol className="l-steps">{STEPS.map(([h, p], i) => <li key={h} className="card"><span className="t-data">{i + 1}</span><h3 className="t-h3">{h}</h3><p className="t-body">{p}</p></li>)}</ol>
      </section>
      <section className="l-more" id="principles">
        <h2 className="t-h2">Our principles</h2>
        <ul className="l-steps">{PRINCIPLES.map(([I, h, p]) => <li key={h} className="card"><I {...ICON} className="l-pi" aria-hidden="true" /><h3 className="t-h3">{h}</h3><p className="t-body">{p}</p></li>)}</ul>
        <div className="l-ctas l-end"><Link to="/signup" className={`btn primary lg ${mobile ? 'block' : ''}`}>Get started</Link><Link className="text-link" to="/login">I already have an account</Link></div>
      </section>
    </div>
  )
}
