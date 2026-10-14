import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Button, EmptyState, ErrorBox, Loading, StatusBadge } from '../components/ui'
import { useSocketEvent } from '../hooks/useSocket'
import { api, errMsg } from '../lib/api'

const when = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Matches() {
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api.get('/api/matches').then((r) => { setMatches(r.data.matches); setError(null) }).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])

  useSocketEvent('match:new', ({ match }) => setMatches((m) => (m && !m.some((x) => x._id === match._id) ? [match, ...m] : m)))
  useSocketEvent('match:status', ({ matchId, status, agentActive }) => setMatches((m) => m?.map((x) => (String(x._id) === String(matchId) ? { ...x, status, agentActive } : x))))
  useSocketEvent('message:new', ({ message }) => setMatches((m) => m?.map((x) => (String(x._id) === String(message.matchId)
    ? { ...x, lastMessage: message, lastMessageAt: message.createdAt, unread: x.unread + (String(message.senderId) === String(x.other.userId) ? 1 : 0) }
    : x)).sort((a, b) => new Date(b.lastMessageAt ?? b.createdAt) - new Date(a.lastMessageAt ?? a.createdAt))))

  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!matches) return <Loading label="Loading matches…" />

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 font-display text-3xl font-semibold">Matches</h1>
      {matches.length === 0 ? (
        <EmptyState title="No matches yet" action={<Link to="/discover"><Button>Discover people</Button></Link>}>
          When you and someone like each other, your agent starts with a trust check and takes it from there.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {matches.map((m) => (
            <li key={m._id}>
              <Link to={`/matches/${m._id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2">
                <Avatar src={m.other.photo} name={m.other.name} className="size-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{m.other.name}</span>
                    <span className="shrink-0 text-xs text-muted">{when(m.lastMessageAt ?? m.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={`min-w-0 flex-1 truncate text-sm ${m.unread ? 'font-semibold text-ink' : 'text-muted'}`}>
                      {m.lastMessage ? m.lastMessage.text : 'No messages yet'}
                    </p>
                    {m.unread > 0 && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label={`${m.unread} unread`} />}
                  </div>
                  <div className="mt-1.5"><StatusBadge status={m.status} agentActive={m.agentActive} /></div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
