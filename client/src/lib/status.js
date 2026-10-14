// Match status → badge label + tone, from the viewer's point of view.
export function statusInfo(status, agentActive) {
  switch (status) {
    case 'matched':
    case 'trust_check':
    case 'briefing':
      return { label: 'Checking', tone: 'agent' }
    case 'agent_chatting':
      return agentActive ? { label: 'Agent chatting', tone: 'agent' } : { label: "You're chatting", tone: 'accent' }
    case 'evaluating':
      return { label: 'Evaluating', tone: 'agent' }
    case 'compatible':
      return { label: 'Compatible', tone: 'good' }
    case 'maybe':
      return { label: 'Maybe', tone: 'warn' }
    case 'incompatible':
      return { label: 'Not compatible', tone: 'muted' }
    case 'flagged_fake':
      return { label: 'Flagged', tone: 'bad' }
    case 'handed_off':
      return { label: "You're chatting", tone: 'accent' }
    case 'closed':
      return { label: 'Closed', tone: 'muted' }
    default:
      return { label: status ?? '—', tone: 'muted' }
  }
}

export const VERDICT = {
  compatible: { label: 'Compatible', tone: 'good', headline: 'Your agent thinks you two click' },
  maybe: { label: 'Maybe', tone: 'warn', headline: 'Worth a look' },
  incompatible: { label: 'Not compatible', tone: 'muted', headline: 'Probably not the one' },
}

export const AGENT_MODES = {
  off: { label: 'Off', help: 'You handle every conversation yourself. Your agent never sends messages.' },
  shadow: { label: 'Shadow', help: 'Your agent chats for you while you watch live. One tap on Take over and it stops.' },
  auto: { label: 'Auto', help: 'Your agent handles early chats quietly and only brings you the matches worth your time.' },
}
