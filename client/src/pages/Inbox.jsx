// Ask my human: when someone asks something the agent doesn't know, it never makes it up; it asks here instead.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircleQuestion } from 'lucide-react'
import { Btn, EmptyNote } from '../components/prelude'
import { useSocketEvent } from '../hooks/useSocket'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

function Question({ item, onAnswered }) {
  const toast = useToast()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/api/inbox/${item._id}/answer`, { answer })
      toast('Your agent learned something new', { agent: true })
      onAnswered(item._id)
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally { setBusy(false) }
  }
  const asked = 1 + (item.askedAgain?.length ?? 0)
  return (
    <li className="card inbox-q">
      <p className="inbox-meta small"><MessageCircleQuestion size={15} strokeWidth={1.7} aria-hidden="true" />
        {item.askedBy ? `${item.askedBy} asked` : 'Your agent wants to know'}{item.topicLabel?.length > 3 && ` · about ${item.topicLabel}`}{asked > 1 && ` · asked ${asked} times`}</p>
      <p className="inbox-text">{item.question}</p>
      {item.matchId && <Link to={`/matches/${item.matchId}`} className="text-link small">See the conversation</Link>}
      <form onSubmit={submit} className="composer inbox-form">
        <label htmlFor={`a-${item._id}`} className="sr-only">Your answer</label>
        <input id={`a-${item._id}`} className="composer-input" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1000} placeholder="Answer the way you’d say it…" />
        <Btn type="submit" loading={busy} disabled={!answer.trim()}>Teach my agent</Btn>
      </form>
    </li>
  )
}

export default function Inbox() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => {
    api.get('/api/inbox').then((r) => { setItems(r.data.items); setError(null) }).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])
  useSocketEvent('inbox:new', ({ item }) => setItems((list) => (list && !list.some((i) => i._id === item._id) ? [item, ...list] : list)))

  return (
    <div className="page inbox">
      <header className="page-head"><div><h1 className="t-h1">Ask my human</h1><p>When someone asks something your agent doesn’t know about you, it never makes it up. It asks you here, and your answer teaches it.</p></div></header>
      {error ? <div className="st-center"><h2 className="t-h2">We couldn’t load your questions</h2><p className="t-body muted">{error}</p><Btn kind="secondary" onClick={load}>Try again</Btn></div>
        : !items ? <div className="card inbox-q" aria-busy="true"><div className="sk sk-l" /><div className="sk sk-s" /></div>
        : items.length === 0 ? <EmptyNote title="Nothing to answer">Your agent will ask when it needs you.</EmptyNote>
        : <ul className="inbox-list">{items.map((i) => <Question key={i._id} item={i} onAnswered={(id) => setItems((l) => l.filter((x) => x._id !== id))} />)}</ul>}
    </div>
  )
}
