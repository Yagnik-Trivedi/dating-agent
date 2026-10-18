import { Check } from 'lucide-react'

const TIP = 'A live camera check showed a real person made this account. It doesn’t check their photos or ID.'
/** "Live-checked" with the exact tooltip (plan 19). Never "verified". */
export const LiveBadge = () => (
  <span className="live-badge" title={TIP} tabIndex={0} aria-label={`Live-checked. ${TIP}`}>
    <Check size={13} strokeWidth={2} aria-hidden="true" />Live-checked
  </span>
)
