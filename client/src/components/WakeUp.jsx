// Wake-up screen (plan 12 §4, plan 30 S0): Render's free tier sleeps after 15 idle minutes and takes 50–60 s to wake.
// If /health hasn't answered within 3 s, a calm overlay says so (the app stays mounted underneath). It keeps retrying
// for up to 120 s, but only a timeout or a 502/503/504 counts as "asleep": a blocked request (CORS, an extension, an
// old browser) says so straight away with the error's name, instead of looking like a sleeping server.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Btn, Typing } from './prelude'

const HEALTH = `${import.meta.env.VITE_API_URL ?? ''}/health`
const GIVE_UP_MS = 120_000
const TRY_MS = 20_000

async function ping() {
  const ctrl = new AbortController() // not AbortSignal.timeout: Safari < 16 doesn't have it
  const timer = setTimeout(() => ctrl.abort(), TRY_MS)
  try {
    const r = await fetch(HEALTH, { signal: ctrl.signal, cache: 'no-store' })
    if (r.ok) return 'up'
    return [502, 503, 504].includes(r.status) ? 'asleep' : `blocked:HTTP ${r.status}`
  } catch (err) {
    // An abort is our own timeout. A TypeError straight away is the browser refusing (CORS, offline, blocked), but a
    // sleeping Render instance can also drop the connection, so it's only "blocked" if it failed fast.
    return err.name === 'AbortError' ? 'asleep' : `error:${err.name}`
  } finally {
    clearTimeout(timer)
  }
}

export default function WakeUp({ children }) {
  const [state, setState] = useState('checking') // checking · waking · up · down · blocked
  const [why, setWhy] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true, fastFails = 0
    const start = Date.now()
    const slow = setTimeout(() => alive && setState((s) => (s === 'checking' ? 'waking' : s)), 3000)
    const loop = async () => {
      const t = Date.now()
      const r = await ping()
      if (!alive) return
      if (r === 'up') return setState('up')
      const quick = Date.now() - t < 2000
      if (r.startsWith('blocked:') || (r.startsWith('error:') && quick && ++fastFails >= 3)) {
        setWhy(r.split(':')[1])
        return setState('blocked')
      }
      if (Date.now() - start > GIVE_UP_MS) return setState('down')
      setTimeout(loop, 3000)
    }
    loop()
    return () => { alive = false; clearTimeout(slow) }
  }, [attempt])

  const retry = () => { setState('checking'); setWhy(''); setAttempt((a) => a + 1) }
  const copy = {
    waking: ['Waking up the server…', 'Prelude runs on a free server that naps when nobody’s around. This usually takes under a minute.'],
    down: ['We can’t reach the server right now', 'Nothing was sent or shared while it was down. Please try again in a moment.'],
    blocked: ['Your browser blocked the connection', `The server didn’t get a chance to answer (${why}). A privacy extension or network filter can do this; try turning it off for this site, or another browser.`],
  }[state]

  return (
    <>
      {children}
      {copy && (
        <div className="scr state wake" role="alertdialog" aria-live="polite" aria-label="Server status">
          <div className="st-center">
            {state === 'waking' && <Typing label="Waking up the server" />}
            <h1 className="t-h2">{copy[0]}</h1>
            <p className="t-body muted">{copy[1]}</p>
            {state !== 'waking' && <Btn kind="secondary" icon={RefreshCw} onClick={retry}>Try again</Btn>}
          </div>
        </div>
      )}
    </>
  )
}
