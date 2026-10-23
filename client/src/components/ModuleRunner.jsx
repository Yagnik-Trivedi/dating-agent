// Plan 33 Q2: renders any question module from the server's data: tap, pick, line, story, reply and why questions, with
// follow-ups that open once a question is answered. Every question can be skipped; the draft is kept on this device as
// you go (the parent saves it to the server). Voice input where the browser has speech recognition.
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { Chips, Input } from './r7'

const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

/** A mic button that appends what you say to the field. Hidden where the browser can't do it. */
function Dictate({ onText, label }) {
  const [on, setOn] = useState(false)
  const rec = useRef(null)
  useEffect(() => () => rec.current?.stop(), [])
  if (!SpeechRecognition) return null
  const toggle = () => {
    if (on) { rec.current?.stop(); return }
    const r = new SpeechRecognition()
    r.lang = navigator.language || 'en-IN'
    r.interimResults = false
    r.onresult = (e) => onText([...e.results].map((x) => x[0].transcript).join(' '))
    r.onend = () => setOn(false)
    r.onerror = () => setOn(false)
    rec.current = r
    r.start(); setOn(true)
  }
  return <button type="button" className={`ibtn mr-mic ${on ? 'on' : ''}`} aria-pressed={on} aria-label={on ? 'Stop dictating' : `Say it: ${label}`} title={on ? 'Stop' : 'Say it instead of typing'} onClick={toggle}>{on ? <MicOff size={18} strokeWidth={1.8} /> : <Mic size={18} strokeWidth={1.8} />}</button>
}

const join = (a, b) => [String(a ?? '').trim(), b.trim()].filter(Boolean).join(' ')

function TextAnswer({ q, value, onChange, story }) {
  const id = `mq-${q.id}`
  return (
    <div className="mr-text">
      <label className="sr-only" htmlFor={id}>{q.text}</label>
      {story
        ? <textarea id={id} className="ta" rows={4} maxLength={800} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="A few sentences, the way you’d tell it" />
        : <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={300} placeholder="One line is plenty" />}
      <Dictate label={q.text} onText={(t) => onChange(join(value, t))} />
    </div>
  )
}

function WhyAnswer({ q, value = [], onChange }) {
  const rows = [0, 1, 2].map((i) => value[i] ?? { like: '', gives: '', why: '' })
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)).filter((r, j) => j <= i || r.like.trim()))
  return (
    <div className="mr-why">
      {rows.map((r, i) => (i === 0 || rows[i - 1].like.trim()) && (
        <fieldset key={i} className="mr-why-row">
          <legend className="small">Like {i + 1}</legend>
          <Input aria-label={`Like ${i + 1}`} value={r.like} onChange={(e) => set(i, 'like', e.target.value)} maxLength={60} placeholder="e.g. trekking" />
          {r.like.trim() && <>
            <Input aria-label={`What ${r.like} gives you`} value={r.gives} onChange={(e) => set(i, 'gives', e.target.value)} maxLength={300} placeholder="What does it give you?" />
            <Input aria-label={`Why that matters`} value={r.why} onChange={(e) => set(i, 'why', e.target.value)} maxLength={300} placeholder="Why does that matter?" />
          </>}
        </fieldset>
      ))}
    </div>
  )
}

function Answer({ q, value, onChange }) {
  const opts = (q.options ?? []).map((o) => [o.value, o.label])
  if (q.type === 'tap' || q.type === 'pick') return <Chips multi={Boolean(q.multi)} items={opts} value={q.multi ? (value ?? []) : (value ?? null)} onChange={(v) => onChange(!q.multi && v === value ? '' : v)} label={q.text} />
  if (q.type === 'why') return <WhyAnswer q={q} value={value} onChange={onChange} />
  if (q.type === 'reply') return (
    <div className="mr-reply">
      <p className="bubble theirs-b">{q.incoming ?? q.text}</p>
      <TextAnswer q={{ ...q, text: `Your reply to “${q.text}”` }} value={value} onChange={onChange} />
    </div>
  )
  return <TextAnswer q={q} value={value} onChange={onChange} story={q.type === 'story'} />
}

const filled = (v) => (Array.isArray(v) ? v.some((x) => (typeof x === 'string' ? x : x?.like)?.trim?.()) : String(v ?? '').trim().length > 0)

/**
 * mod: a module from GET /onboarding/modules; value / onChange: its flat answers ({ W1: '…', W1_1: '…' });
 * fromStories: an old story answer that already counts for a question (shown, never overwritten).
 */
export default function ModuleRunner({ mod, value, onChange, fromStories = {} }) {
  const set = (id) => (v) => onChange({ ...value, [id]: v })
  return (
    <ol className="mr" aria-label={mod.title}>
      {mod.questions.map((q, i) => (
        <li key={q.id} className="mr-q card" id={`mq-card-${q.id}`}>
          <h2 className="h3 mr-t"><span className="mr-n" aria-hidden="true">{i + 1}</span>{q.type === 'reply' ? 'Reply like you’d text' : q.text}</h2>
          {q.type === 'pick' && <p className="small">“Can’t decide” is a real answer.</p>}
          {q.alias && fromStories[q.id] && !filled(value[q.id]) && <p className="small mr-old">Already answered in your stories: “{String(fromStories[q.id]).slice(0, 120)}”. Add to it if you like.</p>}
          <Answer q={q} value={value[q.id]} onChange={set(q.id)} />
          {filled(value[q.id]) && q.subs.length > 0 && (
            <div className="mr-subs">
              {q.subs.map((s) => (
                <div key={s.id} className="mr-sub"><span className="lbl">{s.text}</span><Answer q={s} value={value[s.id]} onChange={set(s.id)} /></div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
