// Introductions: one person at a time, their own words first. Photos stay blurred until you both say yes (design rule).
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, X } from 'lucide-react'
import { motion } from 'motion/react'
import { Btn, EmptyNote, Reveal, Thumb, calm } from '../components/prelude'
import { useToast } from '../hooks/useToast'
import { LiveBadge } from '../components/LiveBadge'
import { api, errMsg } from '../lib/api'

function Card({ p }) {
  return (
    <motion.article className="card intro" aria-label={`${p.name}${p.age ? `, ${p.age}` : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={calm}>
      <div className="intro-who"><Thumb src={p.photos?.[0]} name={p.name} size={64} />
        <div><h2 className="t-h2">{p.name}{p.age && <span className="muted">, {p.age}</span>}</h2>{p.city && <p className="small">{p.city}</p>}{p.liveChecked && <LiveBadge />}</div></div>
      {p.bio && <p className="t-lead intro-bio">{p.bio}</p>}
      {p.prompts?.map((q) => <div key={q.q} className="intro-q"><p className="t-label">{q.q}</p><p className="intro-a">{q.a}</p></div>)}
      {p.tags?.interests?.length > 0 && <div className="chips" aria-label="Interests">{p.tags.interests.map((i) => <span key={i} className="chip">{i}</span>)}</div>}
    </motion.article>
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

  return (
    <div className="page intro-page">
      <header className="page-head"><div><h1 className="t-h1">Introductions</h1><p>Read who they are first. Photos stay blurred until you both say yes.</p></div></header>
      {error ? (
        <div className="st-center"><h2 className="t-h2">We couldn’t load introductions</h2><p className="t-body muted">{error}</p><Btn kind="secondary" onClick={load}>Try again</Btn></div>
      ) : !deck ? (
        <div className="card intro" aria-busy="true"><div className="sk sk-t" /><div className="sk sk-l" /><div className="sk sk-s" /><div className="sk sk-l" /></div>
      ) : matched ? (
        <Reveal className="card intro matched">
          <p className="v-eyebrow"><Heart size={15} strokeWidth={1.7} aria-hidden="true" />You both said yes</p>
          <h2 className="t-h1">You and {matched.profile.name} liked each other.</h2>
          <p className="t-lead">Your agent is checking their profile for fakes, then it will say hello for you. You can read every line.</p>
          <div className="v-actions"><Link className="btn primary lg" to={`/matches/${matched.matchId}`}>Watch your agent</Link><Btn kind="secondary" size="lg" onClick={() => setMatched(null)}>Keep reading introductions</Btn></div>
        </Reveal>
      ) : deck.length === 0 ? (
        <EmptyNote title="No new introductions today" action={<Link className="text-link" to="/you">Check what your agent knows about you</Link>}>Good introductions take a little time. We’ll let you know when there’s someone worth meeting. Nothing to do in the meantime.</EmptyNote>
      ) : (
        <>
          <Card key={deck[0].userId} p={deck[0]} />
          <div className="intro-actions">
            <Btn kind="secondary" size="lg" icon={X} onClick={() => decide(false)} loading={busy === 'pass'} disabled={Boolean(busy)}>Not for me</Btn>
            <Btn size="lg" icon={Heart} onClick={() => decide(true)} loading={busy === 'like'} disabled={Boolean(busy)}>I’d like to meet them</Btn>
          </div>
        </>
      )}
    </div>
  )
}
