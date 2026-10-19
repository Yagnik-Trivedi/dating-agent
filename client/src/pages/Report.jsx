// The verdict letter (Round 7 Step 2 design, Letters.jsx), from MY judge's decision only, never the other side's.
// Compatible: what clicked + worth exploring · Maybe: what's promising + still unclear ("Let them talk a bit longer") ·
// Not compatible: where you differ, kindly ("Talk anyway"). Every point quotes their words and links into the replay.
// Motion: the card rises; the headline's underline draws and "What clicked" points stagger in (anime.js, lazy).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, CircleHelp, Flag, Hourglass, Lock, MessageCircleMore, X } from 'lucide-react'
import { Avatar, Btn, Dots, IconBtn, Shimmer, StatusChip, TopNav, useDraw } from '../components/r7'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useMatch } from '../hooks/useMatch'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

const CHIP = { compatible: 'compatible', maybe: 'maybe', incompatible: 'not' }

function Wrap({ mobile, children }) {
  if (mobile) return <div className="scr app-scr letterscr m">{children}</div>
  return <div className="scr app-scr letterscr d"><TopNav /><div className="lt-page">{children}</div></div>
}

function DateIdeas({ matchId, icebreakers }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    api.get(`/api/matches/${matchId}/date-ideas`).then(({ data }) => setState(data))
      .catch((err) => setState({ error: err.response?.data?.error?.code === 'DATE_IDEAS_UNAVAILABLE' ? err.response.data.error.message : errMsg(err) }))
  }, [matchId])
  const breakers = state.icebreakers?.length ? state.icebreakers : icebreakers
  return (
    <>
      {breakers?.length > 0 && <><h2 className="lt-sec">Something to open with</h2><ul className="explore">{breakers.map((t) => <li key={t}>{t}</li>)}</ul></>}
      <h2 className="lt-sec">Ideas for a first date</h2>
      {state.loading ? <Shimmer w="70%" /> : state.error ? <p className="small">{state.error}</p>
        : <ul className="explore">{state.ideas.map((i) => <li key={i.link}><a className="link" href={i.link} target="_blank" rel="noreferrer">{i.title}</a>{i.why && <span className="small"> · {i.why}</span>}</li>)}</ul>}
    </>
  )
}

export default function Report() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mobile = useMobile()
  const rm = useReducedMotion()
  const toast = useToast()
  const { user, profile } = useAuth()
  const { match, messages, decide, extend } = useMatch(id)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const head = useRef(null), list = useRef(null)

  const load = () => { setError(null); return api.get(`/api/matches/${id}/report`).then(({ data: d }) => setData(d)).catch((err) => setError(errMsg(err))) }
  useEffect(() => { load() }, [id, match?.status]) // eslint-disable-line react-hooks/exhaustive-deps -- a waiting letter reloads when the judges finish
  const lineOf = useMemo(() => new Map(messages.map((m, i) => [String(m._id), i + 1])), [messages])
  const report = data?.report
  const verdict = report?.verdict
  useDraw(head, { duration: 600, delay: 450, ease: 'outQuad', deps: [verdict] }) // hand-drawn underline
  useEffect(() => { // "What clicked" points 60 ms apart
    if (rm || !list.current) return
    const items = list.current.querySelectorAll(':scope > li'); if (!items.length) return
    let a, alive = true
    import('animejs').then(({ animate, stagger }) => { if (alive) a = animate(items, { opacity: [0, 1], translateY: [8, 0], duration: 250, delay: stagger(60, { start: 600 }), ease: 'outQuad' }) })
    return () => { alive = false; a?.revert?.() }
  }, [rm, verdict])

  const me = { ...(profile ?? {}), userId: user?._id }
  const pair = match && <div className="lt-pair"><Avatar p={me} size={44} ring /><Avatar p={match.other} src={match.other.photo ?? undefined} size={44} ring /></div>
  const close = mobile && <IconBtn icon={X} label="Close" onClick={() => navigate(`/matches/${id}`)} />

  if (error) return <Wrap mobile={mobile}><article className="letter card"><div className="lt-body"><h1 className="lt-h">We couldn’t load your letter</h1><p className="lt-sub">{error}</p><Btn kind="secondary" onClick={load}>Try again</Btn></div></article></Wrap>
  if (!data || !match || (!report && !['flagged_fake', 'closed'].includes(data.status))) return (
    <Wrap mobile={mobile}><article className="letter card" aria-busy="true"><div className="lt-top">{pair}{close}</div>
      <div className="lt-body"><p className="lt-writing"><Dots /> Your agent is writing your letter</p><Shimmer w="80%" /><Shimmer w="60%" /><div className="sk-gap" /><Shimmer w="90%" /><Shimmer w="70%" /><Shimmer w="85%" /><p className="small">Usually under a minute. We’ll let you know if you leave.</p></div></article></Wrap>
  )
  const them = match.other.name
  if (!report) return ( // flagged or closed with no letter
    <Wrap mobile={mobile}><article className="letter card"><div className="lt-top">{pair}<StatusChip s={data.status === 'flagged_fake' ? 'flagged' : 'closed'} /><span className="private"><Lock size={14} strokeWidth={1.9} aria-hidden="true" />Private · only you see this</span>{close}</div>
      <div className="lt-body"><h1 className="lt-h">{data.status === 'flagged_fake' ? `Your agent thinks ${them}’s profile is fake.` : 'This conversation is closed.'}</h1>
        <p className="lt-sub">{data.status === 'flagged_fake' ? 'It stopped talking, and nothing more will be sent.' : 'Nothing more will be sent.'}</p>
        {data.status === 'flagged_fake' && (match.trust?.flags ?? []).length > 0 && <ul className="explore">{match.trust.flags.map((f) => <li key={f}><Flag size={16} strokeWidth={1.8} aria-hidden="true" /> {f}</li>)}</ul>}
      </div>
      <footer className="lt-foot"><div className="lt-act"><Btn size="lg" block={mobile} onClick={() => navigate('/matches')}>Back to matches</Btn></div></footer></article></Wrap>
  )

  const decided = match.decision
  const handedOff = match.status === 'handed_off'
  const run = (name, fn, after) => async () => {
    setBusy(name)
    try { const m = await fn(); after?.(m) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }
  const cont = run('continue', () => decide('continue'), (m) => toast(m.status === 'handed_off' ? `You and ${them} are chatting directly now` : `Saved. We’ll tell you when ${them} decides too.`))
  const pass = run('pass', () => decide('pass'), () => { toast('Passed, kindly. Your agent said goodbye for you.'); navigate('/matches') })
  const more = run('extend', extend, () => { toast('Your agents will talk a bit longer'); navigate(`/matches/${id}`) })

  const Ev = ({ x, tone }) => {
    const line = x.messageIds?.map((mid) => lineOf.get(String(mid))).find(Boolean)
    return x.quote && <figure className={`evq ${tone ?? ''}`}><blockquote>“{x.quote}”</blockquote><figcaption>{them}{line ? ` · message ${line}` : ''}<Link className="link" to={`/matches/${id}/replay`}>See in replay <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" /></Link></figcaption></figure>
  }
  const quoted = report.concerns.filter((c) => c.quote)
  const unknown = report.concerns.filter((c) => !c.quote)
  const mins = messages.length > 1 ? Math.max(1, Math.round((new Date(messages.at(-1).createdAt) - new Date(messages[0].createdAt)) / 60000)) : null
  const H = {
    compatible: [`You and ${them} seem compatible.`, `From your agent, after their first conversation: ${messages.length} messages${mins && mins < 120 ? ` over ${mins} minute${mins === 1 ? '' : 's'}` : ''}.`],
    maybe: [`There’s something here with ${them}. It needs a little longer.`, 'Your agents stopped before every question that matters to you. Here’s what’s promising, and what’s still open.'],
    incompatible: [`You and ${them} want different things, and that’s okay.`, 'Nothing went wrong. You were both honest, which is the point.'],
  }[verdict]

  const actions = verdict === 'incompatible' ? (
    <><Btn kind="secondary" size="lg" block={mobile} onClick={() => navigate('/matches')}>Okay, thank you</Btn>
      {!decided && <Btn kind="ghost" size="lg" block={mobile} onClick={cont} loading={busy === 'continue'}>Talk anyway</Btn>}
      {!mobile && <Link className="link push" to={`/matches/${id}/replay`}>View the transcript</Link>}</>
  ) : decided || handedOff ? (
    <><Btn size="lg" block={mobile} onClick={() => navigate(`/matches/${id}`)}>{handedOff ? `Chat with ${them}` : 'Back to the chat'}</Btn>{!mobile && <Link className="link push" to={`/matches/${id}/replay`}>Read the full conversation</Link>}</>
  ) : verdict === 'maybe' ? (
    <><Btn size="lg" block={mobile} icon={MessageCircleMore} onClick={more} loading={busy === 'extend'}>Let them talk a bit longer</Btn>
      <Btn kind="secondary" size="lg" block={mobile} onClick={cont} loading={busy === 'continue'}>I’ll take it from here</Btn>
      <Btn kind="ghost" size="lg" block={mobile} onClick={pass} loading={busy === 'pass'}>Pass, kindly</Btn></>
  ) : (
    <><Btn size="lg" block={mobile} onClick={cont} loading={busy === 'continue'}>Continue as myself</Btn>
      <Btn kind="secondary" size="lg" block={mobile} onClick={pass} loading={busy === 'pass'}>Pass</Btn>
      {!mobile && <Link className="link push" to={`/matches/${id}/replay`}>Read the full conversation</Link>}</>
  )

  return (
    <Wrap mobile={mobile}>
      <motion.article className={`letter card lv-${CHIP[verdict]}`} aria-labelledby="lt-h" initial={rm ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}>
        <div className="lt-top">{pair}<StatusChip s={CHIP[verdict]} /><span className="private"><Lock size={14} strokeWidth={1.9} aria-hidden="true" />Private · only you see this</span>{close}</div>
        <div className="lt-body">
          <div className="lt-hw" ref={head}>
            <h1 className="lt-h" id="lt-h">{H[0]}</h1>
            {verdict === 'compatible' && <svg className="lt-ul" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path data-draw d="M3 9 C 60 3, 120 12, 180 6 S 270 4, 297 8" /></svg>}
          </div>
          <p className="lt-sub">{report.summary || H[1]}</p>
          {verdict === 'compatible' && <>
            <h2 className="lt-sec">What clicked</h2>
            <ol className="clicked" ref={list}>{report.reasons.map((c, k) => <li key={k}><p className="ck-t"><Check size={18} strokeWidth={2} aria-hidden="true" />{c.text}</p><Ev x={c} /></li>)}</ol>
            {quoted.length > 0 && <><h2 className="lt-sec">Worth exploring</h2><ul className="explore">{quoted.map((c, k) => <li key={k}>{c.text}</li>)}</ul></>}
          </>}
          {verdict === 'maybe' && <>
            <h2 className="lt-sec">What’s promising</h2>
            {report.reasons.length ? <ol className="clicked" ref={list}>{report.reasons.map((c, k) => <li key={k}><p className="ck-t"><Check size={18} strokeWidth={2} aria-hidden="true" />{c.text}</p><Ev x={c} tone="ochre" /></li>)}</ol> : <p className="small">Nothing stood out yet, which is normal this early.</p>}
            {(quoted.length > 0 || unknown.length > 0) && <><h2 className="lt-sec">Still unclear</h2><ul className="explore q">{[...quoted, ...unknown].map((x, k) => <li key={k}><CircleHelp size={17} strokeWidth={1.8} aria-hidden="true" />{x.text}</li>)}</ul></>}
            <p className="why-stop"><Hourglass size={16} strokeWidth={1.8} aria-hidden="true" />Your agent needs a few more answers before it can say more.</p>
          </>}
          {verdict === 'incompatible' && <>
            <h2 className="lt-sec">Where you differ</h2>
            <ol className="clicked" ref={list}>{[...quoted, ...report.dealbreakerRisk.filter((d) => d.quote && !quoted.some((c) => c.quote === d.quote)).map((d) => ({ text: `Something that matters a lot to you: ${d.attribute.replace(/_/g, ' ')}.`, quote: d.quote }))].map((c, k) => <li key={k}><p className="ck-t plain">{c.text}</p><Ev x={c} tone="grey" /></li>)}</ol>
            <p className="kind">We won’t show you {them} again unless you ask. Your agent learned a little more about what matters to you.</p>
          </>}
          {verdict !== 'incompatible' && ((decided === 'continue' || handedOff) ? <DateIdeas matchId={id} icebreakers={report.icebreakers} />
            : report.icebreakers?.length > 0 && <><h2 className="lt-sec">If you both say yes</h2><ul className="explore">{report.icebreakers.map((t) => <li key={t}>{t}</li>)}</ul></>)}
        </div>
        <footer className="lt-foot">
          <div className="lt-act">{actions}</div>
          {!handedOff && <p className="lt-note small">{verdict === 'maybe' ? 'Up to 6 more messages, only about the open questions. ' : ''}{them} gets their own letter. Nothing changes unless you both choose to continue.</p>}
        </footer>
      </motion.article>
    </Wrap>
  )
}
