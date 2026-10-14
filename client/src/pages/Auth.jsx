import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AgentRules, StepList } from '../components/HowItWorks'
import { Logo } from '../components/Layout'
import { Button, ErrorBox, Field, Modal } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { errMsg } from '../lib/api'

export const CONSENT_TEXT = 'Early conversations with your matches may be handled by AI agents, including yours.'

function Shell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <Link to="/" className="mb-8"><Logo /></Link>
      <div className="animate-rise w-full max-w-md rounded-[2rem] border border-line bg-surface p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', consentAgent: false })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.consentAgent) return setError('Please tick the consent box to continue.')
    setBusy(true)
    setError(null)
    try {
      await signup(form)
      navigate('/onboarding')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Create your agent" subtitle="It takes the first conversation so you don’t have to.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="First name" value={form.name} onChange={set('name')} autoComplete="given-name" required maxLength={60} />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <Field label="Password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" hint="At least 8 characters" required minLength={8} />

        <label className="flex cursor-pointer gap-3 rounded-2xl border border-line bg-agent-soft/60 p-4 text-sm">
          <input type="checkbox" checked={form.consentAgent} onChange={set('consentAgent')} className="mt-0.5 size-5 shrink-0 accent-[var(--agent)]" required />
          <span>
            {CONSENT_TEXT}{' '}
            <button type="button" onClick={() => setHowOpen(true)} className="font-semibold text-agent underline">How the agent works</button>
          </span>
        </label>

        {error && <ErrorBox message={error} />}
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!form.consentAgent}>Create account</Button>
        <p className="text-center text-sm text-muted">Already have an account? <Link to="/login" className="font-semibold text-accent">Log in</Link></p>
      </form>

      <Modal open={howOpen} onClose={() => setHowOpen(false)} title="How the agent works">
        <StepList compact />
        <AgentRules />
      </Modal>
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
    <Shell title="Welcome back" subtitle="Your agent kept things warm.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <Field label="Password" type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required />
        {error && <ErrorBox message={error} />}
        <Button type="submit" size="lg" className="w-full" loading={busy}>Log in</Button>
        <p className="text-center text-sm text-muted">New here? <Link to="/signup" className="font-semibold text-accent">Create an account</Link></p>
      </form>
    </Shell>
  )
}
