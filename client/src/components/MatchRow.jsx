// One match in a list (Round 7 Step 2 People.jsx MatchRow): avatar with a live dot while agents talk, name + time,
// status chip, last line, unread count. Letters (compatible / maybe / not) open the letter, everything else the room.
import { Link } from 'react-router-dom'
import { Avatar, StatusChip, chipOf } from './r7'

const LETTERS = ['compatible', 'maybe', 'incompatible']
const when = (d) => {
  if (!d) return ''
  const t = new Date(d)
  return Date.now() - t < 86_400_000 ? t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : t.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
/** One plain line from my side (never the other side's decision). */
export function stateLine(m) {
  if (LETTERS.includes(m.status)) return 'Your letter is ready'
  return {
    matched: 'Your agent is getting ready', trust_check: 'Your agent is checking their profile', briefing: 'Your agent is reading their profile',
    scheduled: 'Your agent starts this chat tomorrow', evaluating: 'Your agent is writing your letter', flagged_fake: 'Your agent thinks this profile is fake', closed: 'Closed',
  }[m.status] ?? null
}
export const hrefOf = (m) => (LETTERS.includes(m.status) ? `/matches/${m._id}/report` : `/matches/${m._id}`)

export default function MatchRow({ m, on }) {
  const live = m.status === 'agent_chatting'
  const last = m.lastMessage?.text ?? stateLine(m) ?? 'No messages yet'
  return (
    <li className={`mrow ${on ? 'on' : ''}`}>
      <Link to={hrefOf(m)} className="mrow-link" aria-current={on ? 'page' : undefined}>
        <span className="mav"><Avatar p={m.other} src={m.other.photo ?? undefined} size={52} />{live && <i className="live-dot" aria-label="Agents are talking now" />}</span>
        <div className="mtx"><div className="mt-top"><b>{m.other.name}</b><span className="mtime">{when(m.lastMessageAt ?? m.createdAt)}</span></div><StatusChip s={chipOf(m.status)} live={live} /><span className={`mlast ${m.unread ? 'strong' : ''}`}>{LETTERS.includes(m.status) ? 'Your letter is ready' : last}</span></div>
        {m.unread > 0 && <span className="unread" aria-label={`${m.unread} unread`}>{m.unread}</span>}
      </Link>
    </li>
  )
}
