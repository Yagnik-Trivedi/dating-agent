// Verdict (owner's design: screens/Verdict.jsx), from MY judge's decision only — never the other side's.
// Compatible and Not compatible follow the design; Maybe gets its own hopeful copy (plan 10) with "Let them talk a bit
// longer". Every point quotes their words and links to the line. Date ideas (Tavily, scarce) only after Continue.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Eye, Lock, MessageSquareText, X } from 'lucide-react'
import { Btn, ICON, Reveal, Thumb, useMobile } from '../components/prelude'
import { useMatch } from '../hooks/useMatch'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

function DateIdeas({ matchId, icebreakers }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    api.get(`/api/matches/${matchId}/date-ideas`)
      .then(({ data }) => setState(data))
      .catch((err) => setState({ error: err.response?.data?.error?.code === 'DATE_IDEAS_UNAVAILABLE' ? err.response.data.error.message : errMsg(err) }))
  }, [matchId])
  const breakers = state.icebreakers?.length ? state.icebreakers : icebreakers
  return (
    <>
      {breakers?.length > 0 && <div className="v-sec"><h3 className="t-h3">Something to open with</h3><ul className="v-list">{breakers.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      <div className="v-sec"><h3 className="t-h3">Ideas for a first date</h3>
        {state.loading ? <div className="sk sk-l" /> : state.error ? <p className="small">{state.error}</p>
          : <ul className="v-list">{state.ideas.map((i) => <li key={i.link}><a className="text-link" href={i.link} target="_blank" rel="noreferrer">{i.title}</a>{i.why && <span className="small"> · {i.why}</span>}</li>)}</ul>}
      </div>
    </>
  )
}

export default function Report() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mobile = useMobile(1100)
  const toast = useToast()
  const { match, messages, decide, extend } = useMatch(id)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = () => api.get(`/api/matches/${id}/report`).then(({ data: d }) => setData(d)).catch((err) => setError(errMsg(err)))
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const lineOf = useMemo(() => new Map(messages.map((m, i) => [String(m._id), i + 1])), [messages])

  const report = data?.report
  if (error) return <div className="scr state err"><div className="st-center"><h2 className="t-h2">We couldn’t load your agent’s read</h2><p className="t-body muted">{error}</p><Btn kind="secondary" onClick={load}>Try again</Btn></div></div>
  if (!data || !match) return <Loading mobile={mobile} />
  if (!report) return <Loading mobile={mobile} waiting />

  const them = match.other.name
  const decided = match.decision
  const handedOff = match.status === 'handed_off'
  const verdict = report.verdict
  const item = (x, k) => {
    const line = x.messageIds?.map((mid) => lineOf.get(String(mid))).find(Boolean)
    return <div className="v-item" key={k}><p>{x.text}</p>{x.quote && <blockquote>“{x.quote}”{line && <Link className="lref" to={`/matches/${id}#line-${line}`}>line {line}</Link>}</blockquote>}</div>
  }
  const quoted = report.concerns.filter((c) => c.quote)
  const unknown = report.concerns.filter((c) => !c.quote)
  const run = (name, fn, after) => async () => {
    setBusy(name)
    try { const m = await fn(); after?.(m) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(null) }
  }
  const cont = run('continue', () => decide('continue'), (m) => toast(m.status === 'handed_off' ? `You and ${them} are chatting directly now` : `Saved. We’ll tell you when ${them} decides too.`))
  const pass = run('pass', () => decide('pass'), () => { toast('Passed, kindly. Your agent said goodbye for you.'); navigate('/matches') })
  const more = run('extend', extend, () => { toast('Your agents will talk a bit longer'); navigate(`/matches/${id}`) })

  const head = {
    compatible: [`You and ${them} seem to get along.`, 'Here’s why, in their own words.'],
    maybe: [`You and ${them} might get along.`, 'Some things clicked, and a few are still unclear. That’s normal this early.'],
    incompatible: [`You and ${them} want different things, and that’s okay.`, 'Nothing went wrong here. You were both honest, which is exactly the point.'],
  }[verdict]

  const actions = verdict === 'incompatible' ? (
    <>
      <Btn size="lg" block={mobile} onClick={() => navigate('/matches')}>Okay, thank you</Btn>
      {!decided && <Btn kind="secondary" size="lg" block={mobile} onClick={cont} loading={busy === 'continue'}>Talk anyway</Btn>}
      <Link className={`text-link ${mobile ? 'center' : 'push'}`} to={`/matches/${id}`}>Read the chat</Link>
    </>
  ) : decided || handedOff ? (
    <><Btn size="lg" block={mobile} onClick={() => navigate(`/matches/${id}`)}>{handedOff ? `Chat with ${them}` : 'Back to the chat'}</Btn><Link className={`text-link ${mobile ? 'center' : 'push'}`} to={`/matches/${id}`}>Read the whole chat</Link></>
  ) : verdict === 'maybe' ? (
    <>
      <Btn size="lg" block={mobile} onClick={more} loading={busy === 'extend'}>Let them talk a bit longer</Btn>
      <Btn kind="secondary" size="lg" block={mobile} onClick={cont} loading={busy === 'continue'}>I’ll take it from here</Btn>
      <Btn kind="secondary" size="lg" block={mobile} onClick={pass} loading={busy === 'pass'}>Pass, kindly</Btn>
    </>
  ) : (
    <>
      <Btn size="lg" block={mobile} onClick={cont} loading={busy === 'continue'}>Continue as myself</Btn>
      <Btn kind="secondary" size="lg" block={mobile} onClick={pass} loading={busy === 'pass'}>Pass, kindly</Btn>
      {!mobile && <Link className="text-link push" to={`/matches/${id}`}>Read the whole chat</Link>}
    </>
  )

  return (
    <div className={`scr verdict ${mobile ? 'm' : 'd'}`}>
      {mobile && <header className="v-top"><button className="icon-btn" aria-label="Close" onClick={() => navigate(`/matches/${id}`)}><X {...ICON} /></button><span>Your agent’s read</span><span style={{ width: 44 }} /></header>}
      <Reveal className="v-card"><div className="v-inner" style={{ width: mobile ? 'auto' : verdict === 'incompatible' ? 620 : 920 }}>
        <div className="v-scroll">
          <div className="v-who"><Thumb src={match.other.photo} name={them} size={40} clear={handedOff} /><div><b>{[them, match.other.age].filter(Boolean).join(', ')}</b><span>{match.other.city}</span></div></div>
          <Reveal i={0}><p className="v-eyebrow"><Eye size={15} strokeWidth={1.7} aria-hidden="true" />Your agent’s read · only you can see this</p>
            <h1 className="t-h1">{head[0]}</h1><p className="v-sub">{report.summary || head[1]}</p></Reveal>
          {verdict === 'incompatible' ? (
            <>
              <Reveal i={1} className="v-sec"><h3 className="t-h3">Where you differ</h3>
                {[...quoted, ...report.dealbreakerRisk.filter((d) => d.quote && !quoted.some((c) => c.quote === d.quote)).map((d) => ({ text: `Something that matters a lot to you: ${d.attribute.replace(/_/g, ' ')}.`, quote: d.quote }))].map(item)}</Reveal>
              <Reveal i={2}><p className="v-signoff">We won’t show you {them} again unless you ask. Your agent learned a little more about what matters to you. Thank you for being open.</p></Reveal>
            </>
          ) : (
            <div className="v-cols">
              <Reveal i={1} className="v-sec clicked"><h3 className="t-h3">{verdict === 'maybe' ? 'What’s promising' : 'What clicked'}</h3>{report.reasons.length ? report.reasons.map(item) : <p className="small">Nothing stood out yet.</p>}</Reveal>
              <div>
                {quoted.length > 0 && <Reveal i={2} className="v-sec explore"><h3 className="t-h3">{verdict === 'maybe' ? 'Still unclear' : 'Worth talking about'}</h3>{quoted.map(item)}</Reveal>}
                {unknown.length > 0 && <Reveal i={3} className="v-sec"><h3 className="t-h3">Not known yet</h3><ul className="v-list">{unknown.map((u) => <li key={u.text}>{u.text}</li>)}</ul></Reveal>}
                {(decided === 'continue' || handedOff)
                  ? <Reveal i={4}><DateIdeas matchId={id} icebreakers={report.icebreakers} /></Reveal>
                  : report.icebreakers?.length > 0 && <Reveal i={4} className="v-sec"><h3 className="t-h3">If you both say yes</h3><ul className="v-list">{report.icebreakers.map((t) => <li key={t}>{t}</li>)}</ul></Reveal>}
              </div>
            </div>
          )}
        </div>
        {mobile && verdict !== 'incompatible' && !handedOff && <p className="v-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" />{them}’s agent decides for {them} separately. Nothing is shared until you both say yes.</p>}
        <Reveal i={5} className="v-actions">{actions}</Reveal>
        {!mobile && verdict !== 'incompatible' && !handedOff && <p className="v-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" />{them}’s agent decides for {them} separately. Nothing is shared until you both say yes.</p>}
      </div></Reveal>
    </div>
  )
}

/** The design's loading state: a soft skeleton while the read is written. */
function Loading({ mobile, waiting }) {
  return (
    <div className={`scr verdict ${mobile ? 'm' : 'd'} state`}>
      <div className="v-card"><div className="v-inner" style={{ width: mobile ? 'auto' : 620 }}><div className="st-body" aria-busy="true">
        <p className="small muted"><MessageSquareText size={14} strokeWidth={1.7} aria-hidden="true" /> {waiting ? 'Your agent is writing its read. This usually takes under a minute.' : 'Loading…'}</p>
        <div className="sk sk-t" /><div className="sk sk-t2" />
        {[0, 1, 2].map((i) => <div key={i} className="sk-item"><div className="sk sk-l" /><div className="sk sk-s" /></div>)}
      </div></div></div>
    </div>
  )
}
