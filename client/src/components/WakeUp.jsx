// Wake-up screen (Round 7 Step 2 design, System.jsx Wake; plan 12 §4, plan 30 S0): Render's free tier sleeps after 15
// idle minutes and takes 50–60 s to wake. If /health hasn't answered within 3 s, a calm full-screen overlay counts the
// seconds (the app stays mounted underneath) and retries for up to 120 s. Only a timeout or a 502/503/504 counts as
// "asleep"; a blocked request (CORS, an extension, an old browser) says so with the error's name.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Btn, Wordmark } from './r7'

const HEALTH = `${import.meta.env.VITE_API_URL ?? ''}/health`
const GIVE_UP_MS = 120_000
const TRY_MS = 20_000
const WAKING = ['Waking up the server…', 'Twine runs on free hosting that naps when it’s quiet. Waking can take up to 2 minutes. Thanks for your patience.']

/** UI polish B7: an inline hint for a request that's still loading after 3 s (the server may have napped since the app opened). */
export function SlowHint() {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 3000); return () => clearTimeout(t) }, [])
  return slow && <p className="slow-hint small" role="status"><b>{WAKING[0]}</b> {WAKING[1]}</p>
}

async function ping() {
  const ctrl = new AbortController() // not AbortSignal.timeout: Safari < 16 doesn't have it
  const timer = setTimeout(() => ctrl.abort(), TRY_MS)
  try {
    const r = await fetch(HEALTH, { signal: ctrl.signal, cache: 'no-store' })
    if (r.ok) return 'up'
    return [502, 503, 504].includes(r.status) ? 'asleep' : `blocked:HTTP ${r.status}`
  } catch (err) {
    return err.name === 'AbortError' ? 'asleep' : `error:${err.name}`
  } finally {
    clearTimeout(timer)
  }
}

export default function WakeUp({ children }) {
  const [state, setState] = useState('checking') // checking · waking · up · down · blocked
  const [why, setWhy] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    let alive = true, fastFails = 0
    const start = Date.now()
    const slow = setTimeout(() => alive && setState((s) => (s === 'checking' ? 'waking' : s)), 3000)
    const tick = setInterval(() => alive && setSecs(Math.round((Date.now() - start) / 1000)), 1000)
    const loop = async () => {
      const t = Date.now()
      const r = await ping()
      if (!alive) return
      if (r === 'up') return setState('up')
      // A sleeping Render instance can also drop the connection, so it's only "blocked" if it failed fast 3 times.
      if (r.startsWith('blocked:') || (r.startsWith('error:') && Date.now() - t < 2000 && ++fastFails >= 3)) { setWhy(r.split(':')[1]); return setState('blocked') }
      if (Date.now() - start > GIVE_UP_MS) return setState('down')
      setTimeout(loop, 3000)
    }
    loop()
    return () => { alive = false; clearTimeout(slow); clearInterval(tick) }
  }, [attempt])

  const retry = () => { setState('checking'); setWhy(''); setSecs(0); setAttempt((a) => a + 1) }
  const show = state === 'waking' || state === 'down' || state === 'blocked'
  const copy = {
    waking: WAKING,
    down: ['We can’t reach the server right now', 'Nothing was sent or shared while it was down. Please try again in a moment.'],
    blocked: ['Your browser blocked the connection', `The server didn’t get a chance to answer (${why}). A privacy extension or network filter can do this; try turning it off for this site, or use another browser.`],
  }[state]
  return (
    <>
      {children}
      {show && (
        <div className="scr app-scr wake app-wake" role="alertdialog" aria-live="polite" aria-label="Server status">
          <div className="wk">
            <Wordmark />
            {state === 'waking' && <div className="wk-line" aria-hidden="true"><i style={{ width: `${Math.min(96, (1 - Math.exp(-secs / 40)) * 100)}%` }} /></div>}
            <h1 className="h2">{copy[0]}</h1>
            <p className="lead sm">{copy[1]}</p>
            {state === 'waking' && <p className="small" aria-live="off">{secs < 60 ? `${secs} seconds so far` : `${Math.floor(secs / 60)} min ${secs % 60} s so far`} · we’ll open the app as soon as it answers</p>}
            {(state !== 'waking' || secs > 90) && <Btn kind="secondary" size="sm" icon={RefreshCw} onClick={retry}>{state === 'waking' ? 'Taking long? Try again' : 'Try again'}</Btn>}
          </div>
        </div>
      )}
    </>
  )
}
