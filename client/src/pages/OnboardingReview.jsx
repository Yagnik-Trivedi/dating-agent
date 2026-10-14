import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import KgGraph from '../components/KgGraph'
import { Button, Card, ErrorBox, Loading, Segmented } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { DISCLOSURE, PREDICATE_COLORS, PREDICATE_LABELS } from '../lib/kg'

const DISCLOSURE_OPTIONS = Object.entries(DISCLOSURE).map(([value, d]) => ({ value, label: d.label }))

export default function OnboardingReview() {
  const toast = useToast()
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setError(null)
    api.get('/api/kg/me').then((r) => setGraph(r.data)).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])

  const facts = useMemo(() => graph?.nodes.filter((n) => n.id !== 'me') ?? [], [graph])
  const groups = useMemo(() => Object.entries(Object.groupBy(facts, (f) => f.type)), [facts])

  async function setDisclosure(id, disclosure) {
    const prev = graph
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, disclosure } : n)) }))
    try {
      await api.patch(`/api/kg/facts/${id}`, { disclosure })
    } catch (err) {
      setGraph(prev)
      toast(errMsg(err), { tone: 'bad' })
    }
  }

  async function remove(id) {
    setBusyId(id)
    try {
      await api.delete(`/api/kg/facts/${id}`)
      setGraph((g) => ({ nodes: g.nodes.filter((n) => n.id !== id), links: g.links.filter((l) => (l.target.id ?? l.target) !== id) }))
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setBusyId(null)
    }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!graph) return <Loading label="Loading your graph…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">What your agent knows about you</h1>
          <p className="mt-1 max-w-2xl text-muted">
            <strong className="text-ink">Public</strong> it can mention · <strong className="text-ink">If asked</strong> only when they ask directly · <strong className="text-ink">Private</strong> never said, only guides your agent.
          </p>
        </div>
        <Link to="/discover"><Button>Looks good, start matching</Button></Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-3 lg:sticky lg:top-20 lg:self-start">
          <KgGraph data={graph} height={380} label="Your knowledge graph" />
        </Card>

        <div className="space-y-5">
          {groups.length === 0 && <p className="text-muted">No facts yet.</p>}
          {groups.map(([type, items]) => (
            <section key={type} aria-labelledby={`g-${type}`}>
              <h2 id={`g-${type}`} className="mb-2 flex items-center gap-2 font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: PREDICATE_COLORS[type] }} />
                {PREDICATE_LABELS[type] ?? type}
              </h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {items.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">{f.label}</span>
                    <div className="flex items-center gap-2">
                      <Segmented size="sm" label={`Who can hear about: ${f.label}`} value={f.disclosure} options={DISCLOSURE_OPTIONS} onChange={(v) => setDisclosure(f.id, v)} />
                      <button onClick={() => remove(f.id)} disabled={busyId === f.id} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-bad disabled:opacity-40" aria-label={`Delete ${f.label}`}>
                        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 2h6l1 2h4v2H2V4h4l1-2zm-3 5h12l-1 11H5L4 7z" /></svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
