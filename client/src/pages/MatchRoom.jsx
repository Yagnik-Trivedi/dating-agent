// Match room (owner's design: Frontend-Design/04-direction/source/src/screens/Room.jsx), on real data.
// Reading room: their lines and my agent's, with my agent's notes in the margin beside the line they came from.
// Pause, Resume and Take over are always one tap away; "I wouldn't say that" on my own agent's lines.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronUp, Circle, Flag, Hand, Heart, Laugh, Lock, MessageSquareText, Pause, Play, Send, ShieldCheck, X } from 'lucide-react'
import { Btn, Drafted, ICON, Status, Stream, Thumb, TrustBadge, Typing, calm, useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useMatch, wouldntSay } from '../hooks/useMatch'
import { useToast } from '../hooks/useToast'
import { errMsg } from '../lib/api'

const AGENT_PHASES = ['matched', 'trust_check', 'briefing', 'agent_chatting', 'evaluating']
const LOCKED = ['closed', 'flagged_fake']
const REPORT = ['compatible', 'maybe', 'incompatible', 'handed_off']
const INTEREST = ['Polite', 'Curious', 'Warming up', 'Into it', 'Very into it']
const interestWord = (x) => (x == null ? null : INTEREST[Math.max(0, Math.min(4, Math.floor(x * 5)))])
const PHASE_LINE = {
  matched: 'You liked each other. Your agent is getting ready.',
  trust_check: 'Your agent is checking their profile for fakes and inconsistencies.',
  briefing: 'Your agent is reading their profile before saying hello.',
  scheduled: 'Your agent will start this chat tomorrow. There’s a daily limit while we’re in preview.',
  evaluating: 'The agents have stepped back. Your agent is writing its read.',
}
const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Margin notes for one message: my chat moments and my notes whose quote comes from it (first line: the trust check). */
function notesFor(msg, i, { events, facts, trust }) {
  const n = []
  if (i === 0 && trust?.level) n.push({ kind: 'trust', label: 'Trust check', icon: ShieldCheck, text: trust.level === 'ok' ? 'Their profile reads as genuine. No red flags.' : (trust.flags?.[0] ?? 'A few things worth asking about.') })
  for (const e of events.filter((x) => String(x.messageId) === String(msg._id))) {
    if (e.type === 'shared_interest') n.push({ kind: 'shared', label: 'You share this', icon: Heart, text: e.label, q: e.quote })
    else if (e.type === 'laugh') n.push({ kind: 'shared', label: 'A real laugh', icon: Laugh, text: 'You laughed at the same thing.', q: e.quote })
    else if (['disagreement', 'interest_clash', 'dealbreaker_hint', 'question_dodged'].includes(e.type)) n.push({ kind: 'explore', label: 'Worth talking about', icon: MessageSquareText, text: e.label ?? 'Something to come back to.', q: e.quote })
    else if (e.type === 'disagreement_resolved') n.push({ kind: 'covered', label: 'Talked it through', icon: Check, text: e.label ?? 'You disagreed, then found common ground.' })
  }
  for (const f of facts.filter((x) => x.evidence?.some((ev) => String(ev.messageId) === String(msg._id)))) {
    n.push({ kind: 'note', label: 'Noted', icon: MessageSquareText, text: f.object, q: f.evidence.find((ev) => String(ev.messageId) === String(msg._id))?.quote })
  }
  return n
}

function Note({ n, line, open: o0 }) {
  const [open, setOpen] = useState(o0)
  const I = n.icon
  return (
    <motion.div className={`note k-${n.kind}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={calm}>
      <div className="note-h"><span className="kind"><I size={14} strokeWidth={1.8} aria-hidden="true" />{n.label}</span>
        {n.q && <button className="mini" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Hide quote' : 'Show quote'}>{open ? <ChevronUp size={15} strokeWidth={1.6} /> : <ChevronDown size={15} strokeWidth={1.6} />}</button>}</div>
      <p>{n.text}</p>
      {open && n.q && <blockquote>“{n.q}”<a className="lref" href={`#line-${line}`}>line {line}</a></blockquote>}
    </motion.div>
  )
}

/** "I wouldn't say that": optional "how would you say it?", then a toast. */
function WouldntSay({ messageId }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [fix, setFix] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await wouldntSay(messageId, fix.trim() || undefined)
      toast('Your agent will remember', { agent: true })
      setOpen(false)
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally { setBusy(false) }
  }
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}>I wouldn’t say that</button>
  return (
    <form className="ws-form" onSubmit={save}>
      <label className="sr-only" htmlFor={`ws-${messageId}`}>How would you say it?</label>
      <input id={`ws-${messageId}`} className="ws-input" value={fix} onChange={(e) => setFix(e.target.value)} placeholder="How would you say it? (optional)" maxLength={1000} autoFocus />
      <Btn size="sm" type="submit" loading={busy}>Save</Btn>
      <button type="button" className="icon-btn sm" aria-label="Cancel" onClick={() => setOpen(false)}><X size={16} strokeWidth={1.6} /></button>
    </form>
  )
}

function Side({ match, events, interest, them }) {
  const shared = [...new Set(events.filter((e) => e.type === 'shared_interest' && e.label).map((e) => e.label))]
  const agenda = match.brief?.agenda ?? []
  const word = interestWord(interest)
  return (
    <aside className="r-side">
      <section><h3 className="t-label">Trust</h3>
        <p className="side-row trust"><TrustBadge level={match.trust?.level} /></p>
        {(match.trust?.flags ?? []).slice(0, 2).map((f) => <p key={f} className="side-row"><Flag {...ICON} />{f}</p>)}
      </section>
      <section><h3 className="t-label">What you share so far</h3>
        {shared.length ? <div className="chips">{shared.map((s) => <span key={s} className="chip shared">{s}</span>)}</div> : <p className="side-muted">Nothing yet, which is normal this early.</p>}</section>
      {word && <section><h3 className="t-label">How {them} seems</h3><p className="side-big">{word}</p><p className="side-muted">From their replies, not a score.</p></section>}
      {agenda.length > 0 && <section><h3 className="t-label">What your agent wants to find out</h3>
        {agenda.map((a) => <p key={a.id} className={`side-row ${a.status === 'answered' ? 'done' : ''}`}>{a.status === 'answered' ? <Check {...ICON} /> : <Circle {...ICON} />}{a.topic}</p>)}</section>}
    </aside>
  )
}

export default function MatchRoom() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const mobile = useMobile(1100) // notes margin + reading column + side panel need ~1100 px
  const rm = useReducedMotion()
  const toast = useToast()
  const { match, messages, facts, events, interest, typingUserId, error, reload, send, takeover, pause, resume, sendTyping } = useMatch(id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null)
  const [sheet, setSheet] = useState(false)
  const bottom = useRef(null)
  const firstLoad = useRef(null)
  if (firstLoad.current === null && messages.length) firstLoad.current = messages.length
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: firstLoad.current ? 'smooth' : 'auto', block: 'end' }) }, [messages.length, typingUserId])

  const me = String(user?._id)
  const notes = useMemo(() => messages.map((m, i) => notesFor(m, i, { events, facts, trust: match?.trust })), [messages, events, facts, match?.trust])

  if (error) return <div className="scr state err"><div className="st-center"><h2 className="t-h2">We couldn’t load this conversation</h2><p className="t-body muted">Sorry about that. Nothing was sent or shared while it was down.</p><Btn kind="secondary" onClick={reload}>Try again</Btn></div></div>
  if (!match) return <div className="scr room-loading" aria-busy="true"><div className="st-body"><div className="sk sk-t" /><div className="sk sk-t2" />{[0, 1, 2].map((i) => <div key={i} className="sk-item"><div className="sk sk-l" /><div className="sk sk-s" /></div>)}</div></div>

  const them = match.other.name
  const handedOff = match.status === 'handed_off'
  const agentOn = match.agentActive && AGENT_PHASES.includes(match.status)
  const locked = LOCKED.includes(match.status)
  const canType = !agentOn && !locked
  const state = agentOn ? 'chatting' : match.paused ? 'paused' : 'you'
  const lastNote = notes.map((n, i) => (n.some((x) => x.q) ? i : -1)).filter((i) => i >= 0).pop()
  const noteCount = notes.reduce((s, n) => s + n.length, 0)
  const who = (m) => (String(m.senderId) === me ? (m.authoredBy === 'agent' ? 'Your agent' : 'You') : m.authoredBy === 'agent' ? `${them}’s agent` : them)

  const act = (name, fn, done) => async () => {
    setBusy(name)
    try { await fn(); if (done) toast(done) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }
  async function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy('send')
    try { await send(text); setText('') } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }

  const controls = !locked && !handedOff && (match.agentActive || match.paused) && (
    <>
      {match.paused
        ? <Btn kind="secondary" icon={Play} onClick={act('resume', resume)} loading={busy === 'resume'}>{mobile ? 'Resume' : 'Resume my agent'}</Btn>
        : <Btn kind="secondary" icon={Pause} onClick={act('pause', pause)} loading={busy === 'pause'} aria-label="Pause my agent">{mobile ? 'Pause' : 'Pause my agent'}</Btn>}
      <Btn icon={Hand} block={mobile} onClick={act('takeover', takeover)} loading={busy === 'takeover'}>Take over</Btn>
    </>
  )

  return (
    <div className={`scr room ${mobile ? 'm' : 'd'}`}>
      <header className="r-head">
        <button className="icon-btn" aria-label="Back to matches" onClick={() => navigate('/matches')}><ChevronLeft {...ICON} /></button>
        <Thumb src={match.other.photo} name={them} size={mobile ? 38 : 44} clear={handedOff} />
        <div className="r-name">
          <h2 className="t-h2">{them}</h2>
          {mobile ? <Status state={state} short /> : <p>{[match.other.age, match.other.city].filter(Boolean).join(' · ')}<span className="dot-sep" /><TrustBadge level={match.trust?.level} /></p>}
        </div>
        {!mobile && <Status state={state} />}
        {!mobile && controls}
      </header>

      <div className="r-body">
        <div className="r-col">
          <p className="r-sys">{PHASE_LINE[match.status] ?? (messages.length ? `The first conversation started at ${time(messages[0].createdAt)}. You can read every word.` : 'No messages yet.')}</p>
          {match.status === 'flagged_fake' && <p className="r-sys flag-line"><Flag size={15} strokeWidth={1.7} aria-hidden="true" />Your agent thinks this profile is fake and stopped talking. {match.trust?.flags?.[0]}</p>}
          {messages.map((m, i) => {
            const mineAgent = String(m.senderId) === me && m.authoredBy === 'agent'
            const ns = notes[i]
            return (
              <div id={`line-${i + 1}`} className={`r-row ${String(m.senderId) === me ? 'me' : 'them'}`} key={m._id}>
                {!mobile && <aside className="r-notes">{ns.map((n, k) => <Note key={k} n={n} line={i + 1} open={i === lastNote && !!n.q} />)}</aside>}
                <motion.div className="r-msg" initial={rm || i < (firstLoad.current ?? 0) ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={calm}>
                  <div className="r-meta"><b>{who(m)}</b><span className="t-data">{time(m.createdAt)}</span>
                    {mobile && ns.some((n) => n.kind === 'shared') && <span className="pip shared">You share this</span>}</div>
                  <p className="r-line"><Stream text={m.text} animate={m.authoredBy === 'agent' && i >= (firstLoad.current ?? 0)} /></p>
                  {mineAgent && <Drafted><WouldntSay messageId={m._id} /></Drafted>}
                </motion.div>
              </div>
            )
          })}
          {typingUserId && (
            <div className={`r-row ${String(typingUserId) === me ? 'me' : 'them'}`}>{!mobile && <aside />}
              <div className="r-msg"><div className="r-meta"><b>{String(typingUserId) === me ? 'Your agent' : them}</b></div><Typing label={`${String(typingUserId) === me ? 'Your agent' : them} is writing`} /></div></div>
          )}
          {REPORT.includes(match.status) && (
            <Link to={`/matches/${match._id}/report`} className="r-report card"><span><b>{handedOff ? 'You’re chatting now' : 'Your agent’s read is ready'}</b><em>{handedOff ? 'See what your agent noticed' : 'Only you can see it'}</em></span><ArrowRight {...ICON} /></Link>
          )}
          <div ref={bottom} />
        </div>
        {!mobile && <Side match={match} events={events} interest={interest} them={them} />}
      </div>

      {mobile ? (
        <div className="r-mbar">
          {controls && <div className="r-mbtns">{controls}</div>}
          {canType && <Composer text={text} setText={setText} submit={submit} busy={busy === 'send'} sendTyping={sendTyping} them={them} />}
          <button className="sheet-peek" onClick={() => setSheet(true)} aria-label="What your agent noticed. Opens a sheet."><i className="grab" /><span><b>What your agent noticed</b><em>{noteCount === 1 ? '1 note' : `${noteCount} notes`}</em></span><ChevronUp {...ICON} /></button>
        </div>
      ) : canType ? (
        <div className="r-composer typing-on"><Composer text={text} setText={setText} submit={submit} busy={busy === 'send'} sendTyping={sendTyping} them={them} /></div>
      ) : (
        <div className="r-composer"><Lock size={16} strokeWidth={1.7} aria-hidden="true" /><span>{locked ? 'This conversation is closed.' : 'Your agent is writing for you. You can take over whenever you like.'}</span>
          {!locked && <Btn kind="secondary" icon={Hand} onClick={act('takeover', takeover)} loading={busy === 'takeover'}>Write it myself</Btn>}</div>
      )}

      {mobile && sheet && (
        <div className="sheet-scrim" onClick={() => setSheet(false)}>
          <motion.div className="sheet" role="dialog" aria-label="What your agent noticed" onClick={(e) => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={calm}>
            <div className="sheet-h"><h3 className="t-h3">What your agent noticed</h3><button className="icon-btn" aria-label="Close" onClick={() => setSheet(false)}><X {...ICON} /></button></div>
            <div className="sheet-body">
              {notes.flatMap((ns, i) => ns.map((n, k) => <Note key={`${i}-${k}`} n={n} line={i + 1} open={false} />))}
              {!noteCount && <p className="side-muted">Nothing yet. Notes appear as your agent reads their replies.</p>}
              <Side match={match} events={events} interest={interest} them={them} />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function Composer({ text, setText, submit, busy, sendTyping, them }) {
  return (
    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="room-input">Message {them}</label>
      <input id="room-input" className="composer-input" value={text} maxLength={1000} placeholder={`Write to ${them}…`} autoComplete="off"
        onChange={(e) => { setText(e.target.value); sendTyping?.() }} />
      <Btn type="submit" icon={Send} loading={busy} disabled={!text.trim()} aria-label="Send">Send</Btn>
    </form>
  )
}
