// Plan 33 Q2: "brain strength": how much of the brain map is filled, and how many modules are done (A1: the app nudges
// toward at least 4 modules beyond the core for long chats).
import { motion } from 'motion/react'
import { T } from './r7'
import { strengthOf } from '../lib/modules'

export const NUDGE_MODULES = 4

export default function BrainMeter({ strength, compact }) {
  if (!strength) return null
  const p = strengthOf(strength)
  const done = strength.modulesDone ?? 0
  const words = p >= 0.6 ? 'Rich: your agent has a lot to talk about' : p >= 0.3 ? 'Growing: enough for longer chats' : 'Thin: your agent will run out of things to say'
  return (
    <div className={`brain-m ${compact ? 'c' : ''}`}>
      <div className="brain-m-top"><b>Your agent’s brain</b><span className="small">{Math.round(p * 100)}% · {words}</span></div>
      <div className="brain-m-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label="Brain strength"><motion.i initial={false} animate={{ width: `${Math.max(3, p * 100)}%` }} transition={T.slow} /></div>
      {!compact && done < NUDGE_MODULES + 1 && <p className="small">Long chats need talk material: do “Your world right now” and at least {NUDGE_MODULES} more modules ({done} done).</p>}
    </div>
  )
}
