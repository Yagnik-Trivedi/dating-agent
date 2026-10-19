// Matches (Round 7 Step 2 design, People.jsx Matches): search, sliding tabs (All · Letters · Chats), match rows with
// status chips and a live dot while agents talk. Kept live over the socket.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, RefreshCw, Search } from 'lucide-react'
import { Btn, Empty, Shell, Shimmer, Tabs } from '../components/r7'
import MatchRow from '../components/MatchRow'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useSocketEvent } from '../hooks/useSocket'
import { api, errMsg } from '../lib/api'

const LETTERS = ['compatible', 'maybe', 'incompatible']
const CHATS = ['handed_off']

export default function Matches() {
  const mobile = useMobile()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const load = () => api.get('/api/matches').then((r) => { setMatches(r.data.matches); setError(null) }).catch((e) => setError(errMsg(e)))
  useEffect(() => { load() }, [])
  useSocketEvent('match:new', ({ match }) => setMatches((m) => (m && !m.some((x) => x._id === match._id) ? [match, ...m] : m)))
  useSocketEvent('match:status', ({ matchId, status, agentActive }) => setMatches((m) => m?.map((x) => (String(x._id) === String(matchId) ? { ...x, status, agentActive } : x))))
  useSocketEvent('message:new', ({ message }) => setMatches((m) => m?.map((x) => (String(x._id) === String(message.matchId) ? { ...x, lastMessage: message, lastMessageAt: message.createdAt, unread: (x.unread ?? 0) + (String(message.senderId) === String(user?._id) ? 0 : 1) } : x))))

  const all = matches ?? []
  const shown = all.filter((m) => (tab === 'letters' ? LETTERS.includes(m.status) : tab === 'chats' ? CHATS.includes(m.status) : true))
    .filter((m) => !q.trim() || m.other.name.toLowerCase().includes(q.trim().toLowerCase()))
  const list = (
    <div className="mlist">
      <label className="search"><Search size={17} strokeWidth={1.7} aria-hidden="true" /><span className="sr-only">Search matches</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search matches" /></label>
      <Tabs id="matches-tabs" value={tab} onChange={setTab} full={mobile} items={[['all', 'All', all.length], ['letters', 'Letters', all.filter((m) => LETTERS.includes(m.status)).length], ['chats', 'Chats', all.filter((m) => CHATS.includes(m.status)).length]]} />
      {matches && !shown.length ? <p className="small">{q ? 'No match by that name.' : tab === 'letters' ? 'No letters yet. One arrives when your agents finish talking.' : 'No direct chats yet.'}</p>
        : <ul className="mlist-ul">{shown.map((m) => <MatchRow key={m._id} m={m} />)}</ul>}
    </div>
  )

  if (error || !matches || !all.length) {
    return (
      <Shell title={mobile ? 'Matches' : null}>
        {error ? <Empty icon={MessageCircle} title="We couldn’t load your matches" action={<Btn kind="secondary" icon={RefreshCw} onClick={load}>Try again</Btn>}>{error}</Empty>
          : !matches ? <div className="page narrow" aria-busy="true"><Shimmer w="40%" /><Shimmer /><Shimmer w="70%" /></div>
            : <Empty icon={MessageCircle} title="No matches yet" action={<Btn onClick={() => navigate('/discover')}>Go to Discover</Btn>}>When you and someone like each other, they’ll show up here. Your agents can break the ice for you.</Empty>}
      </Shell>
    )
  }
  if (mobile) return <Shell title="Matches"><div className="pad">{list}</div></Shell>
  return (
    <Shell>
      <div className="m2"><aside className="m2-l"><h1 className="h2">Matches</h1>{list}</aside>
        <div className="m2-r"><Empty icon={MessageCircle} title="Pick a conversation">Letters are private: only you see yours. A live dot means your agents are chatting right now.</Empty></div></div>
    </Shell>
  )
}
