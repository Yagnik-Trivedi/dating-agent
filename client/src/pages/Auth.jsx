// Sign up / log in, in the Prelude design language (the design has no auth screen; same tokens, type and buttons).
// Sign-up collects the basics (plan 15 stage 1: age, gender, interested in, city) and the required AI-agent consent.
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Btn } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'

export const CONSENT_TEXT = 'Early conversations with your matches may be handled by AI agents, including yours.'
const CITIES = ['Ahmedabad', 'Bengaluru', 'Delhi', 'Mumbai', 'Pune']
const GENDERS = [['woman', 'Woman'], ['man', 'Man'], ['nonbinary', 'Non-binary']]

function Shell({ title, subtitle, children }) {
  return (
    <div className="scr auth">
      <Link to="/" className="wordmark auth-mark">Prelude</Link>
      <div className="card auth-card">
        <h1 className="t-h1">{title}</h1>
        <p className="t-lead auth-sub">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}
const Field = ({ label, hint, id, ...p }) => (
  <label className="field" htmlFor={id}><span className="field-l">{label}</span><input id={id} className="input" {...p} />{hint && <span className="small">{hint}</span>}</label>
)
function Choice({ label, options, value, onChange, multi }) {
  const on = (v) => (multi ? value.includes(v) : value === v)
  const pick = (v) => onChange(multi ? (on(v) ? value.filter((x) => x !== v) : [...value, v]) : v)
  return (
    <fieldset className="field"><legend className="field-l">{label}</legend>
      <div className="seg wide" role={multi ? 'group' : 'radiogroup'}>{options.map(([v, l]) => <button type="button" key={v} role={multi ? 'checkbox' : 'radio'} aria-checked={on(v)} className={on(v) ? 'on' : ''} onClick={() => pick(v)}>{l}</button>)}</div>
    </fieldset>
  )
}

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', age: '', gender: '', interestedIn: [], city: '', consentAgent: false })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const ready = form.name && form.email && form.password.length >= 8 && Number(form.age) >= 18 && form.gender && form.interestedIn.length && form.city && form.consentAgent

  async function submit(e) {
    e.preventDefault()
    if (!form.consentAgent) return setError('Please tick the consent box to continue.')
    if (Number(form.age) < 18) return setError('You need to be 18 or older.')
    setBusy(true)
    setError(null)
    try {
      await signup({ name: form.name, email: form.email, password: form.password, consentAgent: true })
      await api.put('/api/profile', { name: form.name, age: Number(form.age), gender: form.gender, interestedIn: form.interestedIn, city: form.city })
      navigate('/onboarding')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Start with you" subtitle="A few basics now. Next, a short questionnaire so your agent can sound like you.">
      <form onSubmit={submit} className="auth-form" noValidate>
        <Field id="su-name" label="First name" value={form.name} onChange={set('name')} autoComplete="given-name" required maxLength={60} />
        <Field id="su-email" label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <Field id="su-pass" label="Password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" hint="At least 8 characters" required minLength={8} />
        <div className="field-row">
          <Field id="su-age" label="Age" type="number" inputMode="numeric" min={18} max={100} value={form.age} onChange={set('age')} required />
          <label className="field" htmlFor="su-city"><span className="field-l">City</span>
            <select id="su-city" className="input" value={form.city} onChange={set('city')} required><option value="">Choose…</option>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <Choice label="I am" options={GENDERS} value={form.gender} onChange={set('gender')} />
        <Choice label="Interested in" options={GENDERS} value={form.interestedIn} onChange={set('interestedIn')} multi />
        <label className="consent">
          <input type="checkbox" checked={form.consentAgent} onChange={set('consentAgent')} required />
          <span><b>{CONSENT_TEXT}</b> Your agent writes the first messages in your words; you can read every line, pause it or take over at any time.</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Btn type="submit" size="lg" block loading={busy} disabled={!ready}>Create account</Btn>
        <p className="small auth-alt">Already have an account? <Link to="/login" className="text-link">Log in</Link></p>
        <p className="privacy-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" />Your agent never guesses your religion, caste or background from your name or photos.</p>
      </form>
    </Shell>
  )
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await login(form.email, form.password)
      navigate(user.onboarding?.status === 'done' ? location.state?.from ?? '/discover' : '/onboarding', { replace: true })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Welcome back" subtitle="Your agent kept the conversations warm.">
      <form onSubmit={submit} className="auth-form">
        <Field id="li-email" label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <Field id="li-pass" label="Password" type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <Btn type="submit" size="lg" block loading={busy}>Log in</Btn>
        <p className="small auth-alt">New here? <Link to="/signup" className="text-link">Create an account</Link></p>
      </form>
    </Shell>
  )
}
