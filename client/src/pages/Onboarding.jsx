// Plan 30 S2 onboarding (Round 7 Step 2 design): 1 Basics · 2 Photos · 3 Prompts · 4 Lifestyle and values ·
// 5 How you reply → submit (the graph builds in the background) → 6 Your world right now (plan 33, required; Modules.jsx)
// → 7 Done (Welcome). The live check step was removed (owner, 2026-10-19). A step that isn't complete says what's missing
// and jumps to it (OnbShell `missing`). Plan 33: each value has an optional "say more"; the agree/disagree statements are
// not in the core (personality now comes from the modules' situation picks; old answers still count).
// "Teach your agent more" (/teach, Modules.jsx) is the module list; the old blocks here stay for replies and how you text.
// Plan 32 KP1: step 5 also asks "How do you usually text?" (taps, skippable) and records the device each reply is typed on.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Plus } from 'lucide-react'
import OnbShell from '../components/OnbShell'
import PhotoGrid, { usePhotos } from '../components/PhotoGrid'
import TeachCards from '../components/TeachCards'
import TextingStyle, { styleBody } from '../components/TextingStyle'
import { Chips, Composer, Field, IconBtn, Importance, Input, Seg, Toggle } from '../components/r7'
import { ErrorBox, Loading } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { emojiShortcut, typingDevice } from '../lib/device'
import { PROMPT_LIST, PROMPT_MAX } from '../lib/prompts'

const EMPTY = { I: { languages: [] }, B: {}, D: { interests: [] }, E: {} }
const sectionOf = (q, id) => q?.sections.find((s) => s.id === id)

function useQuestions() {
  const [q, setQ] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(() => { setError(null); api.get('/api/onboarding/questions').then((r) => setQ(r.data)).catch((e) => setError(errMsg(e))) }, [])
  useEffect(load, [load])
  return { q, error, load }
}

/* 1 · Basics */
function Basics({ q, value, onChange, interests, onInterests }) {
  const I = sectionOf(q, 'I'), D = sectionOf(q, 'D')
  const langOpts = [...new Set([...I.items.find((i) => i.id === 'languages').options.map((o) => o.label.toLowerCase()), ...value.languages])]
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  const [other, setOther] = useState('')
  return (
    <>
      <Field label="What do you do?" id="onb-job">{(id) => <Input id={id} value={value.job ?? ''} onChange={set('job')} maxLength={120} placeholder="e.g. Product designer" />}</Field>
      <Field label="Where do you work?" optional>{(id) => <Input id={id} value={value.workplace ?? ''} onChange={set('workplace')} maxLength={120} placeholder="e.g. A fintech startup" />}</Field>
      <Field label="Education" optional>{(id) => <Input id={id} value={value.education ?? ''} onChange={set('education')} maxLength={120} />}</Field>
      <div className="field" id="onb-languages"><span className="lbl">Languages you speak</span>
        <Chips multi items={langOpts.map((l) => [l, l[0].toUpperCase() + l.slice(1)])} value={value.languages} onChange={(languages) => onChange({ ...value, languages })} label="Languages" />
        <form className="row-add" onSubmit={(e) => { e.preventDefault(); const l = other.trim().toLowerCase(); if (l && !value.languages.includes(l)) onChange({ ...value, languages: [...value.languages, l] }); setOther('') }}>
          <Input aria-label="Another language" value={other} onChange={(e) => setOther(e.target.value)} maxLength={40} placeholder="Another language…" />
        </form>
      </div>
      <Field label="Height" optional hint="Only shown if you add it.">{(id) => <Input id={id} value={value.height ?? ''} onChange={set('height')} maxLength={20} placeholder="e.g. 5′10″" />}</Field>
      <div className="field"><span className="lbl">Things you’re into <em>· optional, helps your agent</em></span>
        <Chips multi items={[...new Set([...D.suggestions, ...interests.map((i) => i.name)])]} value={interests.map((i) => i.name)}
          onChange={(names) => onInterests(names.map((name) => interests.find((i) => i.name === name) ?? { name, intensity: 'into_it' }))} label="Interests" />
      </div>
    </>
  )
}

/* 3 · Prompts */
export function Prompts({ value, onChange }) {
  const [open, setOpen] = useState(value.length < 3 ? value.length : null)
  const used = value.map((p) => p.q)
  const setA = (i, a) => onChange(value.map((p, k) => (k === i ? { ...p, a } : p)))
  const choose = (i, q) => { onChange(i < value.length ? value.map((p, k) => (k === i ? { q, a: p.a } : p)) : [...value, { q, a: '' }]); setOpen(null) }
  return (
    <div className="pr-pick">
      {[0, 1, 2].map((i) => {
        const p = value[i]
        if (open === i || (!p && i === value.length)) return (
          <div key={i} id={`pr-slot-${i}`} className="pr-slot card open">
            <p className="pq"><Plus size={16} strokeWidth={2} aria-hidden="true" />{p ? 'Choose another prompt' : `Choose your ${['first', 'second', 'third'][i]} prompt`}</p>
            <ul className="pr-list" role="listbox" aria-label="Prompts">
              {PROMPT_LIST.filter((x) => !used.includes(x) || x === p?.q).map((x) => (
                <li key={x} role="option" aria-selected={x === p?.q} className={x === p?.q ? 'on' : ''} tabIndex={0}
                  onClick={() => choose(i, x)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose(i, x))}>{x}</li>
              ))}
            </ul>
          </div>
        )
        if (!p) return null
        return (
          <div key={i} id={`pr-slot-${i}`} className="pr-slot card">
            <p className="pq">{p.q}</p>
            <label className="sr-only" htmlFor={`pa-${i}`}>Your answer to “{p.q}”</label>
            <textarea id={`pa-${i}`} className="pa-in" rows={2} maxLength={PROMPT_MAX} value={p.a} onChange={(e) => setA(i, e.target.value)} placeholder="Say it the way you would out loud" />
            <span className="small pa-n">{p.a.length}/{PROMPT_MAX}</span>
            <IconBtn icon={Pencil} label={`Change the prompt “${p.q}”`} className="sm" onClick={() => setOpen(i)} />
          </div>
        )
      })}
    </div>
  )
}

/* 4 · Lifestyle and values: every question can be skipped; an answered one needs its importance. */
function ValueQ({ item, v, onChange }) {
  const all = item.options.map((o) => o.value)
  const opts = item.options.map((o) => [o.value, o.label])
  const set = (patch) => onChange({ ...v, ...patch })
  // UX P0-3: importance starts at "Somewhat" and is never required; partner filters stay hidden behind "Dealbreaker for me".
  const ruledOut = v?.dealbreaker ? all.filter((o) => !(v.accepts ?? all).includes(o)) : []
  return (
    <section className="vq card" id={`vq-${item.id}`} aria-label={item.text}>
      <h2 className="h3">{item.text}</h2>
      <div className="vq-row"><span className="lbl">You</span><Chips items={opts} value={v?.answer ?? null} onChange={(answer) => set({ answer, importance: v?.importance ?? 'medium' })} label={`${item.text}: you`} /></div>
      {v?.answer && <>
        <div className="vq-row"><span className="lbl">How important is this?</span><Importance value={v.importance ?? 'medium'} onChange={(importance) => set({ importance })} /></div>
        <label className="vq-deal"><Toggle on={Boolean(v.dealbreaker)} onChange={(on) => set({ dealbreaker: on, accepts: undefined })} label={`Dealbreaker for me: ${item.text}`} /><span><b>Dealbreaker for me</b> · Never show me people who answer differently</span></label>
        {v.dealbreaker && <div className="vq-row"><span className="lbl">Rule out matches who answer:</span>
          <Chips multi items={opts} value={ruledOut} onChange={(out) => out.length < all.length && set({ accepts: all.filter((o) => !out.includes(o)) })} label={`${item.text}: rule out`} /></div>}
        {item.more && <details className="vq-more" open={Boolean(v.more)}><summary>Say more <span className="small">· optional</span></summary>
          <Field label={item.more.text} optional>{(id) => item.more.type === 'story'
            ? <textarea id={id} className="ta" rows={3} maxLength={600} value={v.more ?? ''} onChange={(e) => set({ more: e.target.value })} placeholder="Say more, in your own words" />
            : <Input id={id} value={v.more ?? ''} onChange={(e) => set({ more: e.target.value })} maxLength={300} placeholder="Say more, in your own words" />}</Field></details>}
      </>}
    </section>
  )
}
const valuesMissing = (B, section) => {
  const bad = section.items.find((i) => B[i.id]?.dealbreaker && (B[i.id].accepts ?? i.options).length >= i.options.length)
  return bad ? { text: `“${bad.text}”: pick at least one answer to rule out, or turn the dealbreaker off`, target: `vq-${bad.id}` } : null
}

/* 5 · How you reply: one message at a time, like a chat. Tap a reply to change it.
   UX P0-6: Enter adds a bubble; the turn moves on after a pause (BURST_GAP_MS) or "Done". A reply's bubbles are
   stored one per line; the server keeps each as its own sample and counts the extra ones as a burst. */
const BURST_GAP_MS = 2200
function Replies({ items, value, onChange }) {
  const firstOpen = items.findIndex((i) => !value[i.id]?.trim())
  const [at, setAt] = useState(firstOpen < 0 ? items.length : firstOpen)
  const [draft, setDraft] = useState('')
  const [bubbles, setBubbles] = useState([])
  const timer = useRef(null)
  const latest = useRef({ value, at })
  useEffect(() => { latest.current = { value, at } })
  useEffect(() => () => clearTimeout(timer.current), [])
  const commit = (bs) => {
    clearTimeout(timer.current)
    const { value: v, at: i } = latest.current
    if (!bs.length || i >= items.length) return
    const next = { ...v, [items[i].id]: bs.join('\n') }
    onChange(next); setBubbles([]); setDraft('')
    const open = items.findIndex((x) => !next[x.id]?.trim())
    setAt(open < 0 ? items.length : open)
  }
  const wait = (bs) => { clearTimeout(timer.current); if (bs.length) timer.current = setTimeout(() => commit(bs), BURST_GAP_MS) }
  const send = () => { const bs = [...bubbles, draft.trim()]; setBubbles(bs); setDraft(''); wait(bs) }
  // Typing holds the turn open; an empty box after a pause moves on.
  const type = (t) => { setDraft(t); if (t.trim()) clearTimeout(timer.current); else wait(bubbles) }
  const drop = (k) => { const bs = bubbles.filter((_, j) => j !== k); setBubbles(bs); wait(bs) }
  const lines = (t) => String(t ?? '').split('\n').filter((x) => x.trim())
  return (
    <div className="replies" id="onb-replies" aria-live="polite">
      {items.map((it, i) => (i <= at || value[it.id]) && (
        <div key={it.id} className="rp">
          <p className="bubble theirs-b">{it.text}</p>
          {i !== at && value[it.id] && <button type="button" className="rp-mine" onClick={() => { clearTimeout(timer.current); setAt(i); setBubbles(lines(value[it.id])); setDraft('') }} aria-label={`Your reply: ${lines(value[it.id]).join(' / ')}. Change it`}>
            {lines(value[it.id]).map((b, k) => <span key={k} className="bubble mine-b">{b}</span>)}
          </button>}
          {i === at && bubbles.map((b, k) => <button type="button" key={k} className="bubble mine-b" onClick={() => drop(k)} aria-label={`${b}. Remove this message`}>{b}</button>)}
        </div>
      ))}
      {at < items.length
        ? <>
          <p className="small rp-n">Message {at + 1} of {items.length}{bubbles.length ? ' · Enter adds another bubble, or pause to move on' : ''}</p>
          <Composer value={draft} onChange={type} onSend={send} placeholder={bubbles.length ? 'Add another message…' : 'Type it the way you would…'} />
          {bubbles.length > 0 && <button type="button" className="link rp-done" onClick={() => commit(draft.trim() ? [...bubbles, draft.trim()] : bubbles)}>Done</button>}
        </>
        : <p className="small rp-n">All {items.length} done. Tap a reply to change it.</p>}
    </div>
  )
}

/** Plan 32 KP1: on a computer keyboard people type plainer than on their phone. */
const DesktopHint = () => typingDevice() === 'desktop' && (
  <p className="small tstyle-hint">Type like you do on your phone. Emoji picker: <kbd>{emojiShortcut()}</kbd></p>
)
const devicesFor = (ids) => { const d = typingDevice(); return Object.fromEntries(ids.map((id) => [id, d])) }

/** The quick build didn't finish in the submit request: wait for the job (it rarely takes long). */
function Processing({ onDone }) {
  useEffect(() => {
    const t = setInterval(() => api.get('/api/onboarding/status').then((r) => r.data.status !== 'processing' && onDone()).catch(() => {}), 2000)
    return () => clearInterval(t)
  }, [onDone])
  return <OnbShell label="Almost there" title="Getting your profile ready" sub="Your agent is reading your answers. This takes a few seconds." footer={false}><Loading label="Getting your profile ready" /></OnbShell>
}

export default function Onboarding() {
  const { user, profile, refresh } = useAuth()
  const { q, error: qError, load } = useQuestions()
  const key = `onboarding-v2:${user._id}`
  const saved = (() => { try { return JSON.parse(localStorage.getItem(key)) ?? {} } catch { return {} } })()
  const [step, setStep] = useState(saved.step ?? 1)
  const [answers, setAnswers] = useState({ ...EMPTY, ...saved.answers })
  const [prompts, setPrompts] = useState(saved.prompts ?? profile?.prompts?.slice(0, 3) ?? [])
  const [style, setStyle] = useState(saved.style ?? {})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dest, setDest] = useState(null)
  const { photos, setPhotos } = usePhotos()

  useEffect(() => { try { localStorage.setItem(key, JSON.stringify({ step, answers, prompts, style })) } catch { /* private mode */ } }, [key, step, answers, prompts, style])
  useEffect(() => { window.scrollTo({ top: 0 }); setError(null) }, [step])

  if (user.onboarding?.status === 'done') return <Navigate to={dest ?? '/discover'} replace state={{ onb: Boolean(dest) }} />
  if (user.onboarding?.status === 'processing') return <Processing onDone={refresh} />
  if (!q) return qError ? <div className="st-center"><ErrorBox message={qError} onRetry={load} /></div> : <Loading label="Loading…" />

  const set = (id) => (v) => setAnswers((a) => ({ ...a, [id]: v }))
  const B = sectionOf(q, 'B')
  const core = sectionOf(q, 'E').items.filter((i) => q.coreReplyIds.includes(i.id))
  const usable = (photos ?? []).filter((p) => p.status !== 'rejected').length
  const back = step > 1 ? () => setStep(step - 1) : undefined

  async function next(save) {
    setBusy(true); setError(null)
    try { await save?.(); setStep(step + 1) } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }
  async function submit() {
    setBusy(true); setError(null)
    try {
      const B2 = Object.fromEntries(Object.entries(answers.B).filter(([, v]) => v?.answer).map(([k, v]) => [k, { ...v, importance: v.importance ?? 'medium', more: v.more?.trim() || undefined }]))
      // The self-report first, so the build that starts on submit already blends it in.
      if (Object.keys(styleBody(style)).length) await api.put('/api/onboarding/texting-style', styleBody(style))
      await api.post('/api/onboarding/submit', { answers: { I: answers.I, B: B2, D: answers.D, E: Object.fromEntries(core.map((i) => [i.id, answers.E[i.id]])), Edevice: devicesFor(core.map((i) => i.id)) } })
      localStorage.removeItem(key)
      setDest('/onboarding/world') // plan 33: "Your world right now" comes next, then Welcome
      await refresh() // status 'done' → the redirect above
    } catch (err) { setError(errMsg(err)); setBusy(false) }
  }
  const err = error && <ErrorBox message={error} />

  if (step === 1) return (
    <OnbShell step={1} title="The basics" sub="Shown on your profile. You can change these any time." nextLoading={busy}
      missing={!answers.I.job?.trim() ? { text: 'Add what you do to continue', target: 'onb-job' } : !answers.I.languages.length ? { text: 'Pick at least one language you speak', target: 'onb-languages' } : null}
      onNext={() => next(() => api.put('/api/profile', { job: answers.I.job, workplace: answers.I.workplace ?? '', education: answers.I.education ?? '', height: answers.I.height ?? '', languages: answers.I.languages, tags: { interests: answers.D.interests.map((i) => i.name) } }))}>
      <Basics q={q} value={answers.I} onChange={set('I')} interests={answers.D.interests} onInterests={(interests) => set('D')({ interests })} />{err}
    </OnbShell>
  )
  if (step === 2) return (
    <OnbShell step={2} wide title="Add 2 to 6 photos" sub="Photos are cropped to 4:5. Drag to reorder; the first is your main photo. Each new photo gets a quick automatic check before anyone else sees it."
      onBack={back} missing={photos && usable < 2 ? { text: `Add at least 2 photos (${usable} so far)`, target: 'onb-photos' } : null}
      nextDisabled={!photos || usable < 2} onNext={() => next()}
      // UX P0-1: Continue needs 2 photos; skipping is a deliberate secondary choice (gone when PHOTOS_REQUIRED is on)
      skip={!q.photosRequired && usable < 2 ? 'Add photos later' : undefined} onSkip={() => next()}>
      <div id="onb-photos">{photos ? <PhotoGrid photos={photos} setPhotos={setPhotos} onError={setError} /> : <Loading />}</div>{err}
    </OnbShell>
  )
  if (step === 3) return (
    <OnbShell step={3} title="Pick 3 prompts" sub="Answer them the way you’d say it out loud. Short is fine." onBack={back} nextLoading={busy}
      missing={prompts.length < 3 ? { text: `Pick 3 prompts (${prompts.length} so far)`, target: `pr-slot-${prompts.length}` }
        : prompts.findIndex((p) => !p.a.trim()) >= 0 ? { text: `Answer “${prompts.find((p) => !p.a.trim()).q}”`, target: `pr-slot-${prompts.findIndex((p) => !p.a.trim())}` } : null}
      onNext={() => next(() => api.put('/api/profile', { prompts: prompts.map((p) => ({ q: p.q, a: p.a.trim() })) }))}>
      <Prompts value={prompts} onChange={setPrompts} />{err}
    </OnbShell>
  )
  if (step === 4) {
    return (
      <OnbShell step={4} title="Lifestyle and values" sub="Nothing is pre-selected. Skip anything you’d rather not answer." onBack={back}
        missing={valuesMissing(answers.B, B)} onNext={() => next()}>
        {B.items.map((item) => <ValueQ key={item.id} item={item} v={answers.B[item.id]} onChange={(v) => set('B')({ ...answers.B, [item.id]: v })} />)}
      </OnbShell>
    )
  }
  return (
    <OnbShell step={5} title="How would you reply?" sub="Five quick messages. Reply like you normally text: emojis, Hinglish and short replies all help your agent sound like you."
      onBack={back} nextLoading={busy} onNext={submit}
      missing={core.some((i) => !answers.E[i.id]?.trim()) ? { text: `Reply to all ${core.length} messages (${core.filter((i) => !answers.E[i.id]?.trim()).length} left)`, target: 'onb-replies' } : null}>
      <section className="card tstyle-card" aria-label="How do you usually text?">
        <h2 className="h3">How do you usually text? <span className="small">· optional</span></h2>
        <p className="small">On your phone, with the people you talk to most. A few taps.</p>
        <TextingStyle questions={q.textingStyle} value={style} onChange={setStyle} />
      </section>
      <DesktopHint />
      <Replies items={core} value={answers.E} onChange={set('E')} />{err}
    </OnbShell>
  )
}

/* 6 · Done */
export function Welcome() {
  const { user, profile, refresh } = useAuth()
  const navigate = useNavigate()
  useEffect(() => { refresh().catch(() => {}) }, [refresh]) // the background self-check may have updated the status
  const first = (profile?.name ?? user.name ?? '').split(' ')[0]
  return (
    <OnbShell step={7} title={`You’re in${first ? `, ${first}` : ''}.`} sub="You’re visible in Discover. New photos show once their check finishes." next="Start browsing" onNext={() => navigate('/discover')}>
      <h2 className="h3 teach-h">Teach your agent more <span className="small">· optional</span></h2>
      <TeachCards />
    </OnbShell>
  )
}

/* Teach your agent more: one optional block, merged into the saved answers (POST /onboarding/more). */
export function Teach() {
  const { block } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { q, error: qError, load } = useQuestions()
  const [v, setV] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!['stories', 'replies', 'personality', 'texting'].includes(block)) return <Navigate to="/you" replace />
  if (!q) return qError ? <div className="st-center"><ErrorBox message={qError} onRetry={load} /></div> : <Loading />
  if (block === 'texting') return <TeachTexting q={q} />
  const sec = sectionOf(q, { stories: 'C', replies: 'E', personality: 'A' }[block])
  const items = block === 'replies' ? sec.items.filter((i) => !q.coreReplyIds.includes(i.id)) : sec.items
  const filled = Object.values(v).filter((x) => String(x).trim()).length
  async function save() {
    setBusy(true); setError(null)
    try {
      await api.post('/api/onboarding/more', { [sec.id]: v, ...(block === 'replies' && { Edevice: devicesFor(Object.keys(v).filter((k) => String(v[k]).trim())) }) })
      toast('Saved. Your agent is learning from it now.')
      navigate('/you')
    } catch (err) { setError(errMsg(err)); setBusy(false) }
  }
  const TITLE = { stories: ['Tell a story', 'Answer any you like. A few sentences in your own words is perfect.'], replies: ['10 more replies', 'Reply the way you’d really text. Skip any you want.'], personality: ['A short personality check', 'How much is each one like you? 1 = not at all, 5 = very.'] }[block]
  return (
    <OnbShell label="Teach your agent more" title={TITLE[0]} sub={TITLE[1]} onBack={() => navigate(-1)} next="Save" nextLoading={busy} onNext={save}
      missing={filled ? null : { text: block === 'personality' ? 'Rate at least one statement to save' : 'Answer at least one to save' }}>
      {block === 'replies' && <DesktopHint />}
      {block === 'personality'
        ? items.map((it) => <div key={it.id} className="vq-row"><span className="lbl">I {it.text.charAt(0).toLowerCase() + it.text.slice(1)}</span><Seg items={[1, 2, 3, 4, 5].map((n) => [n, String(n)])} value={v[it.id]} onChange={(n) => setV({ ...v, [it.id]: n })} label={it.text} /></div>)
        : items.map((it) => (
          <Field key={it.id} label={it.text} optional>{(id) => <textarea id={id} className="ta" rows={block === 'stories' ? 4 : 2} maxLength={block === 'stories' ? 600 : 400} value={v[it.id] ?? ''} placeholder={it.placeholder ?? 'Type it the way you would…'} onChange={(e) => setV({ ...v, [it.id]: e.target.value })} />}</Field>
        ))}
      {error && <ErrorBox message={error} />}
    </OnbShell>
  )
}

/* Teach your agent more · how you text (plan 32 KP1): the same taps as onboarding, saved on their own. */
function TeachTexting({ q }) {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [v, setV] = useState(user.textingStyle ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function save() {
    setBusy(true); setError(null)
    try {
      await api.put('/api/onboarding/texting-style', styleBody(v))
      await refresh()
      toast('Saved. Your agent will text more like you do on your phone.')
      navigate('/you')
    } catch (err) { setError(errMsg(err)); setBusy(false) }
  }
  return (
    <OnbShell label="Teach your agent more" title="How do you usually text?" sub="On your phone, with the people you talk to most. Skip anything you like."
      onBack={() => navigate(-1)} next="Save" nextLoading={busy} onNext={save}
      missing={Object.keys(styleBody(v)).length ? null : { text: 'Pick at least one to save' }}>
      <TextingStyle questions={q.textingStyle} value={v} onChange={setV} />
      {error && <ErrorBox message={error} />}
    </OnbShell>
  )
}
