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
  // UX P0-3: words only, never a percentage (also for screen readers).
  const words = p >= 0.6 ? 'Your agent knows you well' : p >= 0.3 ? 'Your agent has plenty to talk about' : 'Your agent knows the basics'
  return (
    <div className={`brain-m ${compact ? 'c' : ''}`}>
      <div className="brain-m-top"><b>Your agent’s brain</b><span className="small">{words}</span></div>
      <div className="brain-m-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-valuetext={words} aria-label="Brain strength"><motion.i initial={false} animate={{ width: `${Math.max(3, p * 100)}%` }} transition={T.slow} /></div>
      {!compact && done < NUDGE_MODULES + 1 && <p className="small">Add a module any time to give your agent more to talk about.</p>}
    </div>
  )
}
