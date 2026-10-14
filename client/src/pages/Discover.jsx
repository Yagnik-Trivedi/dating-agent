import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentIcon, Avatar, Button, EmptyState, ErrorBox, Loading, Modal } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

function ProfileCard({ p }) {
  return (
    <article className="animate-rise overflow-hidden rounded-[2rem] border border-line bg-surface" aria-label={`${p.name}${p.age ? `, ${p.age}` : ''}`}>
      <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-accent-soft to-agent-soft">
        <Avatar src={p.photos?.[0]} name={p.name} className="size-40 sm:size-48" />
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-3xl font-semibold">{p.name}{p.age && <span className="font-normal text-muted">, {p.age}</span>}</h2>
          {p.city && <p className="text-muted">{p.city}</p>}
        </div>
        {p.bio && <p className="leading-relaxed">{p.bio}</p>}
        {p.prompts?.map((q) => (
          <div key={q.q} className="rounded-2xl bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{q.q}</p>
            <p className="mt-1 font-display text-lg">{q.a}</p>
          </div>
        ))}
        {p.tags?.interests?.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Interests">
            {p.tags.interests.map((i) => <li key={i} className="rounded-full border border-line px-3 py-1 text-sm">{i}</li>)}
          </ul>
        )}
      </div>
    </article>
  )
}

export default function Discover() {
  const toast = useToast()
  const [deck, setDeck] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [matched, setMatched] = useState(null)

  const load = useCallback(() => {
    setError(null)
    api.get('/api/discover', { params: { limit: 20 } }).then((r) => setDeck(r.data.profiles)).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])

  async function decide(liked) {
    const p = deck[0]
    setBusy(liked ? 'like' : 'pass')
    try {
      const { data } = await api.post('/api/likes', { toUserId: p.userId, liked })
      if (data.matched) setMatched({ profile: p, matchId: data.matchId })
      setDeck((d) => d.slice(1))
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setBusy(null)
    }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!deck) return <Loading label="Finding people…" />

  return (
    <div className="mx-auto max-w-md">
      {deck.length === 0 ? (
        <EmptyState title="You’re all caught up" action={<Button variant="secondary" onClick={load}>Check again</Button>}>
          New people show up as they join. Your agent is ready when they do.
        </EmptyState>
      ) : (
        <>
          <ProfileCard key={deck[0].userId} p={deck[0]} />
          <div className="sticky bottom-20 mt-4 flex justify-center gap-4 md:bottom-6">
            <Button variant="secondary" size="lg" className="min-w-32 shadow-sm" onClick={() => decide(false)} loading={busy === 'pass'} disabled={Boolean(busy)}>Pass</Button>
            <Button size="lg" className="min-w-32 shadow-sm" onClick={() => decide(true)} loading={busy === 'like'} disabled={Boolean(busy)}>Like</Button>
          </div>
        </>
      )}

      <Modal open={Boolean(matched)} onClose={() => setMatched(null)} title="It’s a match! 🎉">
        {matched && (
          <div className="space-y-4 text-center">
            <Avatar src={matched.profile.photos?.[0]} name={matched.profile.name} className="mx-auto size-24" />
            <p>You and <strong>{matched.profile.name}</strong> liked each other.</p>
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-agent-soft px-4 py-3 text-sm font-medium text-agent">
              <AgentIcon /> Your agent is checking this profile…
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => setMatched(null)}>Keep browsing</Button>
              <Link to={`/matches/${matched.matchId}`}><Button>Watch your agent</Button></Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
