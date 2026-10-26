// UX P0-5 "Try a demo match": for someone with no matches yet, a card that starts a match with a demo persona from
// their own deck (GET/POST /api/demo-match), so the agents' first conversation and the letter are reachable at once.
// Demo personas are illustrated seed people, always labelled "Demo profile".
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkle } from 'lucide-react'
import { Btn } from './r7'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

export const DemoChip = ({ p }) => (p?.demo ? <span className="demo-chip" title="An illustrated demo person, not a real user">Demo profile</span> : null)

export default function DemoMatchCard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get('/api/demo-match').then((r) => setAvailable(r.data.available)).catch(() => {}) }, [])
  if (!available) return null
  async function start() {
    setBusy(true)
    try { navigate(`/matches/${(await api.post('/api/demo-match')).data.matchId}`) } catch (err) { toast(errMsg(err), { tone: 'bad' }); setBusy(false) }
  }
  return (
    <section className="demo-card card" aria-label="Try a demo match">
      <Sparkle size={20} strokeWidth={1.7} aria-hidden="true" />
      <div><b>Try a demo match</b><span className="small">Match with a demo profile from your city and watch your agents break the ice. Demo profiles are illustrated people, not real users.</span></div>
      <Btn size="sm" onClick={start} loading={busy}>Start a demo match</Btn>
    </section>
  )
}
