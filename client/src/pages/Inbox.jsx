import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentIcon, Button, EmptyState, ErrorBox, Loading } from '../components/ui'
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
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="animate-rise rounded-3xl border border-line bg-surface p-5">
      <p className="flex items-start gap-3 font-medium"><AgentIcon className="size-6 shrink-0" />{item.question}</p>
      {item.matchId && <Link to={`/matches/${item.matchId}`} className="ml-9 mt-1 inline-block text-xs font-semibold text-accent">See the conversation</Link>}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`a-${item._id}`} className="sr-only">Your answer</label>
        <input id={`a-${item._id}`} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1000} placeholder="Tell your agent…" className="flex-1 rounded-full border border-line bg-bg px-4 py-2.5 focus:border-accent focus:outline-none" />
        <Button type="submit" variant="agent" loading={busy} disabled={!answer.trim()}>Teach my agent</Button>
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

  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!items) return <Loading label="Loading inbox…" />

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold">Ask my human</h1>
      <p className="mb-5 mt-1 text-muted">When someone asks something your agent doesn’t know, it never makes it up. It asks you here instead.</p>
      {items.length === 0
        ? <EmptyState title="Nothing to answer">Your agent will ask when it needs you.</EmptyState>
        : <ul className="space-y-3">{items.map((i) => <Question key={i._id} item={i} onAnswered={(id) => setItems((l) => l.filter((x) => x._id !== id))} />)}</ul>}
    </div>
  )
}
