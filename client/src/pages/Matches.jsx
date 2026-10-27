// Matches (Round 7 Step 2 design, People.jsx Matches): search, sliding tabs (All · Letters · Chats), match rows with
// status chips and a live dot while agents talk. Kept live over the socket.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, MessageCircle, PenLine, RefreshCw, Search } from 'lucide-react'
import { Avatar, Btn, Empty, Shell, Shimmer, StatusChip, Tabs, chipOf } from '../components/r7'
import DemoMatchCard from '../components/DemoMatch'
import MatchRow from '../components/MatchRow'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useSocketEvent } from '../hooks/useSocket'
import { api, errMsg } from '../lib/api'

const LETTERS = ['compatible', 'maybe', 'incompatible']
const CHATS = ['handed_off']

// UI polish B4: the desktop right pane previews the most recent match (its letter, or the last lines of the chat).
function Preview({ m, me, onOpen }) {
  const [msgs, setMsgs] = useState(null)
  useEffect(() => { api.get(`/api/matches/${m._id}/messages`).then((r) => setMsgs(r.data.messages ?? [])).catch(() => setMsgs([])) }, [m._id])
  const letter = LETTERS.includes(m.status)
  return (
    <div className="m2-prev card">
      <div className="m2p-top"><Avatar p={m.other} src={m.other.photo ?? undefined} size={52} /><div><b className="h3">{m.other.name}</b><StatusChip s={chipOf(m.status)} live={m.status === 'agent_chatting'} /></div></div>
      {letter && <p className="m2p-letter"><PenLine size={16} strokeWidth={1.8} aria-hidden="true" />Your letter about {m.other.name} is ready. Only you can see it.</p>}
      <div className="m2p-chat" aria-label="The latest messages">
        {!msgs ? <><Shimmer w="70%" /><Shimmer w="50%" /></> : msgs.length ? msgs.slice(-4).map((x) => (
          <div key={x._id} className={`msg ${String(x.senderId) === me ? 'mine' : 'theirs'}`}>
            {x.authoredBy === 'agent' && <span className="agent-tag"><PenLine size={12} strokeWidth={1.9} aria-hidden="true" />{String(x.senderId) === me ? 'Your agent' : `${m.other.name}’s agent`}</span>}
            <p className="bubble">{x.text || '(a photo)'}</p>
          </div>
        )) : <p className="small">No messages yet. Your agents start with a hello once they’re ready.</p>}
      </div>
      <div className="m2p-acts">
        {letter && <Btn onClick={() => onOpen(`/matches/${m._id}/report`)} iconRight={ArrowRight}>Read the letter</Btn>}
        <Btn kind={letter ? 'secondary' : 'primary'} onClick={() => onOpen(`/matches/${m._id}`)}>Open the chat</Btn>
      </div>
    </div>
  )
}

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
            : <><div className="pad demo-wrap"><DemoMatchCard /></div><Empty icon={MessageCircle} title="No matches yet" action={<Btn onClick={() => navigate('/discover')}>Go to Discover</Btn>}>When you and someone like each other, they’ll show up here. Your agents can break the ice for you.</Empty></>}
      </Shell>
    )
  }
  if (mobile) return <Shell title="Matches"><div className="pad">{list}</div></Shell>
  return (
    <Shell>
      <div className="m2"><aside className="m2-l"><h1 className="h2">Matches</h1>{list}</aside>
        <div className="m2-r">{all[0] ? <Preview m={all[0]} me={String(user?._id)} onOpen={navigate} /> : <Empty icon={MessageCircle} title="Pick a conversation">Letters are private: only you see yours. A live dot means your agents are chatting right now.</Empty>}</div></div>
    </Shell>
  )
}
