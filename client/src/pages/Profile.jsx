// Plan 30 S3.2 profile editor (design: People.jsx#Editor): a completeness meter (steps, never a percentage), photos,
// 3 prompts, basics, and a live "how others see you" preview. Saving rebuilds the gate and re-runs the self-check.
// Plan 32 KP2: lifestyle basics are my section-B answers (one source of truth); the switch only hides them.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { Btn, Chips, Field, Input, Shell, Toggle, photoOf } from '../components/r7'
import PhotoGrid, { usePhotos } from '../components/PhotoGrid'
import PhotoNudge from '../components/PhotoNudge'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { Prompts } from './Onboarding'

const LANGS = ['english', 'hindi', 'gujarati', 'marathi', 'tamil', 'telugu', 'kannada', 'bengali', 'punjabi', 'malayalam']
const cap = (s) => s[0].toUpperCase() + s.slice(1)

function Meter({ parts, onGo }) {
  const n = parts.filter((d) => d[1]).length
  const next = parts.filter((d) => !d[1]).slice(0, 2)
  return (
    <section className="meter card" aria-label={`Profile: ${n} of ${parts.length} parts done`}>
      <div className="mt-h"><b>Your profile: {n} of {parts.length} done</b><span className="small">Complete profiles get more thoughtful likes.</span></div>
      <div className="mt-bar" style={{ gridTemplateColumns: `repeat(${parts.length}, 1fr)` }}>{parts.map(([k, d]) => <i key={k} className={d ? 'on' : ''} title={k} />)}</div>
      {next.length > 0 && <p className="small">Next: {next.map(([k, , go], i) => <span key={k}>{i > 0 && ' · '}<button type="button" className="link" onClick={() => onGo(go)}>{k.toLowerCase()}</button></span>)}</p>}
    </section>
  )
}

export default function Profile() {
  const { profile, refresh } = useAuth()
  const mobile = useMobile()
  const navigate = useNavigate()
  const toast = useToast()
  const { photos, setPhotos } = usePhotos()
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const [basics, setBasics] = useState(null) // [{ attr, text, options, answer, shown }]
  const [basics0, setBasics0] = useState(null)
  useEffect(() => { api.get('/api/profile/basics').then((r) => { setBasics(r.data.basics); setBasics0(r.data.basics) }).catch(() => {}) }, [])
  useEffect(() => {
    if (profile && !f) setF({ job: profile.job ?? '', workplace: profile.workplace ?? '', education: profile.education ?? '', height: profile.height ?? '', languages: profile.languages ?? [], bio: profile.bio ?? '', prompts: (profile.prompts ?? []).slice(0, 3) })
  }, [profile, f])
  const ready = Boolean(f)
  useEffect(() => { if (ready && window.location.hash === '#photos') document.getElementById('ed-photos')?.scrollIntoView({ behavior: 'smooth' }) }, [ready]) // /profile#photos (UX P0-1)
  if (!f) return <Shell title="Edit profile" back />

  const ok = (photos ?? []).filter((p) => p.status === 'ok')
  const parts = [
    ['Photos', ok.length >= 2, 'photos'], ['Prompts', f.prompts.filter((p) => p.a.trim()).length >= 3, 'prompts'], ['Basics', Boolean(f.job.trim() && f.languages.length), 'basics'],
    ['Interests', (profile.tags?.interests?.length ?? 0) >= 3, 'interests'],
  ]
  const go = (k) => (k === 'interests' ? navigate('/you') : document.getElementById(`ed-${k}`)?.scrollIntoView({ behavior: 'smooth' }))
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function save() {
    setBusy(true)
    try {
      await api.put('/api/profile', { job: f.job.trim(), workplace: f.workplace.trim(), education: f.education.trim(), height: f.height.trim(), languages: f.languages, bio: f.bio.trim(), prompts: f.prompts.filter((p) => p.a.trim()).map((p) => ({ q: p.q, a: p.a.trim() })) })
      if (basics && JSON.stringify(basics) !== JSON.stringify(basics0)) {
        const answers = Object.fromEntries(basics.filter((b, i) => b.answer && b.answer !== basics0[i].answer).map((b) => [b.attr, b.answer]))
        const { data } = await api.put('/api/profile/basics', { answers, hidden: basics.filter((b) => !b.shown).map((b) => b.attr) })
        setBasics(data.basics); setBasics0(data.basics)
      }
      await refresh()
      toast('Saved. Your profile is checked again in the background.')
    } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(false) }
  }
  const prev = { ...profile, ...f, photos: ok.map((p) => p.url) }
  const sections = (
    <div className="ed-sections">
      <PhotoNudge />
      <Meter parts={parts} onGo={go} />
      <section className="ed-sec" id="ed-photos"><div className="ed-h"><h2 className="h3">Photos</h2><span className="small">Drag to reorder</span></div>
        {photos && <PhotoGrid photos={photos} setPhotos={setPhotos} onError={(m) => toast(m, { tone: 'bad' })} />}</section>
      <section className="ed-sec" id="ed-prompts"><div className="ed-h"><h2 className="h3">Prompts</h2><span className="small">{f.prompts.length} of 3</span></div>
        <Prompts value={f.prompts} onChange={(prompts) => setF({ ...f, prompts })} /></section>
      <section className="ed-sec" id="ed-basics"><div className="ed-h"><h2 className="h3">Basics</h2></div>
        <Field label="What do you do?">{(id) => <Input id={id} value={f.job} onChange={set('job')} maxLength={120} />}</Field>
        <Field label="Where do you work?" optional>{(id) => <Input id={id} value={f.workplace} onChange={set('workplace')} maxLength={120} />}</Field>
        <Field label="Education" optional>{(id) => <Input id={id} value={f.education} onChange={set('education')} maxLength={120} />}</Field>
        <Field label="Height" optional>{(id) => <Input id={id} value={f.height} onChange={set('height')} maxLength={20} placeholder="e.g. 5′10″" />}</Field>
        <div className="field"><span className="lbl">Languages you speak</span><Chips multi items={[...new Set([...LANGS, ...f.languages])].map((l) => [l, cap(l)])} value={f.languages} onChange={(languages) => setF({ ...f, languages })} label="Languages" /></div>
        <Field label="About you" optional hint={`${500 - f.bio.length} characters left.`}>{(id) => <textarea id={id} className="ta" rows={3} maxLength={500} value={f.bio} onChange={set('bio')} />}</Field>
      </section>
      {basics && <section className="ed-sec" id="ed-lifestyle"><div className="ed-h"><h2 className="h3">Lifestyle basics</h2></div>
        <p className="small">These are your answers from onboarding. Changing one here changes it everywhere: your profile, your agent and who you’re shown to.</p>
        {basics.map((b, i) => (
          <div key={b.attr} className="vq-row ed-basic">
            <span className="lbl">{b.text}</span>
            <Chips items={b.options.map((o) => [o.value, o.label])} value={b.answer} label={b.text} onChange={(answer) => setBasics(basics.map((x, k) => (k === i ? { ...x, answer } : x)))} />
            <label className="ed-show"><Toggle on={b.shown} onChange={(shown) => setBasics(basics.map((x, k) => (k === i ? { ...x, shown } : x)))} label={`Show on my profile: ${b.text}`} /><span>Show on my profile</span></label>
          </div>
        ))}
      </section>}
      <div className="ed-save"><Btn size="lg" block={mobile} onClick={save} loading={busy}>Save changes</Btn></div>
    </div>
  )
  if (mobile) return <Shell title="Edit profile" back right={<Btn kind="ghost" size="sm" icon={Eye} onClick={() => navigate(`/u/${profile.userId}`)}>Preview</Btn>}><div className="pad">{sections}</div></Shell>
  return (
    <Shell>
      <div className="ed-wrap">
        <div><h1 className="h1">Edit profile</h1>{sections}</div>
        <aside className="ed-prev" aria-label="How others see you"><p className="small">How others see you</p>
          {!ok.length && <p className="prev-note small" role="note">No approved photo yet. Others see this placeholder.</p>}
          <div className="prev-card card"><img src={photoOf(prev, 0, 'portrait')} alt="" /><div className="pc-b">
            <b className="pc-n">{prev.name}{prev.age ? `, ${prev.age}` : ''}</b><span className="small">{[prev.job, prev.city].filter(Boolean).join(' · ')}</span>
            {prev.prompts[0]?.a && <><p className="pq">{prev.prompts[0].q}</p><p className="pa sm">{prev.prompts[0].a}</p></>}
          </div></div>
        </aside>
      </div>
    </Shell>
  )
}
