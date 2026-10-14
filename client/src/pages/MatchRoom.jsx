import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import KgGraph from '../components/KgGraph'
import { AgentIcon, Avatar, Badge, Button, ErrorBox, Loading, ProgressBar, StatusBadge, TypingDots } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useMatch } from '../hooks/useMatch'
import { useToast } from '../hooks/useToast'
import { errMsg } from '../lib/api'
import { factsToGraph } from '../lib/kg'
import { VERDICT } from '../lib/status'

const AGENT_PHASES = ['matched', 'trust_check', 'briefing', 'agent_chatting', 'evaluating']
const LOCKED = ['closed', 'flagged_fake']
const TRUST = { ok: { label: 'Looks genuine', tone: 'good' }, caution: { label: 'Some caution', tone: 'warn' }, likely_fake: { label: 'Likely fake', tone: 'bad' } }
const AGENDA_PROGRESS = { open: 0, partially: 0.5, answered: 1 }

function Bubble({ m, mine, otherName, animate }) {
  const agent = m.authoredBy === 'agent'
  return (
    <li className={`${animate ? 'animate-rise ' : ''}flex flex-col ${mine ? 'items-end' : 'items-start'}`} data-message-id={m._id}>
      <p className={`max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-2xl px-4 py-2.5 sm:max-w-[75%] ${
        mine
          ? agent ? 'rounded-br-md border border-agent/30 bg-agent-soft text-ink' : 'rounded-br-md bg-accent text-accent-ink'
          : 'rounded-bl-md bg-surface-2'
      }`}>
        {m.text}
      </p>
      {agent && (
        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-agent">
          <AgentIcon className="size-3.5" /> {mine ? 'sent by your agent' : `${otherName}’s agent`}
        </span>
      )}
    </li>
  )
}

function Chat({ match, messages, me, typingUserId, onSend, onTakeover, sendTyping, agentMode }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [takingOver, setTakingOver] = useState(false)
  const bottom = useRef(null)
  const otherName = match.other.name
  const agentOn = match.agentActive && AGENT_PHASES.includes(match.status)
  const locked = LOCKED.includes(match.status)
  const inputDisabled = agentOn || locked

  const initialCount = useRef(null) // messages present on first load render without the rise animation
  if (initialCount.current === null && messages.length) initialCount.current = messages.length
  const scrolledOnce = useRef(false)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: scrolledOnce.current ? 'smooth' : 'auto', block: 'end' })
    scrolledOnce.current = messages.length > 0
  }, [messages.length, typingUserId])

  // Reveal after handoff: everything up to the last agent message was agent-handled.
  const revealAt = match.status === 'handed_off' ? messages.findLastIndex((m) => m.authoredBy === 'agent') : -1

  async function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    try {
      await onSend(text)
      setText('')
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setSending(false)
    }
  }

  async function takeover() {
    setTakingOver(true)
    try {
      await onTakeover()
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setTakingOver(false)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-3xl border border-line bg-surface" aria-label="Chat">
      {agentOn && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-3xl border-b border-agent/20 bg-agent-soft px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-agent">
            <AgentIcon className="size-6" />
            {match.status === 'agent_chatting' ? `Your agent is chatting (${agentMode} mode)` : match.status === 'evaluating' ? 'Your agent is writing its verdict…' : 'Your agent is checking their profile…'}
          </p>
          <Button variant="agent" onClick={takeover} loading={takingOver}>Take over</Button>
        </div>
      )}
      {match.status === 'flagged_fake' && (
        <div role="alert" className="rounded-t-3xl border-b border-bad/20 bg-bad/10 px-4 py-3 text-sm font-medium text-bad">
          Your agent flagged this profile and stopped. See the trust check for why.
        </div>
      )}
      {match.report && VERDICT[match.report.verdict] && (
        <Link to={`/matches/${match._id}/report`} className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 text-sm font-semibold hover:brightness-95">
          <span>{VERDICT[match.report.verdict].headline}</span>
          <span className="text-accent">View report →</span>
        </Link>
      )}

      <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="Messages">
        {messages.length === 0 && <li className="py-10 text-center text-sm text-muted">{agentOn ? 'Your agent will open the conversation shortly.' : 'Say hi 👋'}</li>}
        {messages.map((m, i) => (
          <Fragment key={m._id}>
            <Bubble m={m} mine={String(m.senderId) === String(me)} otherName={otherName} animate={i >= initialCount.current} />
            {i === revealAt && (
              <li className="my-5 flex items-center gap-3 text-center text-xs font-semibold text-agent" role="note">
                <span className="h-px flex-1 bg-agent/30" />
                <span className="max-w-xs">The first {i + 1} messages were handled by your agents. From here on it’s just you two.</span>
                <span className="h-px flex-1 bg-agent/30" />
              </li>
            )}
          </Fragment>
        ))}
        {typingUserId && (
          <li className={`flex items-center gap-2 text-xs ${String(typingUserId) === String(me) ? 'justify-end text-agent' : 'text-muted'}`}>
            {String(typingUserId) === String(me) ? <><AgentIcon className="size-4" /> Your agent is typing</> : `${otherName} is typing`} <TypingDots />
          </li>
        )}
        <li ref={bottom} aria-hidden="true" />
      </ol>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
        <label htmlFor="msg" className="sr-only">Message</label>
        <textarea
          id="msg"
          rows={1}
          value={text}
          maxLength={1000}
          disabled={inputDisabled}
          onChange={(e) => { setText(e.target.value); sendTyping() }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e) }}
          placeholder={agentOn ? 'Take over to type' : locked ? 'This conversation is closed' : 'Write a message…'}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-bg px-4 py-2.5 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 field-sizing-content"
        />
        <Button type="submit" disabled={inputDisabled || !text.trim()} loading={sending} aria-label="Send">Send</Button>
      </form>
    </section>
  )
}

function BriefPanel({ match }) {
  const { trust, brief } = match
  const t = trust && TRUST[trust.level]
  return (
    <section className="space-y-4" aria-label="Trust check and brief">
      <div className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Trust check</h2>
        {!trust ? (
          <p className="flex items-center gap-2 text-sm text-muted"><TypingDots /> Checking profile…</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={t?.tone}>{t?.label ?? trust.level}</Badge>
              {trust.score != null && <span className="text-sm text-muted">{trust.score}/100</span>}
            </div>
            {trust.flags?.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">{trust.flags.map((f) => <li key={f} className="text-bad">⚑ {f}</li>)}</ul>
            )}
            {trust.contradictions?.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {trust.contradictions.map((c, i) => (
                  <li key={i} className="rounded-xl bg-surface-2 p-2.5">
                    <p className="font-medium">{c.topic}: to clarify gently</p>
                    <p className="mt-0.5 text-muted">{c.a} vs <q>{c.b.replace(/^"|"$/g, '')}</q></p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Your agent’s brief</h2>
        {!brief ? (
          <p className="flex items-center gap-2 text-sm text-muted"><TypingDots /> Reading their profile…</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{brief.summary}</p>
            {brief.overlaps?.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Things in common">
                {brief.overlaps.map((o) => <li key={typeof o === 'string' ? o : o.topic} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">{typeof o === 'string' ? o : o.topic}</li>)}
              </ul>
            )}
            {brief.earlyDealbreaker && <p className="mt-3 rounded-xl bg-bad/10 p-2.5 text-sm text-bad">Early dealbreaker: {brief.earlyDealbreaker.why ?? String(brief.earlyDealbreaker)}</p>}
          </>
        )}
      </div>

      {brief?.agenda?.length > 0 && (
        <div className="rounded-3xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">What to find out</h2>
          <ul className="space-y-2">
            {brief.agenda.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  a.status === 'answered' ? 'bg-good text-white' : a.status === 'partially' ? 'bg-warn/20 text-warn' : 'border border-line'
                }`} aria-hidden="true">{a.status === 'answered' ? '✓' : a.status === 'partially' ? '½' : ''}</span>
                <span className={a.status === 'answered' ? 'text-muted line-through decoration-muted/40' : ''}>{a.topic}</span>
                <span className="sr-only">({a.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function LearningPanel({ match, facts }) {
  const graph = useMemo(() => factsToGraph(facts, match.other.name), [facts, match.other.name])
  const agenda = match.brief?.agenda ?? []
  return (
    <section className="space-y-4" aria-label="What your agent is learning">
      <div className="rounded-3xl border border-line bg-surface p-3">
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">What we’re learning</h2>
        <KgGraph data={graph} height={300} label={`What your agent has learned about ${match.other.name}`} />
        <p className="mt-2 px-1 text-xs text-muted">Bigger = matters more · brighter = more certain</p>
      </div>
      {agenda.length > 0 && (
        <div className="rounded-3xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Confidence by topic</h2>
          <ul className="space-y-3">
            {agenda.map((a) => (
              <li key={a.id}>
                <p className="mb-1 text-sm">{a.topic}</p>
                <ProgressBar value={a.confidence ?? AGENDA_PROGRESS[a.status] ?? 0} tone="agent" label={`Confidence: ${a.topic}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'brief', label: 'Brief' },
  { id: 'learning', label: 'Learning' },
]

export default function MatchRoom() {
  const { id } = useParams()
  const { user } = useAuth()
  const { match, messages, facts, typingUserId, error, reload, send, takeover, sendTyping } = useMatch(id)
  const [tab, setTab] = useState('chat')

  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!match) return <Loading label="Opening match…" />

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-128 flex-col gap-3 md:h-[calc(100dvh-7.5rem)]">
      <div className="flex items-center gap-3">
        <Link to="/matches" className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Back to matches">
          <svg className="size-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M12.7 4.3a1 1 0 0 1 0 1.4L8.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0z" /></svg>
        </Link>
        <Avatar src={match.other.photo} name={match.other.name} className="size-10" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{match.other.name}{match.other.age && <span className="font-normal text-muted">, {match.other.age}</span>}</h1>
          <StatusBadge status={match.status} agentActive={match.agentActive} />
        </div>
        {match.report && <Link to={`/matches/${match._id}/report`}><Button variant="secondary" size="sm">Report</Button></Link>}
      </div>

      <div role="tablist" aria-label="Match panels" className="grid grid-cols-3 rounded-full border border-line bg-surface-2 p-0.5 lg:hidden">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded-full py-1.5 text-sm font-semibold ${tab === t.id ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>{t.label}</button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[17rem_1fr_21rem]">
        <div className={`${tab === 'brief' ? 'block' : 'hidden'} min-h-0 overflow-y-auto lg:block`}><BriefPanel match={match} /></div>
        <div className={`${tab === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-col lg:flex`}>
          <Chat match={match} messages={messages} me={user._id} typingUserId={typingUserId} onSend={send} onTakeover={takeover} sendTyping={sendTyping} agentMode={user.agentMode} />
        </div>
        <div className={`${tab === 'learning' ? 'block' : 'hidden'} min-h-0 overflow-y-auto lg:block`}><LearningPanel match={match} facts={facts} /></div>
      </div>
    </div>
  )
}
