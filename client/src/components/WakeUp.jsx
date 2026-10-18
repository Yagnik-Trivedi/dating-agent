// Wake-up screen (plan 12 §4): Render's free tier sleeps after 15 idle minutes and takes 30–60 s to wake. If /health
// hasn't answered within 3 s, a calm overlay says so (the app stays mounted underneath); retries until it answers.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Btn, Typing } from './prelude'

const HEALTH = `${import.meta.env.VITE_API_URL ?? ''}/health`

export default function WakeUp({ children }) {
  const [state, setState] = useState('checking') // checking · waking · up · down
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    const slow = setTimeout(() => alive && setState((s) => (s === 'checking' ? 'waking' : s)), 3000)
    const ping = async (left) => {
      try {
        const r = await fetch(HEALTH, { signal: AbortSignal.timeout(20_000) })
        if (r.ok) { if (alive) setState('up'); return }
      } catch { /* still asleep */ }
      if (!alive) return
      if (left > 0) setTimeout(() => ping(left - 1), 3000)
      else setState('down')
    }
    ping(8)
    return () => { alive = false; clearTimeout(slow) }
  }, [attempt])

  return (
    <>
      {children}
      {(state === 'waking' || state === 'down') && (
        <div className="scr state wake" role="alertdialog" aria-live="polite" aria-label="Server status">
          <div className="st-center">
            {state === 'waking' && <Typing label="Waking up the server" />}
            <h1 className="t-h2">{state === 'waking' ? 'Waking up the server…' : 'We can’t reach the server right now'}</h1>
            <p className="t-body muted">{state === 'waking' ? 'Prelude runs on a free server that naps when nobody’s around. This usually takes under a minute.' : 'Nothing was sent or shared while it was down. Please try again in a moment.'}</p>
            {state === 'down' && <Btn kind="secondary" icon={RefreshCw} onClick={() => { setState('checking'); setAttempt((a) => a + 1) }}>Try again</Btn>}
          </div>
        </div>
      )}
    </>
  )
}
