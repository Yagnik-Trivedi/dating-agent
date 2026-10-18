// Matches (the design's match cards: photo, name, one calm line about where things stand).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Btn, EmptyNote, Thumb } from '../components/prelude'
import { useSocketEvent } from '../hooks/useSocket'
import { api, errMsg } from '../lib/api'

/** One plain line per state, from my side (never the other side's decision). */
export function stateLine(m) {
  switch (m.status) {
    case 'matched': case 'trust_check': return 'Your agent is checking their profile'
    case 'briefing': return 'Your agent is reading their profile'
    case 'scheduled': return 'Your agent starts this chat tomorrow'
    case 'agent_chatting': return m.paused ? 'Your agent is paused' : m.agentActive ? 'Agents chatting' : 'You’re chatting'
    case 'evaluating': return 'Your agent is writing its read'
    case 'compatible': return 'Your agent’s read is ready · you seem to get along'
    case 'maybe': return 'Your agent’s read is ready · a maybe'
    case 'incompatible': return 'Your agent’s read is ready'
    case 'handed_off': return 'You’re chatting'
    case 'flagged_fake': return 'Your agent thinks this profile is fake'
    case 'closed': return 'Closed'
    default: return ''
  }
}
const READ = ['compatible', 'maybe', 'incompatible']
const when = (d) => {
  const t = new Date(d)
  return Date.now() - t < 86_400_000 ? t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export default function Matches() {
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const load = () => api.get('/api/matches').then((r) => { setMatches(r.data.matches); setError(null) }).catch((e) => setError(errMsg(e)))
  useEffect(() => { load() }, [])
  useSocketEvent('match:new', ({ match }) => setMatches((m) => (m && !m.some((x) => x._id === match._id) ? [match, ...m] : m)))
  useSocketEvent('match:status', ({ matchId, status, agentActive }) => setMatches((m) => m?.map((x) => (String(x._id) === String(matchId) ? { ...x, status, agentActive } : x))))
  useSocketEvent('message:new', ({ message }) => setMatches((m) => m?.map((x) => (String(x._id) === String(message.matchId) ? { ...x, lastMessage: message, lastMessageAt: message.createdAt, unread: (x.unread ?? 0) + 1 } : x))))

  return (
    <div className="page">
      <header className="page-head"><div><h1 className="t-h1">Matches</h1><p>People you both said yes to. Your agent has the first conversation; you can read along and step in whenever you like.</p></div></header>
      {error ? (
        <div className="st-center"><h2 className="t-h2">We couldn’t load your matches</h2><p className="t-body muted">{error}</p><Btn kind="secondary" onClick={load}>Try again</Btn></div>
      ) : !matches ? (
        <ul className="m-list" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="m-card"><div className="sk" style={{ width: 52, height: 64 }} /><div style={{ flex: 1, display: 'grid', gap: 8 }}><div className="sk sk-l" /><div className="sk sk-s" /></div></li>)}</ul>
      ) : !matches.length ? (
        <EmptyNote title="No matches yet" action={<Link className="text-link" to="/discover">See today’s introductions</Link>}>When you and someone both say yes, they’ll appear here and your agent will say hello for you.</EmptyNote>
      ) : (
        <ul className="m-list">
          {matches.map((m) => (
            <li key={m._id}>
              <Link className={`m-card ${m.unread ? 'unread' : ''}`} to={READ.includes(m.status) ? `/matches/${m._id}/report` : `/matches/${m._id}`}>
                <Thumb src={m.other.photo} name={m.other.name} size={52} clear={m.status === 'handed_off'} />
                <span className="m-body">
                  <span className="m-top"><b>{m.other.name}</b><span className="t-data">{when(m.lastMessageAt ?? m.createdAt)}</span></span>
                  <span className={`m-state s-${m.status}`}>{stateLine(m)}</span>
                  {m.lastMessage && <span className="m-last">{m.lastMessage.text}</span>}
                </span>
                {m.unread > 0 && <i className="m-dot" aria-label={`${m.unread} unread`} />}
                <ChevronRight size={18} strokeWidth={1.6} aria-hidden="true" className="m-chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
