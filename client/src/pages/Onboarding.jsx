import { useCallback, useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { Typing } from '../components/prelude'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { AgentIcon, Button, Chip, ErrorBox, Loading, ProgressBar, Segmented, Spinner } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

const EMPTY = { I: { languages: [] }, A: {}, B: {}, C: {}, D: { interests: [] }, E: {} }
const MIN_INTERESTS = 3

/** Is this section complete enough to move on? → null if ok, else a hint. */
function missing(section, answers) {
  const a = answers[section.id]
  switch (section.type) {
    case 'likert': {
      const left = section.items.filter((i) => !a[i.id]).length
      return left ? `${left} statement${left > 1 ? 's' : ''} left` : null
    }
    case 'identity':
      return a.languages?.length ? null : 'Pick at least one language'
    case 'choice_importance': {
      const left = section.items.filter((i) => !a[i.id]?.answer || !a[i.id]?.importance).length
      if (left) return `${left} question${left > 1 ? 's' : ''} left (answer + how much it matters)`
      const bad = section.items.find((i) => a[i.id].dealbreaker && (a[i.id].accepts ?? i.options.map((o) => o.value)).length >= i.options.length)
      return bad ? `"${bad.text}": a dealbreaker needs at least one option you wouldn't accept` : null
    }
    case 'text': {
      const done = section.items.filter((i) => a[i.id]?.trim()).length
      const min = section.minAnswers ?? 4
      return done < min ? `Answer at least ${min} (${done} so far)` : null
    }
    case 'interests':
      return a.interests.length < MIN_INTERESTS ? `Pick at least ${MIN_INTERESTS}` : null
    case 'style': {
      const left = section.items.filter((i) => !a[i.id]?.trim()).length
      return left ? `${left} repl${left > 1 ? 'ies' : 'y'} left` : null
    }
    default:
      return null
  }
}

function Likert({ section, value, onChange }) {
  return (
    <div className="space-y-3">
      <p className="flex justify-between text-xs font-medium text-muted"><span>1 = {section.scale[0].label}</span><span>5 = {section.scale.at(-1).label}</span></p>
      {section.items.map((item, idx) => (
        <fieldset key={item.id} className="rounded-2xl border border-line bg-surface p-4">
          <legend className="sr-only">{item.text}</legend>
          <p className="mb-3 font-medium"><span className="text-muted">{idx + 1}. </span>I {item.text.charAt(0).toLowerCase() + item.text.slice(1)}</p>
          <div className="grid grid-cols-5 gap-2">
            {section.scale.map((s) => (
              <Chip key={s.value} selected={value[item.id] === s.value} onClick={() => onChange({ ...value, [item.id]: s.value })} aria-label={`${s.value}: ${s.label}`} className="px-0">
                {s.value}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function ChoiceImportance({ section, value, onChange }) {
  return (
    <div className="space-y-3">
      {section.items.map((item) => {
        const v = value[item.id]
        const all = item.options.map((o) => o.value)
        const accepts = v?.accepts ?? all
        const set = (patch) => onChange({ ...value, [item.id]: { ...v, ...patch } })
        const toggleAccept = (o) => set({ accepts: accepts.includes(o) ? accepts.filter((x) => x !== o) : [...accepts, o] })
        return (
          <fieldset key={item.id} className="rounded-2xl border border-line bg-surface p-4">
            <legend className="sr-only">{item.text}</legend>
            <p className="mb-3 font-medium">{item.text}</p>
            <div className="flex flex-wrap gap-2">
              {item.options.map((o) => (
                <Chip key={o.value} selected={v?.answer === o.value} onClick={() => set({ answer: o.value })}>{o.label}</Chip>
              ))}
            </div>
            {v?.answer && (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">In a partner, this is</span>
                  {/* No default (F7): Next stays disabled until each item has an importance. */}
                  <Segmented size="sm" label={`Importance: ${item.text}`} value={v.importance} options={section.importance} onChange={(importance) => set({ importance })} />
                </div>
                <div>
                  <p className="mb-2 text-muted">{section.accepts?.label ?? "In a partner I'd accept"}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.options.map((o) => <Chip key={o.value} selected={accepts.includes(o.value)} onClick={() => toggleAccept(o.value)}>{o.label}</Chip>)}
                  </div>
                </div>
                <label className="flex w-fit items-center gap-2 font-medium">
                  <input type="checkbox" checked={Boolean(v.dealbreaker)} onChange={(e) => set({ dealbreaker: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
                  {section.dealbreaker?.label ?? 'Dealbreaker'}
                </label>
              </div>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}

function Identity({ section, value, onChange }) {
  const [custom, setCustom] = useState('')
  const langs = value.languages ?? []
  const toggle = (l) => onChange({ ...value, languages: langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l] })
  return (
    <div className="space-y-4">
      {section.items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-line bg-surface p-4">
          <label htmlFor={`i-${item.id}`} className="mb-2 block font-medium">{item.text}</label>
          {item.kind === 'multi' ? (
            <>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...item.options.map((o) => o.label.toLowerCase()), ...langs])].map((l) => <Chip key={l} selected={langs.includes(l)} onClick={() => toggle(l)}>{l}</Chip>)}
              </div>
              {item.allowOther && (
                <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const l = custom.trim().toLowerCase(); if (l && !langs.includes(l)) toggle(l); setCustom('') }}>
                  <input id={`i-${item.id}`} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} placeholder="Another language…" className="flex-1 rounded-full border border-line bg-bg px-4 py-2 focus:border-accent focus:outline-none" />
                  <Button type="submit" variant="secondary" disabled={!custom.trim()}>Add</Button>
                </form>
              )}
            </>
          ) : (
            <input id={`i-${item.id}`} value={value[item.id] ?? ''} maxLength={item.id === 'family' ? 200 : 120} onChange={(e) => onChange({ ...value, [item.id]: e.target.value })} placeholder={item.placeholder} className="w-full rounded-xl border border-line bg-bg px-3 py-2 focus:border-accent focus:outline-none" />
          )}
        </div>
      ))}
    </div>
  )
}

function Stories({ section, value, onChange }) {
  return (
    <div className="space-y-4">
      {section.items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-line bg-surface p-4">
          <label htmlFor={`s-${item.id}`} className="mb-2 block font-medium">{item.text}</label>
          <textarea
            id={`s-${item.id}`}
            value={value[item.id] ?? ''}
            maxLength={400}
            onChange={(e) => onChange({ ...value, [item.id]: e.target.value })}
            className="min-h-20 w-full resize-y rounded-xl border border-line bg-bg px-3 py-2 focus:border-accent focus:outline-none"
            placeholder={item.placeholder ?? 'A sentence or four, in your own words…'}
          />
          <p className="mt-1 text-right text-xs text-muted">{(value[item.id] ?? '').length}/400</p>
        </div>
      ))}
    </div>
  )
}

function Interests({ section, value, onChange }) {
  const [custom, setCustom] = useState('')
  const picked = value.interests
  const has = (name) => picked.some((i) => i.name === name)
  const toggle = (name) => onChange({ interests: has(name) ? picked.filter((i) => i.name !== name) : [...picked, { name, intensity: 'into_it' }] })
  const setIntensity = (name, intensity) => onChange({ interests: picked.map((i) => (i.name === name ? { ...i, intensity } : i)) })
  const add = (e) => {
    e.preventDefault()
    const name = custom.trim().toLowerCase()
    if (name && !has(name)) onChange({ interests: [...picked, { name, intensity: 'into_it' }] })
    setCustom('')
  }
  const all = [...new Set([...section.suggestions, ...picked.map((i) => i.name)])]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {all.map((name) => <Chip key={name} selected={has(name)} onClick={() => toggle(name)}>{name}</Chip>)}
      </div>
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="custom-interest" className="sr-only">Add your own interest</label>
        <input id="custom-interest" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} placeholder="Add your own…" className="flex-1 rounded-full border border-line bg-surface px-4 py-2 focus:border-accent focus:outline-none" />
        <Button type="submit" variant="secondary" disabled={!custom.trim()}>Add</Button>
      </form>
      {picked.length > 0 && (
        <ul className="space-y-2">
          {picked.map((i) => (
            <li key={i.name} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5">
              <span className="font-medium capitalize">{i.name}</span>
              <Segmented size="sm" label={`How into ${i.name}`} value={i.intensity} options={section.intensities} onChange={(v) => setIntensity(i.name, v)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** What the agent is picking up from the replies so far (the design's learning panel). Code only, no LLM. */
function learned(replies) {
  const texts = Object.values(replies ?? {}).map((t) => String(t ?? '').trim()).filter(Boolean)
  if (texts.length < 2) return []
  const words = texts.map((t) => t.split(/\s+/).length).sort((a, b) => a - b)
  const median = words[Math.floor(words.length / 2)]
  const emojis = texts.join(' ').match(/\p{Extended_Pictographic}/gu) ?? []
  const laugh = texts.join(' ').toLowerCase().match(/\b(ha(ha)+|he(he)+|lol|lmao)\b/)
  const lower = texts.filter((t) => /^[a-z]/.test(t)).length / texts.length
  const hindi = texts.join(' ').toLowerCase().match(/\b(yaar|haan|nahi|kya|accha|acha|bas|thoda|bhi|hai|mujhe|kal)\b/g) ?? []
  const top = Object.entries(emojis.reduce((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([e]) => e).join(' ')
  return [
    ['Reply length', median < 10 ? `short, about ${median} words` : median < 20 ? `medium, about ${median} words` : `long, about ${median} words`],
    ['Emojis', emojis.length ? top : 'rarely'],
    laugh && ['Laughs', `“${laugh[0]}”`],
    hindi.length >= 2 && ['Mixes Hindi and English', 'now and then'],
    lower >= 0.7 && ['Starts in lowercase', 'most of the time'],
  ].filter(Boolean)
}

function StyleSamples({ section, value, onChange }) {
  const notes = learned(value)
  return (
    <div className="onb-style">
      <div className="onb-chat">
        {section.items.map((item, i) => (
          <div key={item.id} className="onb-pair">
            {item.prompt ? <span className="onb-from small">{item.text}</span> : <><span className="onb-from small">A match might send you · {i + 1} of {section.items.length}</span><div className="b them">{item.text}</div></>}
            <label htmlFor={`e-${item.id}`} className="sr-only">Your reply to: {item.text}</label>
            <textarea id={`e-${item.id}`} rows={1} value={value[item.id] ?? ''} maxLength={400} className="b you onb-reply"
              onChange={(e) => onChange({ ...value, [item.id]: e.target.value })} placeholder="Type it like you would…" />
          </div>
        ))}
      </div>
      <aside className="onb-side"><div className="card">
        <h3 className="t-h3">What your agent is learning</h3>
        <p className="small">From your replies so far. You can correct anything later in This is you.</p>
        <ul className="learn">{(notes.length ? notes : [['How you text', 'Still learning']]).map(([k, v]) => <li key={k} className={notes.length ? 'on' : ''}><span><b>{k}</b><em>{v}</em></span></li>)}</ul>
        <p className="privacy-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" />Your replies are used only to learn how you write. You’ll review everything before your agent uses it.</p>
      </div></aside>
    </div>
  )
}

const SECTION_UI = { identity: Identity, likert: Likert, choice_importance: ChoiceImportance, text: Stories, interests: Interests, style: StyleSamples }

function Processing({ onDone, onFailed }) {
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const { data } = await api.get('/api/onboarding/status')
        if (data.status === 'done') onDone()
        if (data.status === 'failed') onFailed()
      } catch { /* keep polling */ }
    }, 2000)
    return () => clearInterval(t)
  }, [onDone, onFailed])

  return (
    <div className="st-center onb-processing" role="status">
      <Typing label="Your agent is getting to know you" />
      <h1 className="t-h2">Your agent is getting to know you</h1>
      <p className="t-body muted">Turning your answers into a private map of who you are, and learning how you text. This usually takes under a minute.</p>
    </div>
  )
}

export default function Onboarding() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const draftKey = `onboarding-draft:${user._id}`
  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState(() => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(draftKey)) } } catch { return EMPTY }
  })
  const [submitting, setSubmitting] = useState(false)
  const [processing, setProcessing] = useState(user.onboarding?.status === 'processing')

  const load = useCallback(() => {
    setError(null)
    api.get('/api/onboarding/questions').then((r) => setQuestions(r.data)).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(load, [load])
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify(answers)) }, [answers, draftKey])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [step])

  const onDone = useCallback(async () => {
    localStorage.removeItem(draftKey)
    await refresh()
    navigate('/onboarding/review', { replace: true })
  }, [draftKey, refresh, navigate])
  const onFailed = useCallback(() => {
    setProcessing(false)
    setError('Something went wrong while building your profile. Your answers are saved; please submit again.')
  }, [])

  if (user.onboarding?.status === 'done' && !processing) return <Navigate to="/onboarding/review" replace />

  const sections = questions?.sections ?? []
  const section = sections[step]
  const hint = section && missing(section, answers)
  const last = step === sections.length - 1

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await api.post('/api/onboarding/submit', { answers })
      if (data.status === 'done') return onDone() // plan 30 S1: phase 1 is ready at once; stories keep loading in the background
      setProcessing(true)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSubmitting(false)
    }
  }

  const SectionUI = section && SECTION_UI[section.type]

  return (
    <div className="scr onb-page">
      <header className="onb-top">
        <span className="wordmark sm">Prelude</span>
        {!processing && sections.length > 0 && (
          <div className="onb-prog" aria-label={`Step ${step + 1} of ${sections.length}: ${section?.title ?? ''}`}>
            <span className="small">Step {step + 1} of {sections.length} · {section?.title}</span>
            <div className="segs" style={{ gridTemplateColumns: `repeat(${sections.length}, 1fr)` }}>{sections.map((x, i) => <i key={x.id} className={i < step ? 'done' : i === step ? 'now' : ''} />)}</div>
          </div>
        )}
        <span className="small onb-saved">{processing ? '' : 'Draft saved on this device'}</span>
      </header>

      <main className="onb-body">
        {processing ? (
          <Processing onDone={onDone} onFailed={onFailed} />
        ) : !questions ? (
          error ? <ErrorBox message={error} onRetry={load} /> : <Loading label="Loading questions…" />
        ) : (
          <div key={section.id} className="animate-rise">
            <h1 className="t-h1">{section.title}</h1>
            <p className="t-lead onb-intro">{section.intro}</p>
            <SectionUI section={section} value={answers[section.id]} onChange={(v) => setAnswers((a) => ({ ...a, [section.id]: v }))} />
            {error && <div style={{ marginTop: 16 }}><ErrorBox message={error} /></div>}
          </div>
        )}
      </main>

      {!processing && section && (
        <footer className="onb-foot">
          <div className="onb-foot-in">
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>Back</Button>
            <span className="small onb-hint" aria-live="polite">{hint ?? ''}</span>
            {last
              ? <Button onClick={submit} loading={submitting} disabled={Boolean(hint)}>Finish</Button>
              : <Button onClick={() => setStep((s) => s + 1)} disabled={Boolean(hint)}>Next</Button>}
          </div>
        </footer>
      )}
    </div>
  )
}
