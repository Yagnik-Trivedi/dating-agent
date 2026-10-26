// Chat replay (Round 7 Step 2 design, Chat.jsx Replay): the agents' transcript on a timeline. Messages my letter
// quotes are evidence markers (green), laughs are clay markers; tapping a "why" point jumps the scrubber there.
// Play steps through the messages; ← → move the slider. Only my side's moments and my own letter.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, Check, ChevronLeft, History, Pause, PenLine, Play } from 'lucide-react'
import { Btn, Empty, IconBtn, Shimmer, T, TopNav } from '../components/r7'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

const VERDICT = { yes: 'compatible', unsure: 'maybe', no: 'not compatible' }

export default function Replay() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const mobile = useMobile()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const olRef = useRef(null)

  useEffect(() => {
    (async () => {
      try {
        const { data: m } = await api.get(`/api/matches/${id}`)
        if (!m.match.report?.conversationId) return setError('There’s no finished conversation to replay yet.')
        const { data: rep } = await api.get(`/api/conversations/${m.match.report.conversationId}/replay`)
        setData({ ...rep, them: m.match.other.name })
        setAt(Math.max(0, rep.messages.length - 1))
      } catch (err) { setError(errMsg(err)) }
    })()
  }, [id])
  const N = data?.messages.length ?? 0
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setAt((a) => { if (a >= N - 1) { setPlaying(false); return a } return a + 1 }), 900)
    return () => clearInterval(t)
  }, [playing, N])
  // Keep the current message in view (scrolls only the transcript, never the page).
  useEffect(() => { const ol = olRef.current; const box = ol?.parentElement; const cur = ol?.querySelector('.cur'); if (box && cur) box.scrollTop = Math.max(0, cur.offsetTop - box.clientHeight / 2 + cur.offsetHeight / 2) }, [at])

  if (error || !data) {
    return (
      <div className={`scr app-scr ${mobile ? 'm' : 'd'} replay`}>
        {mobile ? <header className="mbar"><IconBtn icon={ChevronLeft} label="Back" onClick={() => navigate(`/matches/${id}`)} /><div className="mb-t"><h1>Replay</h1></div></header> : <TopNav />}
        {error ? <Empty icon={History} title="Nothing to replay yet" action={<Btn kind="secondary" onClick={() => navigate(`/matches/${id}`)}>Back to the chat</Btn>}>{error}</Empty>
          : <div className="page narrow" aria-busy="true"><Shimmer w="40%" /><Shimmer /><Shimmer w="70%" /></div>}
      </div>
    )
  }

  const me = String(user._id)
  const idx = new Map(data.messages.map((m, i) => [String(m._id), i]))
  const why = (data.report?.reasons ?? []).map((r) => ({ t: r.text, i: idx.get(String(r.messageIds?.[0])) })).filter((r) => r.i != null)
  const ev = new Set(why.map((w) => w.i))
  const laughs = new Set(data.events.filter((e) => e.type === 'laugh').map((e) => idx.get(String(e.messageId))).filter((i) => i != null))
  const pct = (i) => (N > 1 ? (i / (N - 1)) * 100 : 0)
  const mins = data.conversation.startedAt && data.conversation.endedAt ? Math.max(1, Math.round((new Date(data.conversation.endedAt) - new Date(data.conversation.startedAt)) / 60000)) : null
  const name = (m) => (String(m.senderId) === me ? (user.name ?? 'Your') : data.them)

  const scrub = (
    <div className="scrub">
      <button type="button" className="sc-play" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { if (!playing && at >= N - 1) setAt(0); setPlaying(!playing) }}>{playing ? <Pause size={18} strokeWidth={2} /> : <Play size={18} strokeWidth={2} />}</button>
      <div className="sc-track" role="slider" tabIndex={0} aria-label="Replay position" aria-valuemin={1} aria-valuemax={N} aria-valuenow={at + 1} aria-valuetext={`Message ${at + 1} of ${N}${ev.has(at) ? ', evidence for your letter' : ''}`}
        onKeyDown={(e) => { if (e.key === 'Home') setAt(0); if (e.key === 'End') setAt(N - 1); if (e.key === 'ArrowRight') setAt((a) => Math.min(N - 1, a + 1)); if (e.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1)) }}>
        <i className="sc-fill" style={{ width: `${pct(at)}%` }} />
        {data.messages.map((m, i) => <span key={m._id} aria-hidden="true" className={`sc-tick ${ev.has(i) ? 'ev' : ''} ${laughs.has(i) ? 'mo' : ''}`} style={{ left: `${pct(i)}%` }} onClick={() => setAt(i)} />)}
        <motion.span className="sc-thumb" initial={false} animate={{ left: `${pct(at)}%` }} transition={T.spring} />
      </div>
      <span className="sc-t">{at + 1} / {N}</span>
    </div>
  )
  const transcript = (
    <ol className="rp-list" aria-label="Transcript" ref={olRef} aria-live="polite">
      {data.messages.map((m, i) => (
        <li key={m._id} className={`msg ${String(m.senderId) === me ? 'mine' : 'theirs'} ${i === at ? 'cur' : ''} ${i > at ? 'future' : ''}`}>
          <span className="agent-tag">{m.authoredBy === 'agent' && <PenLine size={13} strokeWidth={1.9} aria-hidden="true" />}{m.authoredBy === 'agent' ? `Written by ${name(m)}’s agent` : `${name(m)}`} · message {i + 1}</span>
          <p className={`bubble ${ev.has(i) ? 'evidence' : ''}`}>{m.text}</p>
          {ev.has(i) && <span className="ev-tag">Evidence in your letter</span>}
        </li>
      ))}
    </ol>
  )
  const whyBlock = why.length > 0 && (
    <div className="why">
      <h2 className="h3">Why your letter said {VERDICT[data.report.decision] ?? 'this'}</h2>
      <ul>{why.map((c, k) => <li key={k}><button type="button" className={`why-b ${at === c.i ? 'on' : ''}`} onClick={() => setAt(c.i)}><Check size={16} strokeWidth={2} aria-hidden="true" /><span>{c.t}</span><em>Message {c.i + 1} <ArrowRight size={13} strokeWidth={2} aria-hidden="true" /></em></button></li>)}</ul>
    </div>
  )
  const sub = `Your agent and ${data.them}’s agent${mins ? ` · ${mins} min` : ''}`
  if (mobile) return (
    <div className="scr app-scr m replay">
      <header className="mbar"><IconBtn icon={ChevronLeft} label="Back" onClick={() => navigate(`/matches/${id}/report`)} /><div className="mb-t"><h1>Replay</h1><span>{sub}</span></div></header>
      <div className="rp-body">{whyBlock}{transcript}</div>
      <div className="rp-dock">{scrub}</div>
    </div>
  )
  return (
    <div className="scr app-scr d replay">
      <TopNav />
      <div className="rp-grid">
        <div className="rp-main"><header className="rp-h"><h1 className="h1">The agents’ conversation</h1><p className="lead">{sub}. Every word, as written. Highlighted messages are the evidence your letter quotes.</p></header>{scrub}<div className="rp-scroll" tabIndex={0} role="region" aria-label="Conversation">{transcript}</div></div>
        <aside className="rp-side">{whyBlock || <p className="small">Your letter quotes no single message here.</p>}</aside>
      </div>
    </div>
  )
}
