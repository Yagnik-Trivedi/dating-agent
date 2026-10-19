// Plan 30 S3.3 preferences sheet (design: Discover.jsx#Preferences): age range, show me, city, distance. These are the
// existing Profile fields the gate reads (ageMin/ageMax, interestedIn, city, radiusKm); saving rebuilds the gate.
import { useEffect, useState } from 'react'
import { Btn, Seg, Sheet } from './r7'
import { CityBox } from '../pages/Auth'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

const SHOW = { women: ['woman'], men: ['man'], everyone: ['woman', 'man', 'nonbinary'] }
const showOf = (list = []) => (list.length > 1 ? 'everyone' : list[0] === 'man' ? 'men' : list[0] === 'woman' ? 'women' : 'everyone')

/** Two native range inputs on one track: native keyboard + screen reader support. */
function AgeRange({ lo, hi, onChange }) {
  return (
    <div className="range" role="group" aria-label="Age">
      <div className="rg-h"><span>Age</span><b>{lo}–{hi}</b></div>
      <div className="rg-dual">
        <input type="range" min={18} max={80} value={lo} aria-label="Youngest age" onChange={(e) => onChange(Math.min(Number(e.target.value), hi), hi)} />
        <input type="range" min={18} max={80} value={hi} aria-label="Oldest age" onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo))} />
      </div>
    </div>
  )
}

export default function Preferences({ open, onClose, onSaved }) {
  const { profile, refresh } = useAuth()
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (open && profile) setF({ ageMin: profile.ageMin ?? 18, ageMax: Math.min(80, profile.ageMax ?? 80), show: showOf(profile.interestedIn), city: profile.city ?? '', radiusKm: profile.radiusKm ?? 0 })
  }, [open, profile])
  async function save() {
    setBusy(true); setError(null)
    try {
      await api.put('/api/profile', { ageMin: f.ageMin, ageMax: f.ageMax >= 80 ? 99 : f.ageMax, interestedIn: SHOW[f.show], city: f.city.trim(), radiusKm: f.radiusKm })
      await refresh()
      onSaved?.()
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open && Boolean(f)} title="Preferences" onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} loading={busy} disabled={!f?.city.trim()}>Show people</Btn></>}>
      {f && <>
        <AgeRange lo={f.ageMin} hi={f.ageMax} onChange={(ageMin, ageMax) => setF({ ...f, ageMin, ageMax })} />
        <div className="pf-row"><span className="pf-l">Show me</span><Seg label="Show me" value={f.show} onChange={(show) => setF({ ...f, show })} items={[['women', 'Women'], ['men', 'Men'], ['everyone', 'Everyone']]} /></div>
        <CityBox value={f.city} onChange={(city) => setF({ ...f, city })} />
        <div className="range" role="group" aria-label="Distance">
          <div className="rg-h"><span>Distance</span><b>{f.radiusKm ? `${f.radiusKm} km` : 'My city only'}</b></div>
          <input className="rg-one" type="range" min={0} max={100} step={5} value={f.radiusKm} aria-label="Distance in km (0 = my city only)" onChange={(e) => setF({ ...f, radiusKm: Number(e.target.value) })} />
        </div>
        <p className="small">Distance works for the 104 listed cities. Age 80 means 80 and over.</p>
        {error && <p className="f-err" role="alert">{error}</p>}
      </>}
    </Sheet>
  )
}
