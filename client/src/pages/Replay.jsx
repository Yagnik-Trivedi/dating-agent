// Chat replay (plan 10): the whole agent conversation with MY chat moments as inline badges and the lines my judge
// cited highlighted. "I wouldn't say that" on my own agent's lines. Never the other side's moments or decision.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Btn, Drafted, ICON, Line } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { WouldntSay } from './MatchRoom'
import { api, errMsg } from '../lib/api'

const BADGE = { shared_interest: ['shared', 'You share this'], laugh: ['shared', 'A real laugh'], disagreement: ['', 'Disagreed'], disagreement_resolved: ['trust', 'Talked it through'], dealbreaker_hint: ['flag', 'Matters a lot to you'], question_dodged: ['', 'Didn’t answer'], warmth: ['trust', 'Warm'], interest_clash: ['', 'Different tastes'] }
const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function Replay() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const load = async () => {
    try {
      const { data: r } = await api.get(`/api/matches/${id}/report`)
      if (!r.report?.conversationId) return setError('There’s no finished conversation to replay yet.')
      const { data: rep } = await api.get(`/api/conversations/${r.report.conversationId}/replay`)
      setData(rep)
    } catch (err) { setError(errMsg(err)) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="page"><div className="st-center"><h2 className="t-h2">Nothing to replay</h2><p className="t-body muted">{error}</p><Link className="text-link" to={`/matches/${id}`}>Back to the chat</Link></div></div>
  if (!data) return <div className="page" aria-busy="true"><div className="sk sk-t" /><div className="sk sk-l" /><div className="sk sk-s" /></div>
  const me = String(user._id)
  const cited = new Set([...(data.report?.reasons ?? []), ...(data.report?.concerns ?? [])].flatMap((x) => x.messageIds ?? []).map(String))
  return (
    <div className="page replay">
      <header className="page-head"><div>
        <Link className="text-link" to={`/matches/${id}/report`}><ChevronLeft {...ICON} />Your agent’s read</Link>
        <h1 className="t-h1">The whole first conversation</h1>
        <p>Highlighted lines are the ones your agent quoted in its read. Badges are moments only you can see.</p></div>
        <Btn kind="secondary" onClick={load}>Refresh</Btn></header>
      <ol className="replay-list">
        {data.messages.map((m, i) => {
          const mine = String(m.senderId) === me
          const badges = [...new Set(data.events.filter((e) => String(e.messageId) === String(m._id)).map((e) => e.type))].map((t) => BADGE[t]).filter(Boolean)
          return (
            <li key={m._id} id={`line-${i + 1}`} className={`replay-row ${mine ? 'me' : 'them'} ${cited.has(String(m._id)) ? 'cited' : ''}`}>
              <div className="r-meta"><b>{mine ? (m.authoredBy === 'agent' ? 'Your agent' : 'You') : 'Them'}</b><span className="t-data">line {i + 1} · {time(m.createdAt)}</span>
                {badges.map(([tone, label]) => <span key={label} className={`pip ${tone}`}>{label}</span>)}</div>
              <p className="r-line"><Line text={m.text} /></p>
              {mine && m.authoredBy === 'agent' && <Drafted><WouldntSay messageId={m._id} /></Drafted>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
