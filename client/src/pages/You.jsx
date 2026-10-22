// "This is you" (Round 7 Step 2 design, You.jsx) on real data from GET /api/kg/me: a calm 3D constellation of what my
// agent knows (2D radial view under reduced motion, without WebGL or on weak devices), search + hub filters, and a
// side sheet (bottom sheet on mobile) with the quote, where it came from and who can see it. List view + "How I text".
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import { ArrowRight, BookOpen, ChevronRight, CircleAlert, Lock, Orbit, Pencil, Quote, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { Btn, Dots, Empty, IconBtn, Privacy, TabBar, Tabs, TopNav, useDraw } from '../components/r7'
import { TextBars } from '../components/charts'
import TeachCards from '../components/TeachCards'
import TextingStyle, { styleBody } from '../components/TextingStyle'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { buildGraph, canRender3D, CONF_WORD, IMP_WORD, lighten } from '../lib/graph'

const Graph3D = lazy(() => import('../components/Graph3D')) // three.js only loads when this screen opens
const PRIV_L = { public: 'Public', if_asked: 'Only if asked', private: 'Private' }
const day = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : null)

/** 2D radial fallback: same encoding, flat; edges draw in from You (anime.js, skipped under reduced motion). */
function Radial2D({ L, selected, onSelect, w, h }) {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.29
  const hubXY = Object.fromEntries(L.hubs.map((hb, i) => { const a = -Math.PI / 2 + (i / L.hubs.length) * Math.PI * 2; return [hb.id, [cx + Math.cos(a) * R, cy + Math.sin(a) * R, a]] }))
  const groups = {}; L.facts.forEach((f) => { (groups[f.hub] ||= []).push(f) })
  const pos = {}
  Object.entries(groups).forEach(([hid, fs]) => { const [x, y, a] = hubXY[hid]; const step = Math.min(0.42, 2.4 / fs.length); fs.forEach((f, k) => { const b = a + (k - (fs.length - 1) / 2) * step; const d = R * (0.34 + (k % 3) * 0.08); pos[f.id] = [x + Math.cos(b) * d, y + Math.sin(b) * d] }) })
  const rad = (f) => 3.5 + f.r * 44
  const ref = useRef(null)
  useDraw(ref, { duration: 420, stagger: 14, ease: 'outQuad', deps: [L] })
  return (
    <svg ref={ref} className="radial" width={w} height={h} role="img" aria-label="Your knowledge graph, flat view">
      {L.hubs.map((hb) => <line data-draw key={hb.id} x1={cx} y1={cy} x2={hubXY[hb.id][0]} y2={hubXY[hb.id][1]} className="r-line" />)}
      {L.facts.map((f) => <line data-draw key={f.id} x1={hubXY[f.hub][0]} y1={hubXY[f.hub][1]} x2={pos[f.id][0]} y2={pos[f.id][1]} className="r-line l2" />)}
      {L.contra.map(([a, b], i) => <line key={i} x1={pos[a.id][0]} y1={pos[a.id][1]} x2={pos[b.id][0]} y2={pos[b.id][1]} className="r-contra" />)}
      {L.facts.map((f) => <g key={f.id} tabIndex={0} role="button" aria-label={f.t} onClick={() => onSelect(f.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(f.id)} className="r-node">
        {f.privacy === 'private' ? <circle cx={pos[f.id][0]} cy={pos[f.id][1]} r={rad(f)} fill="#FBF8F3" stroke={f.tint} strokeWidth="2" /> : <circle cx={pos[f.id][0]} cy={pos[f.id][1]} r={rad(f)} fill={lighten(f.tint)} opacity={0.3 + 0.7 * f.conf} />}
        {selected === f.id && <circle cx={pos[f.id][0]} cy={pos[f.id][1]} r={rad(f) + 5} fill="none" stroke="#A2613F" strokeWidth="2" />}
      </g>)}
      {L.hubs.map((hb) => <g key={hb.id}><circle cx={hubXY[hb.id][0]} cy={hubXY[hb.id][1]} r={9} fill={hb.tint} /><text x={hubXY[hb.id][0]} y={hubXY[hb.id][1] - 16} textAnchor="middle" className="r-hub">{hb.name}</text></g>)}
      <circle cx={cx} cy={cy} r={14} fill="#2B2420" /><text x={cx} y={cy + 32} textAnchor="middle" className="r-hub">You</text>
    </svg>
  )
}

/** Measures the canvas box so the 2D view fills it. */
function useSize(ref) {
  const [s, setS] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return s
}

function FactSheet({ f, hub, mobile, conflict, onClose, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(f.t)
  const [fix, setFix] = useState('')
  const [pick, setPick] = useState(null)
  useEffect(() => { setEditing(false); setText(f.t); setFix(''); setPick(null) }, [f.id, f.t])
  const run = async (fn, done) => { try { await fn(); onChanged(); if (done) toast(done) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } }
  const save = (e) => { e.preventDefault(); setEditing(false); if (text.trim() && text.trim() !== f.t) run(() => api.patch(`/api/kg/facts/${f.id}`, { object: text.trim() }), 'Saved. Your agent will use the new wording.') }
  return (
    <aside className={`fact-sheet ${mobile ? 'bottom' : 'side'}`} aria-label="Fact details">
      {mobile && <i className="grab" aria-hidden="true" />}
      <div className="fs-top"><span className="hub-pill"><i style={{ background: hub.tint }} />{hub.name}</span><IconBtn icon={X} label="Close" onClick={onClose} /></div>
      {editing ? (
        <form className="fs-edit" onSubmit={save}><span className="input"><input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} autoFocus aria-label="Edit this fact" /></span><Btn size="sm" type="submit">Save</Btn></form>
      ) : <h2 className="fs-t">{f.t}</h2>}
      <p className="fs-meta"><span>{CONF_WORD(f.conf)}</span><span aria-hidden="true">·</span><span>{f.dealbreaker ? 'A dealbreaker' : IMP_WORD[f.imp]}</span></p>
      {f.q ? <figure className="evq"><blockquote><Quote size={15} strokeWidth={1.8} aria-hidden="true" />{f.q}</blockquote><figcaption>{[f.src, day(f.at)].filter(Boolean).join(', ')}</figcaption></figure>
        : <p className="fs-src small">From: {f.src}</p>}
      {conflict && (
        <div className="nbox"><b>Which is right?</b> Your agent heard two different things and won’t use either until you say.
          <div className="chips" style={{ marginTop: 8 }}>{[conflict.a, conflict.b].map((o) => <button type="button" key={o.id} className={`chipx ${pick === o.id ? 'on' : ''}`} onClick={() => setPick(o.id)}>{o.object}</button>)}</div>
          <Btn size="sm" disabled={!pick} onClick={() => run(() => api.post(`/api/kg/contradictions/${conflict.id}/resolve`, { keepFactId: pick }), 'Thanks. Your agent will go with that.')}>Save</Btn>
        </div>
      )}
      {f.voice ? (
        <form className="fs-fix" onSubmit={(e) => { e.preventDefault(); run(() => api.post('/api/kg/voice/corrections', { nodeId: f.id, text: fix.trim() || undefined }), 'Your agent will remember') }}>
          <p className="fs-l">That’s not me</p>
          <span className="input"><input value={fix} onChange={(e) => setFix(e.target.value)} maxLength={300} placeholder="How is it really? e.g. “I never use emojis”" aria-label="How is it really?" /></span>
          <Btn size="sm" kind="secondary" type="submit">Correct it</Btn>
        </form>
      ) : (
        <>
          <p className="fs-l">Who can see this</p>
          <Privacy value={f.privacy} compact={mobile} onChange={(disclosure) => run(() => api.patch(`/api/kg/facts/${f.id}`, { disclosure }))} />
          <div className="fs-act">
            <Btn kind="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Btn>
            <Btn kind="ghost" icon={Trash2} onClick={() => run(() => api.delete(`/api/kg/facts/${f.id}`), 'Deleted. It won’t come back, even if you answer again.').then(onClose)}>Delete</Btn>
          </div>
        </>
      )}
    </aside>
  )
}

const Legend = () => (
  <ul className="legend" aria-label="How to read the graph">
    <li><span className="lg-size"><i /><i /><i /></span>Bigger = matters more</li>
    <li><span className="lg-op"><i /><i /></span>Fainter = less sure</li>
    <li><span className="lg-priv"><Lock size={9} strokeWidth={2.4} /></span>Private</li>
    <li><span className="lg-dash" />Contradiction</li>
  </ul>
)

function howIText(v) {
  if (!v) return []
  return [
    { k: 'Message length', v: `${v.medianWords < 10 ? 'Short' : v.medianWords < 20 ? 'Medium' : 'Long'} · about ${v.medianWords} words`, you: Math.min(1, v.medianWords / 30), scale: ['Short', 'Long'] },
    { k: 'Emoji use', v: v.emojiPerMessage >= 0.15 ? `Often · ${Math.round(v.emojiPerMessage * 10)} in 10 messages` : 'Rarely', you: Math.min(1, v.emojiPerMessage), scale: ['Rarely', 'Often'] },
    { k: 'Language mix', v: v.nonEnglishShare >= 0.1 ? `About ${Math.round(v.nonEnglishShare * 100)}% not in English` : 'Mostly English', you: v.nonEnglishShare, scale: ['English', 'Mixed'] },
    { k: 'Laugh style', v: v.laugh ? `“${v.laugh}”` : 'Rarely laughs in text', you: Math.min(1, v.laughRate * 2), scale: ['Rarely', 'A lot'] },
    { k: 'Messages in a row', v: (v.burstiness ?? 0) >= 0.3 ? 'Often a few short ones' : 'Usually one', you: Math.min(1, (v.burstiness ?? 0) * 1.6), scale: ['One', 'Several'] },
  ]
}

/** Plan 32 KP1: the "How do you usually text?" answers as chips; a tap saves and re-blends the voice profile. */
function HowITextChips({ style, onChanged }) {
  const toast = useToast()
  const { refresh } = useAuth()
  const [v, setV] = useState(style?.value ?? {})
  if (!style?.questions?.length) return null
  const change = async (next) => {
    const prev = v
    setV(next)
    try { await api.put('/api/onboarding/texting-style', styleBody(next)); await refresh(); onChanged() } catch (err) { setV(prev); toast(errMsg(err), { tone: 'bad' }) }
  }
  return (
    <div className="tstyle-you">
      <p className="small">How you say you text on your phone. Your agent leans on this more than replies typed on a computer.</p>
      <TextingStyle compact questions={style.questions} value={v} onChange={change} />
    </div>
  )
}

function ListView({ L, voice, style, onSelect, onChanged }) {
  return (
    <div className="y-list">
      <div className="yl-facts">{L.hubs.filter((h) => h.id !== 'voice').map((h) => {
        const fs = L.facts.filter((f) => f.hub === h.id)
        return (
          <section key={h.id} className="yl-sec"><h2 className="yl-h"><i style={{ background: h.tint }} />{h.name}<span>{fs.length}</span></h2>
            <ul className="card flush">{fs.map((f) => <li key={f.id} className="yl-row" role="button" tabIndex={0} onClick={() => onSelect(f.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(f.id)}><div><b>{f.t}</b><span className="small">{CONF_WORD(f.conf)} · {f.src}</span></div><span className={`pv pv-${f.privacy === 'if_asked' ? 'asked' : f.privacy}`}>{f.privacy === 'private' && <Lock size={12} strokeWidth={2.2} aria-hidden="true" />}{PRIV_L[f.privacy]}</span><ChevronRight size={18} strokeWidth={1.7} aria-hidden="true" /></li>)}</ul></section>
        )
      })}</div>
      <aside className="yl-side card"><h2 className="h3">How I text</h2><p className="small">Learned from your replies. Your agent uses this to sound like you. Tap a “How I text” dot in the graph to correct it.</p>{voice ? <TextBars items={howIText(voice)} /> : <p className="small">Not enough replies yet.</p>}
        <HowITextChips style={style} onChanged={onChanged} />
        {(voice?.samples ?? 0) < 10 && <><p className="small teach-hint">Your agent has only a few of your replies, so it keeps its messages plain. Teach it more:</p><TeachCards /></>}</aside>
    </div>
  )
}

export default function You({ review = false }) {
  const mobile = useMobile()
  const rm = useReducedMotion()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [sel, setSel] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState('graph')
  const canvas = useRef(null)
  const size = useSize(canvas)
  const load = useCallback(() => Promise.all([api.get('/api/kg/me'), api.get('/api/kg/contradictions')])
    .then(([g, c]) => { setData({ graph: g.data, contradictions: c.data.contradictions }); setError(null) })
    .catch((e) => setError(errMsg(e))), [])
  useEffect(() => { load() }, [load])
  const L = useMemo(() => (data ? buildGraph(data.graph, data.contradictions) : null), [data])
  const use3D = useMemo(() => !rm && canRender3D(), [rm])
  const building = user?.graphStatus === 'building'

  const f = L?.facts.find((x) => x.id === sel)
  const hub = f && L.hubs.find((h) => h.id === f.hub)
  const conflict = f && data.contradictions.find((c) => c.a.id === f.id || c.b.id === f.id)
  const isList = view === 'list'
  const privateN = L?.facts.filter((x) => x.privacy === 'private').length ?? 0

  let graph
  if (error) graph = <Empty icon={CircleAlert} title="We couldn’t load your graph" action={<Btn kind="secondary" icon={RefreshCw} onClick={load}>Try again</Btn>}>Your facts are safe. Try again, or switch to the list view.</Empty>
  else if (!L) graph = <div className="g-loading"><span className="sk-dot" />Loading your graph…</div>
  else if (!L.facts.length) graph = building ? <div className="g-state" role="status"><Dots /><h2 className="h3">Your agent is still reading your stories</h2><p className="small">Your graph fills in as it learns. This usually takes a minute or two after onboarding.</p></div>
    : <Empty icon={Orbit} title="Nothing here yet" action={<Link className="btn primary" to="/onboarding"><BookOpen size={18} strokeWidth={1.8} aria-hidden="true" />Teach your agent</Link>}>Answer a few prompts or tell a story, and your agent will start mapping what matters to you.</Empty>
  else if (use3D) graph = <Suspense fallback={<div className="g-loading"><span className="sk-dot" />Loading your graph…</div>}><Graph3D L={L} selected={sel} onSelect={setSel} filter={filter} query={query} mobile={mobile} /></Suspense>
  else graph = size.w > 0 && <Radial2D L={L} selected={sel} onSelect={setSel} w={size.w} h={size.h} />

  const controls = (
    <div className="y-controls">
      <label className="search"><Search size={17} strokeWidth={1.7} aria-hidden="true" /><span className="sr-only">Search what your agent knows</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mobile ? 'Search facts' : 'Search what your agent knows'} /></label>
      <Tabs id="you-view" value={view} onChange={setView} items={[['graph', 'Graph'], ['list', 'List']]} />
    </div>
  )
  const chips = L && (
    <div className="hub-chips" role="group" aria-label="Filter by hub">
      <button type="button" className={`chip ${filter === 'all' ? 'on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All · {L.facts.length}</button>
      {L.hubs.map((h) => <button type="button" key={h.id} className={`chip ${filter === h.id ? 'on' : ''}`} aria-pressed={filter === h.id} onClick={() => setFilter(h.id)}><i style={{ background: h.tint }} />{h.name}</button>)}
    </div>
  )
  const reviewBar = review && <div className="nbox ok you-review"><span><b>This is what your agent learned from your answers.</b> Fix anything that’s off, mark things private, or delete them.</span><Link className="btn primary sm" to="/discover">Looks right<ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" /></Link></div>
  const sheet = f && hub && <FactSheet f={f} hub={hub} mobile={mobile} conflict={conflict} onClose={() => setSel(null)} onChanged={load} />
  const list = L && <ListView L={L} voice={data.graph.voice} style={data.graph.textingStyle} onSelect={setSel} onChanged={load} />

  if (mobile) return (
    <div className="scr app-scr you m">
      <header className="y-head"><h1 className="h2">This is you</h1>{L && <p className="small">{L.facts.length} facts · {privateN} private</p>}</header>
      {reviewBar}
      {controls}{!isList && chips}
      {isList ? <div className="y-lwrap">{list}</div> : <div className="y-canvas" ref={canvas}>{graph}</div>}
      {sheet}
      <TabBar />
    </div>
  )
  return (
    <div className="scr app-scr you d">
      <TopNav />
      <div className="y-top">
        <div><h1 className="h1">This is you</h1><p className="lead">Everything your agent knows about you, and who can see it. Tap any dot to check it, fix it or make it private.</p></div>
        {controls}
      </div>
      {reviewBar}
      {!isList && chips}
      {isList ? <div className="y-lwrap d">{list}{sheet && <div className="yl-sheet">{sheet}</div>}</div> : <div className="y-main">
        <div className="y-canvas" ref={canvas}>{graph}{L?.facts.length > 0 && <><Legend /><p className="y-hint small">{use3D ? 'Drag to turn · scroll to zoom · tap a dot' : 'Tap a dot'}</p></>}</div>
        {sheet || <aside className="fact-sheet side empty"><p className="small">Tap a dot to see what your agent knows and where it learned it.</p></aside>}
      </div>}
    </div>
  )
}
