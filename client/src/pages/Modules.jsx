// Plan 33 Q2: "Teach your agent more" as the module list with a brain-strength meter (/teach), one module at a time
// (/teach/m/:id), and "Your world right now" as the required last onboarding step (/onboarding/world).
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Check, Lock, MessagesSquare, Smartphone } from 'lucide-react'
import BrainMeter from '../components/BrainMeter'
import ModuleRunner from '../components/ModuleRunner'
import OnbShell from '../components/OnbShell'
import { ErrorBox, Loading } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { errMsg } from '../lib/api'
import { answeredCount, cleanAnswers, saveModule, useModules } from '../lib/modules'

export const WORLD_MIN = 3 // "Your world right now" is required: at least this many of its 12 questions (UX P0-3: was 6)

/** Draft kept on this device while answering (save as you go). */
function useDraft(key, initial) {
  const [v, setV] = useState(() => { try { return { ...initial, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return initial } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private mode */ } }, [key, v])
  return [v, setV, () => { try { localStorage.removeItem(key) } catch { /* ignore */ } }]
}

/** The module list: brain meter, then every module with its progress. Also used on Welcome and This is you. */
/** limit: show only that many suggested (not yet done) modules, for Welcome and This is you (UX P0-3). */
export function ModuleList({ data, compact, limit }) {
  const navigate = useNavigate()
  const extra = [['/teach/replies', MessagesSquare, '10 more replies', 'Helps your agent get your humour right.'], ['/teach/texting', Smartphone, 'How you text', 'Emoji, short bursts, capitals.']]
  return (
    <div className="mods">
      <BrainMeter strength={data.strength} compact={compact} />
      <div className="teach">
        {(limit ? data.modules.filter((m) => !m.progress?.done).slice(0, limit) : data.modules).map((m) => {
          const n = answeredCount(m, data.answers[m.id], data.fromStories)
          return (
            <button key={m.id} type="button" className={`teach-c card mod-c ${m.progress?.done ? 'done' : ''}`} onClick={() => navigate(`/teach/m/${m.id}`)}>
              <b>{m.title}{m.progress?.done && <Check size={16} strokeWidth={2.2} aria-label="done" />}</b>
              <span>{m.id === 'R' && <Lock size={12} strokeWidth={2.2} aria-hidden="true" />} {n ? `${n} of ${m.questions.length} answered` : `About ${m.minutes} minutes`}{m.required ? ' · needed' : ''}</span>
              <i className="mod-bar" aria-hidden="true"><i style={{ width: `${(n / m.questions.length) * 100}%` }} /></i>
            </button>
          )
        })}
        {!compact && extra.map(([to, I, t, d]) => (
          <button key={to} type="button" className="teach-c card" onClick={() => navigate(to)}><I size={20} strokeWidth={1.7} aria-hidden="true" /><b>{t}</b><span>{d}</span></button>
        ))}
      </div>
    </div>
  )
}

export function TeachModules() {
  const navigate = useNavigate()
  const { data, error, load } = useModules()
  if (!data) return error ? <div className="st-center"><ErrorBox message={error} onRetry={load} /></div> : <Loading />
  return (
    <OnbShell label="Teach your agent more" title="Teach your agent more" sub="Each module gives your agent things to really talk about. Do any, in any order; skip any question." onBack={() => navigate(-1)} next="Done" onNext={() => navigate('/you')}>
      <ModuleList data={data} />
    </OnbShell>
  )
}

/** One module, its answers merged with what's saved; Save builds only this module. */
function ModulePage({ data, id, step, onSaved, required }) {
  const toast = useToast()
  const mod = data.modules.find((m) => m.id === id)
  const [value, setValue, clearDraft] = useDraft(`module:${id}`, data.answers[id] ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const n = useMemo(() => (mod ? answeredCount(mod, value, data.fromStories) : 0), [mod, value, data.fromStories])
  if (!mod) return <Navigate to="/teach" replace />
  async function save() {
    setBusy(true); setError(null)
    try {
      await saveModule(id, cleanAnswers(mod, value))
      clearDraft()
      toast(`Saved. Your agent can now talk about ${mod.talksAbout}.`)
      onSaved()
    } catch (err) { setError(errMsg(err)); setBusy(false) }
  }
  const firstOpen = mod.questions.find((q) => !value[q.id] || (Array.isArray(value[q.id]) && !value[q.id].length))
  return (
    <OnbShell step={step} label="Teach your agent more" title={mod.title} sub={mod.intro} minutesLeft={undefined}
      onBack={step ? undefined : () => window.history.back()} next={step ? 'Save and continue' : 'Save'} nextLoading={busy} onNext={save}
      missing={required && n < required ? { text: `Answer at least ${required} (${n} so far)`, target: firstOpen && `mq-card-${firstOpen.id}` } : !n ? { text: 'Answer at least one to save' } : null}>
      <p className="small mr-count" aria-live="polite">{n} of {mod.questions.length} answered · skip anything</p>
      <ModuleRunner mod={mod} value={value} onChange={setValue} fromStories={data.fromStories} />
      {error && <ErrorBox message={error} />}
    </OnbShell>
  )
}

export function TeachModule() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, load } = useModules()
  if (!data) return error ? <div className="st-center"><ErrorBox message={error} onRetry={load} /></div> : <Loading />
  return <ModulePage data={data} id={id} onSaved={() => navigate('/teach')} />
}

/** Onboarding step 6 (A1): the core + "Your world right now" before the agent starts chatting. */
export function WorldStep() {
  const navigate = useNavigate()
  const { data, error, load } = useModules()
  if (!data) return error ? <div className="st-center"><ErrorBox message={error} onRetry={load} /></div> : <Loading />
  return <ModulePage data={data} id="W" step={6} required={WORLD_MIN} onSaved={() => navigate('/welcome')} />
}
