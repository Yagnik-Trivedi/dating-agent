// Landing (Round 7 Step 2 design, Landing.jsx): hero line, the quiet "introduced" moment (two dots connect into one
// thin line, anime.js), how it works, trust and privacy, and a call to action. Never "verified".
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Eye, Flag, Lock, MailOpen, Menu, MessageSquareText, PenLine, ShieldCheck, X } from 'lucide-react'
import { IconBtn, T, Wordmark, useDraw } from '../components/r7'
import { useMobile } from '../components/prelude'
import { illustration } from '../lib/art'

function HeroArt({ mobile }) {
  const ref = useRef(null)
  const rm = useReducedMotion()
  useDraw(ref, { duration: 1100, delay: 450, ease: 'inOutQuad' })
  const W = mobile ? 343 : 600, H = mobile ? 390 : 560
  const a = mobile ? [96, 168] : [170, 290], b = mobile ? [248, 150] : [430, 262]
  return (
    <div className="hero-art" ref={ref} style={{ width: W, height: H, maxWidth: '100%' }}>
      <motion.img className="ha-card a" src={illustration('demo-aarav', 'portrait')} alt="An illustrated person" initial={rm ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...T.slow, delay: 0.05 }} />
      <motion.img className="ha-card b" src={illustration('demo-meera', 'portrait')} alt="Another illustrated person" initial={rm ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...T.slow, delay: 0.15 }} />
      <svg className="ha-line" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
        <path data-draw d={`M${a[0]} ${a[1]} C ${a[0] + 60} ${a[1] - 90}, ${b[0] - 60} ${b[1] - 90}, ${b[0]} ${b[1]}`} className="ha-path" />
        <motion.circle cx={a[0]} cy={a[1]} r="6" className="ha-dot" initial={rm ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ ...T.base, delay: 0.3 }} />
        <motion.circle cx={b[0]} cy={b[1]} r="6" className="ha-dot" initial={rm ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ ...T.base, delay: 0.38 }} />
      </svg>
      <motion.p className="ha-msg" initial={rm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...T.slow, delay: 1.45 }}>
        <span className="agent-tag"><PenLine size={13} strokeWidth={1.9} aria-hidden="true" />Written by Meera’s agent</span>
        <span className="bubble">Real treks or Instagram treks? 😄</span>
      </motion.p>
    </div>
  )
}
function Reveal({ children, i = 0, className = '' }) {
  const rm = useReducedMotion()
  return <motion.div className={className} initial={rm ? { opacity: 0 } : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ ...T.slow, delay: i * 0.06 }}>{children}</motion.div>
}
const STEPS = [
  [MessageSquareText, 'Like a photo or a prompt', 'Profiles are photos and prompts. Like the part that caught your eye.'],
  [PenLine, 'Let your agents break the ice', 'When you both like each other, your agents talk first, in your own texting style. You read along and can take over any time.'],
  [MailOpen, 'Read a private letter', 'Your agent tells you what clicked, with their actual words. Then you decide. There’s never a score.'],
]
const TRUST = [
  [ShieldCheck, 'Every photo is checked', 'Each new photo gets an automatic check before anyone sees it: no contact details, QR codes or explicit content.'],
  [Eye, 'You see every word', 'Every message an agent writes is labelled, for both of you. Take over at any moment.'],
  [Lock, 'Private stays private', 'Mark anything Public, Only if asked, or Private. Your agent never shares Private.'],
  [Flag, 'Fakes get caught early', 'Your agent checks each profile before it says hello, and stops talking to anything that looks like a scam.'],
]

export default function Landing() {
  const mobile = useMobile()
  const [menu, setMenu] = useState(false)
  return (
    <div className={`scr landing landing-page ${mobile ? 'm' : 'd'}`}>
      <header className="l-nav"><Wordmark />
        {!mobile && <nav className="l-links"><a href="#how">How it works</a><a href="#trust">Safety and privacy</a></nav>}
        {mobile ? <IconBtn icon={menu ? X : Menu} label={menu ? 'Close menu' : 'Menu'} aria-expanded={menu} onClick={() => setMenu(!menu)} />
          : <div className="l-right"><Link className="link plain" to="/login">Log in</Link><Link className="btn primary" to="/signup">Join Prelude</Link></div>}
      </header>
      {mobile && menu && <nav className="l-menu card"><a href="#how" onClick={() => setMenu(false)}>How it works</a><a href="#trust" onClick={() => setMenu(false)}>Safety and privacy</a><Link to="/login">Log in</Link></nav>}
      <section className="l-hero">
        <div className="l-copy">
          <h1 className="l-h">A dating app that breaks the ice for you.</h1>
          <p className="lead">Photos, prompts and likes, like any good app. When you both like each other, your agents can have the first conversation in your own words. You read every line, and take over whenever you like.</p>
          <div className="l-ctas"><Link className={`btn primary lg ${mobile ? 'block' : ''}`} to="/signup">Join Prelude</Link>{!mobile && <a className="btn ghost lg" href="#how">See how it works<ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" /></a>}</div>
          <p className="small">{mobile ? <>Already here? <Link className="link" to="/login">Log in</Link></> : 'Free to use.'}</p>
        </div>
        <HeroArt mobile={mobile} />
      </section>
      <section className="l-steps" id="how" aria-labelledby="how-h">
        <h2 className="h2" id="how-h">How it works</h2>
        <ol>{STEPS.map(([I, t, d], i) => <Reveal key={t} i={i}><li><span className="st-n">{i + 1}</span><I size={22} strokeWidth={1.6} aria-hidden="true" /><h3 className="h3">{t}</h3><p>{d}</p></li></Reveal>)}</ol>
      </section>
      <section className="l-trust" id="trust">
        <h2 className="h2">Built to be trusted</h2>
        <ul>{TRUST.map(([I, t, d], i) => <Reveal key={t} i={i}><li><I size={20} strokeWidth={1.7} aria-hidden="true" /><div><h3 className="h3">{t}</h3><p>{d}</p></div></li></Reveal>)}</ul>
      </section>
      <section className="l-cta"><Reveal><h2 className="h2">Ready when you are.</h2><p className="lead">Setting up takes a few minutes. Teaching your agent more is optional.</p><Link className="btn primary lg" to="/signup">Join Prelude</Link></Reveal></section>
      <footer className="l-foot"><Wordmark /><span className="small">Built for the Nebius x NVIDIA hackathon · illustrated people only</span></footer>
    </div>
  )
}
