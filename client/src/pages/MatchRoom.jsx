// Match room (Round 7 Step 2 design, Frontend-Design/07-prelude-step2 Room.jsx) on real data. Every agent message is
// labelled "Written by …'s agent" for both people; a calm status strip ticks through the agents' steps; "What my agent
// is noticing" (only me) shows the interest line, chat moments and notes with their quotes. Take over is one tap.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, BellRing, Check, ChevronDown, ChevronLeft, Circle, Flag, Hand, Lock, Pause, PenLine, Play, Quote, RefreshCw, WifiOff } from 'lucide-react'
import { Btn, Composer, Dots, Empty, Field, IconBtn, Avatar, LiveBadge, Sheet, Shimmer, StatusChip, T, Tabs, TopNav, chipOf } from '../components/r7'
import { InterestLine } from '../components/charts'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useMatch, wouldntSay } from '../hooks/useMatch'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

const LIVE = ['matched', 'trust_check', 'briefing', 'agent_chatting']
const LOCKED = ['closed', 'flagged_fake']
const LETTER = ['compatible', 'maybe', 'incompatible', 'handed_off']
const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const DEVA = /[ऀ-ॿ]/

/** The agents' steps, in the order our pipeline runs them. → [{ t, d }], index of the current one */
function stepsFor(match, n, them) {
  const steps = [
    { t: `Checking ${them}’s profile for fakes`, d: match.trust?.level === 'ok' ? 'No red flags' : match.trust?.level ? 'A few things to ask about' : 'In a moment' },
    { t: `Reading ${them}’s profile`, d: match.otherProfile ? `${match.otherProfile.photos?.length ?? 0} photos, ${match.otherProfile.prompts?.length ?? 0} prompts` : '' },
    { t: 'Saying hello', d: n ? 'Opened from their profile' : 'Next' },
    { t: 'Talking', d: `${n} messages so far` },
    { t: 'Writing your letter', d: 'When they finish' },
  ]
  const i = { matched: 0, trust_check: 0, briefing: 1, agent_chatting: n ? 3 : 2, evaluating: 4 }[match.status] ?? 4
  return [steps, i]
}

/** Manus-style status strip: one calm line that ticks live; expand for every step. */
function StatusStrip({ steps, step, open, onToggle }) {
  const cur = steps[step]
  return (
    <div className={`strip ${open ? 'open' : ''}`}>
      <button type="button" className="strip-1" aria-expanded={open} onClick={onToggle}>
        <Dots small label="Working" />
        <AnimatePresence mode="wait" initial={false}><motion.span key={step} className="strip-t" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={T.base}>{cur.t}</motion.span></AnimatePresence>
        <span className="strip-n">Step {step + 1} of {steps.length}</span>
        <ChevronDown size={16} strokeWidth={1.8} className="strip-c" aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol className="strip-l" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={T.base}>
            {steps.map((s, i) => (
              <li key={s.t} className={i < step ? 'done' : i === step ? 'now' : ''}>
                <span className="sl-i">{i < step ? <Check size={14} strokeWidth={2.4} /> : i === step ? <i className="sl-dot" /> : <Circle size={10} strokeWidth={2} />}</span>
                <b>{s.t}</b><span>{s.d}</span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}

function Bubble({ m, mine, author, last, onWouldnt }) {
  return (
    <motion.div layout className={`msg ${mine ? 'mine' : 'theirs'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={T.base}>
      {m.authoredBy === 'agent' && <span className="agent-tag"><PenLine size={13} strokeWidth={1.9} aria-hidden="true" />Written by {author}’s agent</span>}
      <p className="bubble" lang={DEVA.test(m.text) ? 'hi' : undefined}>{m.text}</p>
      <span className="msg-meta">{time(m.createdAt)}{mine && m.authoredBy === 'agent' && last && <><span aria-hidden="true">·</span><button type="button" className="link" onClick={() => onWouldnt(m._id)}>I wouldn’t say that</button></>}</span>
    </motion.div>
  )
}

const MOMENT = { shared_interest: 'shared', laugh: 'laugh', disagreement: 'disagree', interest_clash: 'disagree' }
/** What my agent is noticing (only me): the interest line, then notes with the quote they came from. */
function Noticing({ them, messages, me, facts, events, interestSeries }) {
  const series = interestSeries.map((x) => Math.max(0, Math.min(3, x.interest * 3)))
  const turnOf = (messageId) => { // my agent's turn index at or after a message
    const at = messages.findIndex((m) => String(m._id) === String(messageId))
    return interestSeries.findIndex((x) => messages.findIndex((m) => String(m._id) === String(x.messageId)) >= at)
  }
  const moments = events.filter((e) => MOMENT[e.type]).map((e) => ({ i: turnOf(e.messageId), k: MOMENT[e.type], label: e.label ? `${e.type === 'laugh' ? 'A real laugh' : e.type === 'shared_interest' ? 'Shared interest' : 'Disagreed'}: ${e.label}` : 'A real laugh' })).filter((m) => m.i >= 0)
  const notes = facts.filter((f) => f.evidence?.[0]?.quote).slice().reverse()
  return (
    <div className="notice">
      <h2 className="h3">What my agent is noticing</h2>
      <p className="small">Only you can see this.</p>
      {series.length > 1 && <div className="interest card-in"><div className="int-h"><span>How {them} seems, turn by turn</span></div>
        <InterestLine series={series} moments={moments} shown={series.length} label={`How ${them} seems across the conversation`} /></div>}
      <ul className="notes">
        <AnimatePresence initial={false}>{notes.map((n) => (
          <motion.li layout key={n._id} className="note" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={T.base}><p>{n.object}</p><blockquote><Quote size={14} strokeWidth={1.8} aria-hidden="true" />{n.evidence[0].quote}</blockquote></motion.li>
        ))}</AnimatePresence>
        {!notes.length && <li className="small">Nothing yet. Notes appear as your agent reads {them}’s replies{messages.some((m) => String(m.senderId) !== me) ? '' : ', once they start'}.</li>}
      </ul>
    </div>
  )
}

/** Desktop left column: my matches. */
function MatchList({ current }) {
  const [rows, setRows] = useState(null)
  useLayoutEffect(() => { api.get('/api/matches').then(({ data }) => setRows(data.matches)).catch(() => setRows([])) }, [current])
  return (
    <aside className="rm-matches"><h1 className="h3">Matches</h1>
      <ul className="mlist-ul">{(rows ?? []).slice(0, 8).map((m) => (
        <li key={m._id} className={`mrow ${String(m._id) === String(current) ? 'on' : ''}`}>
          <Link to={`/matches/${m._id}`} className="mrow-link" aria-current={String(m._id) === String(current) ? 'page' : undefined}>
            <span className="mav"><Avatar p={m.other} src={m.other.photo ?? undefined} size={52} />{m.status === 'agent_chatting' && <i className="live-dot" aria-label="Agents are talking now" />}</span>
            <div className="mtx"><div className="mt-top"><b>{m.other.name}</b>{m.lastMessageAt && <span className="mtime">{time(m.lastMessageAt)}</span>}</div><StatusChip s={chipOf(m.status)} live={m.status === 'agent_chatting'} /><span className={`mlast ${m.unread ? 'strong' : ''}`}>{m.lastMessage?.text ?? 'No messages yet'}</span></div>
            {m.unread > 0 && <span className="unread" aria-label={`${m.unread} unread`}>{m.unread}</span>}
          </Link>
        </li>
      ))}</ul>
    </aside>
  )
}

export default function MatchRoom() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const mobile = useMobile()
  const toast = useToast()
  const { match, messages, facts, events, interestSeries, typingUserId, error, reload, send, takeover, pause, resume, sendTyping } = useMatch(id)
  const [tab, setTab] = useState('chat')
  const [stripOpen, setStripOpen] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null)
  const [wouldnt, setWouldnt] = useState(null)
  const [fix, setFix] = useState('')
  const list = useRef(null)
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [Boolean(match), messages.length, typingUserId, tab])
  const me = String(user?._id)
  const lastMine = useMemo(() => messages.map((m, i) => (String(m.senderId) === me && m.authoredBy === 'agent' ? i : -1)).filter((i) => i >= 0).pop(), [messages, me])

  const act = (name, fn, done) => async () => {
    setBusy(name)
    try { await fn(); if (done) toast(done) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }
  async function submit() {
    setBusy('send')
    try { await send(text); setText('') } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }
  async function saveWouldnt() {
    setBusy('wouldnt')
    try { await wouldntSay(wouldnt, fix.trim() || undefined); toast('Your agent will remember', { agent: true }); setWouldnt(null); setFix('') } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }

  const them = match?.other.name ?? ''
  const live = match && LIVE.includes(match.status)
  const agentsTalking = live && (match.agentActive || match.otherAgentActive)
  const locked = match && LOCKED.includes(match.status)
  const canType = match && !locked && (match.status === 'handed_off' || (live && !match.agentActive))
  const [steps, step] = match ? stepsFor(match, messages.length, them) : [[], 0]

  const head = match && (
    <header className="rm-head">
      {mobile && <IconBtn icon={ChevronLeft} label="Back to matches" onClick={() => navigate('/matches')} />}
      <Avatar p={match.other} src={match.other.photo ?? undefined} size={mobile ? 40 : 44} />
      <div className="rm-who"><h2>{them}</h2><StatusChip s={chipOf(match.status)} live={match.status === 'agent_chatting'} /></div>
      {!mobile && match.other.liveChecked && <LiveBadge />}
    </header>
  )

  let feed
  if (error) feed = <div className="rm-list"><Empty icon={WifiOff} title="We lost the connection" action={<Btn kind="secondary" icon={RefreshCw} onClick={reload}>Try again</Btn>}>Nothing was sent while we were offline. Your agents pick up where they left off.</Empty></div>
  else if (!match) feed = <div className="rm-list loading" aria-busy="true"><p className="sys">Your agents are getting ready…</p>{[70, 50, 64].map((w, i) => <div key={i} className={`msg ${i % 2 ? 'mine' : 'theirs'}`}><Shimmer w={`${w}%`} /></div>)}</div>
  else feed = (
    <div className="rm-list" ref={list} aria-live="polite" aria-label="Messages">
      {messages.length > 0 && <p className="sys">{messages[0].authoredBy === 'agent' ? 'Your agents broke the ice' : 'You started chatting'} · {time(messages[0].createdAt)}</p>}
      {match.status === 'flagged_fake' && <p className="sys"><Flag size={14} strokeWidth={1.8} aria-hidden="true" /> Your agent thinks this profile is fake and stopped talking. {match.trust?.flags?.[0]}</p>}
      {messages.map((m, i) => {
        const mine = String(m.senderId) === me
        return <Bubble key={m._id} m={m} mine={mine} author={mine ? (user?.name ?? 'Your') : them} last={i === lastMine} onWouldnt={setWouldnt} />
      })}
      {typingUserId && (() => {
        const mine = String(typingUserId) === me
        const agent = mine ? match.agentActive : match.otherAgentActive
        return <div className={`msg ${mine ? 'mine' : 'theirs'}`}><span className="agent-tag">{agent && <PenLine size={13} strokeWidth={1.9} aria-hidden="true" />}{agent ? `${mine ? (user?.name ?? 'Your') : them}’s agent is writing` : `${them} is typing`}</span><p className="bubble typing"><Dots /></p></div>
      })()}
      {LETTER.includes(match.status) && (
        <Link to={`/matches/${match._id}/report`} className="card letter-link"><span><b>{match.status === 'handed_off' ? 'You’re chatting now' : 'Your letter is ready'}</b><em>{match.status === 'handed_off' ? 'See what your agent noticed' : 'Only you can see it'}</em></span><ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" /></Link>
      )}
    </div>
  )

  const footer = !match ? null : canType ? (
    <div className="rm-compose"><Composer value={text} onChange={(v) => { setText(v); sendTyping?.() }} onSend={submit} placeholder={`Write to ${them}…`} disabled={busy === 'send'} /></div>
  ) : live && match.agentActive ? (
    <div className="rm-take">
      <div className="rm-take-btns">
        {match.paused ? <Btn kind="secondary" icon={Play} onClick={act('resume', resume)} loading={busy === 'resume'}>Resume</Btn>
          : <Btn kind="ghost" icon={Pause} onClick={act('pause', pause, 'Your agent is paused. Nothing will be sent.')} loading={busy === 'pause'}>Pause</Btn>}
        <Btn size="lg" block icon={Hand} onClick={act('takeover', takeover)} loading={busy === 'takeover'}>Take over</Btn>
      </div>
      {!mobile && <p className="small">Your agent stops at once, and {them} sees that you’re here.</p>}
    </div>
  ) : (
    <div className="rm-take"><p className="small"><Lock size={14} strokeWidth={1.8} aria-hidden="true" /> {locked ? 'This conversation is closed.' : match.status === 'evaluating' ? 'The agents stepped back. Your agent is writing your letter.' : 'You can write here once you both say yes.'}</p></div>
  )

  const noticing = match && <Noticing them={them} messages={messages} me={me} facts={facts} events={events} interestSeries={interestSeries} />
  const chat = (
    <section className="rm-chat" aria-label={`Conversation with ${them}`}>
      {head}
      {agentsTalking && <div className="banner" role="status"><BellRing size={17} strokeWidth={1.7} aria-hidden="true" /><span>Your agents are talking. Keep browsing; we’ll let you know.</span></div>}
      {live && match && <StatusStrip steps={steps} step={step} open={stripOpen ?? !mobile} onToggle={() => setStripOpen(!(stripOpen ?? !mobile))} />}
      {mobile && match && <div className="rm-tabs"><Tabs id="room-m" value={tab} onChange={setTab} full items={[['chat', 'Chat'], ['notice', 'Noticing', facts.filter((f) => f.evidence?.[0]?.quote).length]]} /></div>}
      {mobile && tab === 'notice' ? <div className="rm-list">{noticing}</div> : feed}
      {footer}
    </section>
  )
  const sheet = (
    <Sheet open={Boolean(wouldnt)} title="I wouldn’t say that" onClose={() => setWouldnt(null)}
      footer={<><Btn kind="ghost" onClick={() => setWouldnt(null)}>Cancel</Btn><Btn onClick={saveWouldnt} loading={busy === 'wouldnt'}>Save</Btn></>}>
      <p className="small">Your agent learns from this for every chat, not just this one.</p>
      <Field label="How would you say it?" optional>{(fid) => <textarea id={fid} className="ta" rows={3} maxLength={1000} value={fix} onChange={(e) => setFix(e.target.value)} />}</Field>
    </Sheet>
  )
  if (mobile) return <div className="scr app-scr room m">{chat}{sheet}</div>
  return (
    <div className="scr app-scr room d">
      <TopNav />
      <div className="rm-grid">
        <MatchList current={id} />
        {chat}
        <aside className="rm-side">{noticing}</aside>
      </div>
      {sheet}
    </div>
  )
}
