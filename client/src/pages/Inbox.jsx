// Ask my human (Round 7 Step 2 design, System.jsx AskMyHuman): when someone asks something my agent doesn't know, it
// never makes it up; it asks here. Each answer becomes a fact I can see and edit in "This is you".
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox as InboxIcon, PenLine, RefreshCw } from 'lucide-react'
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
      <span className="agent-tag"><PenLine size={13} strokeWidth={1.9} aria-hidden="true" />From your agent</span>
      <h2 className="ask-q">{item.question}</h2>
      <p className="small">{item.askedBy ? `${item.askedBy} asked this in your chat` : 'Your agent wants to know'}{item.topicLabel?.length > 3 ? `, about ${item.topicLabel}` : ''}{asked > 1 ? ` · asked ${asked} times` : ''}. Your agent didn’t guess.{item.matchId && <> <Link className="link" to={`/matches/${item.matchId}`}>See the chat</Link></>}</p>
      <form className="ask-form" onSubmit={submit}>
        <label htmlFor={`a-${item._id}`} className="sr-only">Your answer</label>
        <textarea id={`a-${item._id}`} className="ta" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1000} placeholder="Answer the way you’d say it…" />
        <Btn type="submit" size="sm" loading={busy} disabled={!answer.trim()}>Teach my agent</Btn>
      </form>
    </article>
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
        : <div className="asks">{items.map((i) => <AskCard key={i._id} item={i} onAnswered={answered} />)}</div>
  if (mobile) return <Shell title="Ask my human" sub={items?.length ? `${items.length} question${items.length === 1 ? '' : 's'} from your agent` : undefined}><div className="pad">{body}</div></Shell>
  return <Shell><div className="page narrow"><div className="pg-h"><div><h1 className="h1">Ask my human</h1><p className="lead">Your agent asks instead of guessing. Each answer becomes a fact you can see and edit in “This is you”.</p></div></div>{body}</div></Shell>
}
