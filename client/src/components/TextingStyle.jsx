// Plan 32 KP1 "How do you usually text?": taps only, every row skippable (questions from GET /onboarding/questions).
// Used in onboarding's reply step, in "Teach your agent more" and as the "How I text" chips on This is you.
import { Chips } from './r7'

export default function TextingStyle({ questions = [], value = {}, onChange, compact }) {
  return (
    <div className={`tstyle ${compact ? 'compact' : ''}`}>
      {questions.map((q) => (
        <div key={q.id} className="vq-row">
          <span className="lbl">{q.text}</span>
          <Chips items={q.options.map((o) => [o.value, o.label])} value={value[q.id] ?? null} label={q.text}
            onChange={(v) => onChange({ ...value, [q.id]: value[q.id] === v ? undefined : v })} />
        </div>
      ))}
    </div>
  )
}

/** The saved style without unset rows and the server's timestamp (the PUT body). */
export const styleBody = (v = {}) => Object.fromEntries(Object.entries(v).filter(([k, x]) => x && k !== 'at'))
