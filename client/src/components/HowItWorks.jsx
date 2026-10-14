import { AgentIcon } from './ui'

export const STEPS = [
  { title: 'Trust check', text: 'Your agent reads every new match for fake-profile signals and gentle inconsistencies before anyone says hello.' },
  { title: 'Understand', text: "It studies their profile and prompts, compares them with what matters to you, and plans what it needs to find out." },
  { title: 'Pre-chat', text: 'It opens the conversation in your voice, using only things you told it. Anything it doesn’t know, it asks you.' },
  { title: 'Verdict', text: 'Compatible, Maybe or Not compatible, with the exact messages as receipts. You decide what happens next.' },
]

export function StepList({ compact = false }) {
  return (
    <ol className={compact ? 'space-y-3' : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'}>
      {STEPS.map((s, i) => (
        <li key={s.title} className={compact ? 'flex gap-3' : 'rounded-3xl border border-line bg-surface p-5'}>
          <span className={`flex shrink-0 items-center justify-center rounded-full bg-agent-soft font-display font-semibold text-agent ${compact ? 'size-7 text-sm' : 'mb-3 size-9'}`}>{i + 1}</span>
          <div>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function AgentRules() {
  return (
    <div className="mt-4 rounded-2xl bg-agent-soft p-4 text-sm text-ink">
      <p className="mb-2 flex items-center gap-2 font-semibold"><AgentIcon />What your agent will never do</p>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>Invent facts about you, or share anything you mark private.</li>
        <li>Make plans, share contact details or agree to meet.</li>
        <li>Deny using AI if someone sincerely asks.</li>
      </ul>
      <p className="mt-2 text-muted">Tap <strong className="text-ink">Take over</strong> anytime and it stops instantly.</p>
    </div>
  )
}
