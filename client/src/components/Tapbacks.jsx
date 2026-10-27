// Plan 34 (A4.1): tapback reactions under a bubble, like Instagram and WhatsApp. Read-only in the replay; in the match
// room a person who is chatting themselves can react to the other person's messages.
import { useState } from 'react'
import { SmilePlus } from 'lucide-react'

export const TAPBACKS = ['❤️', '😂', '😮', '😢', '👍', '🔥', '🙄']

/** reactions: [{ by, emoji, agent }]; nameOf(userId) → "Meera"; me: my userId; onReact(emoji | null) when I may react. */
export default function Tapbacks({ reactions = [], nameOf, me, onReact }) {
  const [open, setOpen] = useState(false)
  const mine = reactions.find((r) => String(r.by) === String(me))
  const label = (r) => `${r.emoji} reacted by ${String(r.by) === String(me) ? (r.agent ? 'your agent' : 'you') : `${nameOf(r.by)}${r.agent ? '’s agent' : ''}`}`
  if (!reactions.length && !onReact) return null
  return (
    <span className="tapbacks">
      {reactions.map((r) => <span key={`${r.by}`} className={`tb-r ${String(r.by) === String(me) ? 'me' : ''}`} role="img" aria-label={label(r)} title={label(r)}>{r.emoji}</span>)}
      {onReact && (
        <span className="tb-pick">
          <button type="button" className="tb-add" aria-label="React" aria-expanded={open} onClick={() => setOpen(!open)}><SmilePlus size={16} strokeWidth={1.8} aria-hidden="true" /></button>
          {open && <span className="tb-menu" role="menu">{TAPBACKS.map((e) => (
            <button key={e} type="button" role="menuitem" className={mine?.emoji === e ? 'on' : ''} aria-label={mine?.emoji === e ? `Remove ${e}` : `React ${e}`}
              onClick={() => { onReact(mine?.emoji === e ? null : e); setOpen(false) }}>{e}</button>
          ))}</span>}
        </span>
      )}
    </span>
  )
}
