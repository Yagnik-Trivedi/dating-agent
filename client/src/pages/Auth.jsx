// Sign up and log in (Round 7 Step 2 design, Auth.jsx). Sign-up is one call (plan 30 S0): basics with date of birth
// (18+), a searchable city (104 Indian cities, or Other), I am / interested in, and the required AI-agent consent.
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Mail, MapPin, Search } from 'lucide-react'
import { Btn, Check2, Chips, Field, IconBtn, Input, MBar, Seg, Wordmark } from '../components/r7'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { api, errMsg } from '../lib/api'
import { illustration } from '../lib/art'

export const CONSENT_TEXT = 'Early conversations with your matches may be handled by AI agents, including yours.'
const ageFrom = (dob) => {
  const [y, m, d] = dob.split('-').map(Number), now = new Date()
  return now.getFullYear() - y - ((now.getMonth() + 1) * 100 + now.getDate() < m * 100 + d ? 1 : 0)
}
const maxDob = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) }
export const INTEREST = { Women: ['woman'], Men: ['man'], Everyone: ['woman', 'man', 'nonbinary'] }

function AuthShell({ title, sub, children, back }) {
  const mobile = useMobile()
  if (mobile) return <div className="scr app-scr m auth">{back ? <MBar title="" back={back} /> : <header className="mbar"><Link to="/" aria-label="Prelude home"><Wordmark /></Link></header>}<div className="auth-body"><h1 className="h2">{title}</h1>{sub && <p className="lead sm">{sub}</p>}{children}</div></div>
  return (
    <div className="scr app-scr d auth">
      <aside className="auth-art"><Link to="/" aria-label="Prelude home"><Wordmark /></Link><img src={illustration('demo-meera', 'cafe')} alt="" /><p className="auth-q">“Real treks or Instagram treks?”<span>Written by Meera’s agent</span></p></aside>
      <main className="auth-main"><div className="auth-form"><h1 className="h1">{title}</h1>{sub && <p className="lead">{sub}</p>}{children}</div></main>
    </div>
  )
}

/** Searchable city combobox: the 104 listed cities, or any other city typed in (it then matches by name). */
export function CityBox({ value, onChange }) {
  const id = useId()
  const [cities, setCities] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  useEffect(() => { api.get('/api/cities').then(({ data }) => setCities(data.cities)).catch(() => {}) }, [])
  const q = value.trim().toLowerCase()
  const list = useMemo(() => (q ? cities.filter((c) => c.toLowerCase().includes(q)) : cities).slice(0, 5), [cities, q])
  const exact = cities.some((c) => c.toLowerCase() === q)
  const options = [...list, ...(q && !exact ? [`Other: “${value.trim()}”`] : [])]
  const choose = (i) => { const o = options[i]; if (!o) return; onChange(o.startsWith('Other: ') ? value.trim() : o); setOpen(false) }
  return (
    <Field label="City" id={id} hint={`${cities.length || 104} cities in India, or type yours`}>{(fid) => (
      <div className="combo">
        <Input id={fid} value={value} icon={Search} role="combobox" aria-expanded={open && options.length > 0} aria-controls={`${fid}-l`} aria-autocomplete="list"
          aria-activedescendant={open ? `${fid}-o${active}` : undefined} autoComplete="off" placeholder="Start typing your city"
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            if (e.key === 'Enter' && open && options.length) { e.preventDefault(); choose(active) }
            if (e.key === 'Escape') setOpen(false)
          }} />
        {open && options.length > 0 && (
          <ul className="combo-l" role="listbox" id={`${fid}-l`}>{options.map((c, i) => (
            <li key={c} id={`${fid}-o${i}`} role="option" aria-selected={i === active} className={`${i === active ? 'on' : ''} ${c.startsWith('Other: ') ? 'other' : ''}`} onMouseDown={(e) => { e.preventDefault(); choose(i) }}>
              {!c.startsWith('Other: ') && <MapPin size={15} strokeWidth={1.7} aria-hidden="true" />}{c}
            </li>
          ))}</ul>
        )}
      </div>
    )}</Field>
  )
}

export function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '', dob: '', gender: '', interested: [], city: '', consent: false })
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const ready = f.name && f.email && f.password.length >= 8 && f.dob && f.gender && f.interested.length && f.city.trim() && f.consent

  async function submit(e) {
    e.preventDefault()
    if (!f.consent) return setError('Please tick the consent box to continue.')
    if (ageFrom(f.dob) < 18) return setError('You need to be 18 or older to use Prelude.')
    setBusy(true); setError(null)
    try {
      const interestedIn = [...new Set(f.interested.flatMap((x) => INTEREST[x]))]
      await signup({ name: f.name, email: f.email, password: f.password, dob: f.dob, gender: f.gender, interestedIn, city: f.city.trim(), consentAgent: true })
      navigate('/onboarding')
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  return (
    <AuthShell title="Join Prelude" sub="It takes about five minutes to set up.">
      <form className="form" onSubmit={submit} noValidate>
        <div className="row2">
          <Field label="First name">{(id) => <Input id={id} value={f.name} onChange={set('name')} autoComplete="given-name" maxLength={60} required />}</Field>
          <Field label="Date of birth" hint="You must be 18 or older.">{(id) => <Input id={id} type="date" max={maxDob()} value={f.dob} onChange={set('dob')} required />}</Field>
        </div>
        <Field label="Email">{(id) => <Input id={id} type="email" icon={Mail} value={f.email} onChange={set('email')} autoComplete="email" required />}</Field>
        <Field label="Password" hint="At least 8 characters.">{(id) => <Input id={id} type={show ? 'text' : 'password'} icon={KeyRound} value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} required right={<IconBtn icon={show ? EyeOff : Eye} label={show ? 'Hide password' : 'Show password'} className="sm" onClick={() => setShow(!show)} />} />}</Field>
        <CityBox value={f.city} onChange={set('city')} />
        <div className="row2 stack">
          <div className="field"><span className="lbl">I am</span><Seg label="I am" value={f.gender} onChange={set('gender')} items={[['woman', 'A woman'], ['man', 'A man'], ['nonbinary', 'Non-binary']]} /></div>
          <div className="field"><span className="lbl">Interested in</span><Chips multi items={['Women', 'Men', 'Everyone']} value={f.interested} onChange={set('interested')} label="Interested in" /></div>
        </div>
        <div className="consent"><Check2 checked={f.consent} onChange={set('consent')} required><b>{CONSENT_TEXT}</b> Your agent writes the first messages in your words; you can read every line, pause it or take over any time. Both of you always see which messages an agent wrote.</Check2></div>
        {error && <p className="f-err" role="alert">{error}</p>}
        <Btn size="lg" block type="submit" loading={busy} disabled={!ready}>Create account</Btn>
        <p className="small center">Already have an account? <Link className="link" to="/login">Log in</Link></p>
      </form>
    </AuthShell>
  )
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [f, setF] = useState({ email: '', password: '' })
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const { user } = await login(f.email, f.password)
      navigate(user.onboarding?.status === 'done' ? location.state?.from ?? '/discover' : '/onboarding', { replace: true })
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }
  return (
    <AuthShell title="Log in" sub="Welcome back.">
      <form className="form" onSubmit={submit}>
        <Field label="Email">{(id) => <Input id={id} type="email" icon={Mail} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required />}</Field>
        <Field label="Password" error={error ?? undefined}>{(id) => <Input id={id} type={show ? 'text' : 'password'} icon={KeyRound} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required right={<IconBtn icon={show ? EyeOff : Eye} label={show ? 'Hide password' : 'Show password'} className="sm" onClick={() => setShow(!show)} />} />}</Field>
        <Btn size="lg" block type="submit" loading={busy}>Log in</Btn>
        <p className="small center">New here? <Link className="link" to="/signup">Join Prelude</Link></p>
      </form>
    </AuthShell>
  )
}
