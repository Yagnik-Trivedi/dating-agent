import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgentIcon, Avatar, Badge, Button, Card, EmptyState, ErrorBox, Loading, ProgressBar } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useMatch } from '../hooks/useMatch'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { VERDICT } from '../lib/status'

const DIMENSIONS = {
  valuesGoals: 'Values & goals',
  lifestyle: 'Lifestyle',
  interests: 'Interests',
  communication: 'Communication',
  personality: 'Personality',
  chemistry: 'Chemistry',
}
const confidenceWord = (c) => (c == null ? '' : c >= 0.7 ? 'high confidence' : c >= 0.45 ? 'medium confidence' : 'low confidence')
const asDim = (d) => (typeof d === 'number' ? { score: d } : d ?? {})

function Receipts({ open, onClose, messages, highlight, me }) {
  const list = useRef(null)
  useEffect(() => {
    if (!open || !highlight.length) return
    const el = list.current?.querySelector(`[data-message-id="${CSS.escape(highlight[0])}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [open, highlight])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="animate-rise flex h-full w-full max-w-md flex-col border-l border-line bg-surface" onClick={(e) => e.stopPropagation()} aria-label="Conversation receipts">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">Receipts</h2>
          <Button variant="ghost" size="sm" onClick={onClose} autoFocus>Close</Button>
        </div>
        <ol ref={list} className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.map((m) => {
            const mine = String(m.senderId) === String(me)
            const hit = highlight.includes(m._id)
            return (
              <li key={m._id} data-message-id={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <p className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-accent-soft' : 'bg-surface-2'} ${hit ? 'animate-flash ring-2 ring-accent' : hit === false && highlight.length ? 'opacity-50' : ''}`}>
                  {m.text}
                </p>
              </li>
            )
          })}
        </ol>
      </aside>
    </div>
  )
}

function DateIdeas({ matchId, fallbackIcebreakers }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    api.get(`/api/matches/${matchId}/date-ideas`)
      .then((r) => setState(r.data))
      .catch((err) => setState({ error: err.response?.status === 503 ? 'Date ideas are switched off on this server right now.' : errMsg(err) }))
  }, [matchId])
  const icebreakers = state.icebreakers ?? fallbackIcebreakers ?? []
  return (
    <Card className="space-y-4">
      <h2 className="font-display text-xl font-semibold">Date ideas</h2>
      {state.loading && <p className="text-sm text-muted">Finding spots you’d both like…</p>}
      {state.error && <p className="text-sm text-muted">{state.error}</p>}
      {state.ideas && (
        <ul className="space-y-3">
          {state.ideas.map((i) => (
            <li key={i.title} className="rounded-2xl bg-surface-2 p-4">
              <a href={i.link} target="_blank" rel="noreferrer" className="font-semibold text-accent underline-offset-2 hover:underline">{i.title}</a>
              <p className="mt-1 text-sm text-muted">{i.why}</p>
            </li>
          ))}
        </ul>
      )}
      {icebreakers.length > 0 && (
        <>
          <h3 className="font-semibold">Icebreakers</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">{icebreakers.map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
    </Card>
  )
}

export default function Report() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const { match, messages, error, reload, decide } = useMatch(id)
  const [highlight, setHighlight] = useState([])
  const [drawer, setDrawer] = useState(false)
  const [busy, setBusy] = useState(null)

  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!match) return <Loading label="Loading report…" />

  const report = match.report
  if (!report) {
    return (
      <EmptyState title="No verdict yet" action={<Link to={`/matches/${id}`}><Button variant="secondary">Back to the chat</Button></Link>}>
        Your agent writes its report once it has learned enough. You’ll get a notification.
      </EmptyState>
    )
  }

  const v = VERDICT[report.verdict] ?? { label: report.verdict, tone: 'muted', headline: '' }
  const dims = Object.entries(DIMENSIONS)
    .map(([key, label]) => [label, key === 'chemistry' && report.chemistry != null ? { score: report.chemistry } : asDim(report.dimensions?.[key])])
    .filter(([, d]) => d.score != null)
  const showReceipts = (ids) => { setHighlight(ids ?? []); setDrawer(true) }
  const decided = match.decision
  const handedOff = match.status === 'handed_off'

  async function choose(decision) {
    setBusy(decision)
    try {
      const m = await decide(decision)
      toast(m.status === 'handed_off' ? 'It’s just you two now 🎉' : decision === 'pass' ? 'Got it. Your agent will wind things down kindly.' : `Waiting for ${match.other.name} to decide too`)
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setBusy(null)
    }
  }

  const Item = ({ item, icon, tone }) => (
    <li>
      <button onClick={() => showReceipts(item.messageIds)} className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-surface-2">
        <span className={`mt-0.5 font-bold ${tone}`} aria-hidden="true">{icon}</span>
        <span className="flex-1">{item.text}</span>
        {item.messageIds?.length > 0 && <span className="shrink-0 text-xs font-semibold text-accent">{item.messageIds.length} receipt{item.messageIds.length > 1 ? 's' : ''}</span>}
      </button>
    </li>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={`/matches/${id}`} className="text-sm font-semibold text-muted hover:text-ink">← Back to chat</Link>

      <Card className="text-center">
        <Avatar src={match.other.photo} name={match.other.name} className="mx-auto size-16" />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-agent"><AgentIcon /> Your agent’s verdict on {match.other.name}</p>
        <Badge tone={v.tone} size="lg" className="mt-3">{v.label}</Badge>
        <h1 className="mt-3 font-display text-2xl font-semibold">{v.headline}</h1>
        <p className="mx-auto mt-2 max-w-xl text-muted">{report.summary}</p>
      </Card>

      {dims.length > 0 && (
        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold">How you line up</h2>
          <ul className="space-y-3.5">
            {dims.map(([label, d]) => (
              <li key={label}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted">{confidenceWord(d.confidence)}</span></div>
                <ProgressBar value={d.score} tone={d.score >= 0.7 ? 'good' : 'accent'} label={label} />
              </li>
            ))}
          </ul>
          {report.dimensions?.dealbreakers && asDim(report.dimensions.dealbreakers).score === 0 && (
            <p className="mt-4 rounded-xl bg-bad/10 p-3 text-sm font-medium text-bad">One of your dealbreakers came up.</p>
          )}
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-display text-xl font-semibold">Why</h2>
          {report.reasons?.length ? <ul className="-mx-3">{report.reasons.map((r) => <Item key={r.text} item={r} icon="✓" tone="text-good" />)}</ul> : <p className="text-sm text-muted">Nothing to point to yet: the conversation ended before it really started.</p>}
        </Card>
        <Card>
          <h2 className="mb-2 font-display text-xl font-semibold">Worth noting</h2>
          {report.concerns?.length ? <ul className="-mx-3">{report.concerns.map((c) => <Item key={c.text} item={c} icon="⚠" tone="text-warn" />)}</ul> : <p className="text-sm text-muted">Nothing stood out.</p>}
        </Card>
      </div>

      {report.askYourself?.length > 0 && (
        <Card>
          <h2 className="mb-3 font-display text-xl font-semibold">Ask yourself</h2>
          <ul className="space-y-2">{report.askYourself.map((q) => <li key={q} className="rounded-2xl bg-surface-2 px-4 py-3">{q}</li>)}</ul>
        </Card>
      )}

      <Card className="space-y-3">
        {handedOff ? (
          <>
            <p className="font-semibold">You’re both in. The chat is all yours now.</p>
            <Link to={`/matches/${id}`}><Button>Open chat</Button></Link>
          </>
        ) : report.verdict === 'incompatible' ? (
          <>
            <p className="text-sm text-muted">Your agent will close this kindly. Disagree? You can still talk yourself.</p>
            <Button variant="secondary" onClick={() => choose('continue')} loading={busy === 'continue'} disabled={decided === 'continue'}>
              {decided === 'continue' ? 'Reopened, waiting for them' : 'Talk anyway'}
            </Button>
          </>
        ) : decided === 'continue' ? (
          <p className="font-semibold">You chose to continue. Waiting for {match.other.name}…</p>
        ) : decided === 'pass' ? (
          <p className="text-muted">You passed on this match.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => choose('continue')} loading={busy === 'continue'} disabled={Boolean(busy)}>Continue as myself</Button>
            <Button size="lg" variant="secondary" onClick={() => choose('pass')} loading={busy === 'pass'} disabled={Boolean(busy)}>Pass</Button>
          </div>
        )}
      </Card>

      {(decided === 'continue' || handedOff) && report.verdict !== 'incompatible' && <DateIdeas matchId={id} fallbackIcebreakers={report.icebreakers} />}

      <Receipts open={drawer} onClose={() => setDrawer(false)} messages={messages} highlight={highlight} me={user._id} />
    </div>
  )
}
