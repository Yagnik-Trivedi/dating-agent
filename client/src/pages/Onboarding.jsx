import { useCallback, useEffect, useState } from 'react'
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

function StyleSamples({ section, value, onChange }) {
  return (
    <div className="space-y-5 rounded-3xl border border-line bg-surface p-4 sm:p-6">
      {section.items.map((item) => (
        <div key={item.id} className="space-y-2">
          {item.prompt
            ? <p className="text-sm italic text-muted">{item.text}</p>
            : <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5">{item.text}</p>}
          <div className="ml-auto max-w-[85%]">
            <label htmlFor={`e-${item.id}`} className="sr-only">Your reply to: {item.text}</label>
            <textarea
              id={`e-${item.id}`}
              rows={1}
              value={value[item.id] ?? ''}
              maxLength={400}
              onChange={(e) => onChange({ ...value, [item.id]: e.target.value })}
              placeholder="reply like you would…"
              className="block w-full resize-none rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-accent-ink placeholder:text-accent-ink/70 focus:outline-none focus:ring-2 focus:ring-accent/40 field-sizing-content"
            />
          </div>
        </div>
      ))}
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center" role="status">
      <div className="relative">
        <AgentIcon className="size-16" />
        <Spinner className="absolute -right-2 -bottom-2 size-6 text-agent" />
      </div>
      <h1 className="font-display text-2xl font-semibold">Your agent is getting to know you</h1>
      <p className="max-w-sm text-muted">Turning your answers into a private knowledge graph and learning how you text. This takes under a minute.</p>
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
      await api.post('/api/onboarding/submit', { answers })
      setProcessing(true)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSubmitting(false)
    }
  }

  const SectionUI = section && SECTION_UI[section.type]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          {!processing && sections.length > 0 && <span className="text-sm font-semibold text-muted">Step {step + 1} of {sections.length}</span>}
        </div>
        {!processing && sections.length > 0 && <div className="mx-auto max-w-2xl px-4 pb-3"><ProgressBar value={(step + (hint ? 0 : 1)) / sections.length} label="Onboarding progress" /></div>}
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
        {processing ? (
          <Processing onDone={onDone} onFailed={onFailed} />
        ) : !questions ? (
          error ? <ErrorBox message={error} onRetry={load} /> : <Loading label="Loading questions…" />
        ) : (
          <div key={section.id} className="animate-rise">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Section {section.id}</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">{section.title}</h1>
            <p className="mb-6 mt-2 text-muted">{section.intro}</p>
            <SectionUI section={section} value={answers[section.id]} onChange={(v) => setAnswers((a) => ({ ...a, [section.id]: v }))} />
            {error && <div className="mt-4"><ErrorBox message={error} /></div>}
          </div>
        )}
      </main>

      {!processing && section && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>Back</Button>
            <span className="truncate text-xs text-muted" aria-live="polite">{hint ?? 'Draft saved on this device'}</span>
            {last
              ? <Button onClick={submit} loading={submitting} disabled={Boolean(hint)}>Finish</Button>
              : <Button onClick={() => setStep((s) => s + 1)} disabled={Boolean(hint)}>Next</Button>}
          </div>
        </footer>
      )}
    </div>
  )
}
