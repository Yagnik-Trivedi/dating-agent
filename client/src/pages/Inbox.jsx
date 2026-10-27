// Ask my human (Round 7 Step 2 design, System.jsx AskMyHuman): when someone asks something my agent doesn't know, it
// never makes it up; it asks here. Each answer becomes a fact I can see and edit in "This is you".
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Inbox as InboxIcon, PenLine, RefreshCw, Sparkles } from 'lucide-react'
import { Btn, Empty, Shell, Shimmer } from '../components/r7'
import { useMobile } from '../components/prelude'
import { useSocketEvent } from '../hooks/useSocket'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { typingDevice } from '../lib/device'

function AskCard({ item, onAnswered }) {
  const toast = useToast()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/api/inbox/${item._id}/answer`, { answer, device: typingDevice() })
      toast('Your agent learned something new', { agent: true, to: '/you', action: 'See it' })
      onAnswered(item._id)
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally { setBusy(false) }
  }
  const asked = 1 + (item.askedAgain?.length ?? 0)
  return (
    <article className="ask card">
      <span className="agent-tag"><PenLine size={13} strokeWidth={1.9} aria-hidden="true" />{item.matchId ? 'From your agent' : 'Teach your agent'}</span>
      <h3 className="ask-q">{item.question}</h3>
      {/* UX P1-3: a module question nobody asked says so; only a chat question "didn't guess" */}
      {!item.matchId ? <p className="small">Optional. Answer if you like: it helps your agent sound like you{item.topicLabel?.length > 3 ? `, about ${item.topicLabel}` : ''}.</p> : <p className="small">{item.askedBy ? `${item.askedBy} asked this in your chat` : 'Your agent wants to know'}{item.topicLabel?.length > 3 ? `, about ${item.topicLabel}` : ''}{asked > 1 ? ` · asked ${asked} times` : ''}. Your agent didn’t guess. <Link className="link" to={`/matches/${item.matchId}`}>See the chat</Link></p>}
      <form className="ask-form" onSubmit={submit}>
        <label htmlFor={`a-${item._id}`} className="sr-only">Your answer</label>
        <textarea id={`a-${item._id}`} className="ta" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1000} placeholder="Answer the way you’d say it…" />
        <Btn type="submit" size="sm" loading={busy} disabled={!answer.trim()}>Teach my agent</Btn>
      </form>
    </article>
  )
}

/** UX P1-3: questions from a chat first; module questions are a separate, optional group. */
function Groups({ items, onAnswered }) {
  const chat = items.filter((i) => i.matchId), teach = items.filter((i) => !i.matchId)
  const group = (title, sub, list) => list.length > 0 && (
    <section className="ask-group" aria-label={title}>
      <h2 className="h3">{title} <span className="small">· {sub}</span></h2>
      <div className="asks">{list.map((i) => <AskCard key={i._id} item={i} onAnswered={onAnswered} />)}</div>
    </section>
  )
  return <>{group('Asked in a chat', `${chat.length} waiting`, chat)}{group('Teach your agent', 'optional', teach)}</>
}

// UI polish A9: the desktop side panel. The newest things the agent learned about me (my own graph) + how answers are used.
function Learned() {
  const [facts, setFacts] = useState(null)
  useEffect(() => {
    api.get('/api/kg/me').then(({ data }) => setFacts((data.nodes ?? []).filter((n) => n.hub && n.learnedAt && n.type !== 'voice' && n.type !== 'self')
      .sort((a, b) => new Date(b.learnedAt) - new Date(a.learnedAt)).slice(0, 5))).catch(() => setFacts([]))
  }, [])
  return (
    <aside className="in-side">
      <section className="card in-sec"><h2 className="dr-h"><Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />What your agent learned lately</h2>
        {!facts ? <Shimmer w="70%" /> : facts.length ? <ul className="dr-list">{facts.map((f) => <li key={f.id}>{f.label}</li>)}</ul> : <p className="small">Nothing new yet.</p>}
        <Link className="link" to="/you">See everything in “This is you”</Link>
      </section>
      <section className="card in-sec"><h2 className="dr-h"><BookOpen size={16} strokeWidth={1.8} aria-hidden="true" />How answers are used</h2>
        <p className="small">Each answer becomes something your agent can say about you, in your words. You can edit it or make it private any time in “This is you”. Your agent never makes up an answer it doesn’t have.</p>
      </section>
    </aside>
  )
}

export default function Inbox() {
  const mobile = useMobile()
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => { api.get('/api/inbox').then((r) => { setItems(r.data.items); setError(null) }).catch((e) => setError(errMsg(e))) }, [])
  useEffect(load, [load])
  useSocketEvent('inbox:new', ({ item }) => setItems((list) => (list && !list.some((i) => i._id === item._id) ? [item, ...list] : list)))
  const answered = (id) => setItems((l) => l.filter((x) => x._id !== id))

  const body = error ? <Empty icon={RefreshCw} title="We couldn’t load your questions" action={<Btn kind="secondary" onClick={load}>Try again</Btn>}>{error}</Empty>
    : !items ? <div aria-busy="true"><Shimmer w="60%" /><Shimmer /><Shimmer w="80%" /></div>
      : !items.length ? <Empty icon={InboxIcon} title="Nothing to answer">When your agent isn’t sure about something, it asks you here instead of guessing.</Empty>
        : <Groups items={items} onAnswered={answered} />
  if (mobile) return <Shell title="Your agent has questions" back sub={items?.some((i) => i.matchId) ? `${items.filter((i) => i.matchId).length} asked in a chat` : undefined}><div className="pad">{body}</div></Shell>
  return <Shell><div className="page in2"><div className="in-main"><div className="pg-h"><div><h1 className="h1">Your agent has questions</h1><p className="lead">It asks instead of guessing. Each answer becomes something it can say about you.</p></div></div>{body}</div><Learned /></div></Shell>
}
