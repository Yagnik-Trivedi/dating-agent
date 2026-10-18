// "This is you" (owner's design: screens/You.jsx) on real data from GET /api/kg/me. The only graphic in the product is
// the knowledge map: sector = area, distance from centre = how sure the agent is, dot size = how much it matters,
// fill = who can see it. Facts can be edited, deleted (they never come back) and made public / if asked / private.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Globe, Lock, MessageCircleQuestion, Pencil, Trash2, X } from 'lucide-react'
import { Btn, useMobile } from '../components/prelude'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

const HUBS = [['who', 'Who I am'], ['likes', 'Likes'], ['dislikes', 'Dislikes'], ['values', 'Values & lifestyle'], ['goals', 'Goals'], ['stories', 'Stories'], ['opinions', 'Opinions & humour'], ['voice', 'How I text']]
const SHORT = { values: 'Values', opinions: 'Humour', voice: 'Texting' }
const CONF = ['', 'Unsure', 'Fairly sure', 'Sure']
const PRIV = { public: ['Public', Globe], if_asked: ['If asked', MessageCircleQuestion], private: ['Private', Lock] }
const conf = (c) => (c >= 0.8 ? 3 : c >= 0.5 ? 2 : 1)
const weight = (w) => (w >= 0.85 ? 3 : w >= 0.5 ? 2 : 1)
const SOURCE = { questionnaire_choice: 'Your answer', questionnaire_story: 'Your story', user_answer: 'You told your agent', own_chat: 'A chat of yours', reflection: 'Your agent noticed', agent_observed: 'From a chat' }

/** Radial dot plot (the design's KnowledgeMap), fed with real facts. */
function KnowledgeMap({ hubs, selected, onSelect, size, w, compact }) {
  const cx = w / 2, cy = size / 2, R = Math.min(size / 2 - (compact ? 34 : 44), w / 2 - (compact ? 60 : 142))
  const rings = [0, 0.4, 0.66, 0.92].map((f) => f * R)
  const span = (Math.PI * 2) / hubs.length, gap = 0.07
  const pt = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  const arc = (a0, a1, r0, r1) => { const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0); return `M${x0} ${y0} A${r1} ${r1} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 0 ${x3} ${y3}Z` }
  const ds = compact ? [0, 3, 4.5, 6.5] : [0, 4, 6, 8.5]
  return (
    <svg className="kmap" viewBox={`0 0 ${w} ${size}`} width="100%" style={{ maxWidth: w }} role="img" aria-label="Map of what your agent knows about you, grouped into eight areas">
      {rings.slice(1).map((r, i) => <circle key={i} cx={cx} cy={cy} r={r} className="k-ring" />)}
      {!compact && [1, 2, 3].map((c) => { const [x, y] = pt(-Math.PI / 2 - span / 2, rings[c]); return <text key={c} x={x} y={y + 4} textAnchor="middle" className="k-ringlabel">{CONF[c]}</text> })}
      {hubs.map((h, hi) => {
        const a0 = -Math.PI / 2 - span / 2 + hi * span + gap / 2, a1 = a0 + span - gap, am = (a0 + a1) / 2, sel = h.id === selected
        const [lx, ly] = pt(am, R + (compact ? 14 : 20))
        const anchor = Math.abs(Math.cos(am)) < 0.25 ? 'middle' : Math.cos(am) > 0 ? 'start' : 'end'
        return (
          <g key={h.id} className={`k-hub ${sel ? 'sel' : ''}`} onClick={() => onSelect(h.id)} style={{ cursor: 'pointer' }}>
            <path d={arc(a0, a1, rings[1] * 0.55, R)} className="k-sector" />
            <text x={lx} y={ly + 4} textAnchor={anchor} className="k-label">{compact ? (SHORT[h.id] || h.name) : h.name}{!compact && <tspan className="k-count"> {h.facts.length}</tspan>}</text>
            {h.facts.map((f, fi) => {
              const a = a0 + ((fi + 0.5) / h.facts.length) * (a1 - a0), [x, y] = pt(a, rings[f.conf] - (fi % 2) * (compact ? 4 : 6)), r = ds[f.weight]
              return (
                <g key={f.id} tabIndex={0} className={`k-fact p-${f.privacy}`} aria-label={`${f.t}. ${CONF[f.conf]}. ${PRIV[f.privacy]?.[0] ?? ''}.`} onKeyDown={(e) => e.key === 'Enter' && onSelect(h.id)}>
                  <title>{`${f.t} · ${CONF[f.conf]} · ${PRIV[f.privacy]?.[0] ?? ''}`}</title>
                  {f.conflict && <circle cx={x} cy={y} r={r + 4} className="k-conflict" />}
                  {f.privacy === 'if_asked' ? <><circle cx={x} cy={y} r={r} className="k-ring-dot" /><path d={`M${x} ${y - r} A${r} ${r} 0 0 0 ${x} ${y + r}Z`} className="k-fill" /></>
                    : <circle cx={x} cy={y} r={r} className={f.privacy === 'private' ? 'k-private' : 'k-fill'} />}
                </g>
              )
            })}
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={compact ? 16 : 22} className="k-you" />
      <text x={cx} y={cy + (compact ? 4 : 5)} textAnchor="middle" className="k-youlabel">You</text>
    </svg>
  )
}
const MapLegend = ({ compact }) => (
  <div className={`k-legend ${compact ? 'c' : ''}`}>
    <span><svg width="34" height="14" aria-hidden="true"><circle cx="5" cy="7" r="3" className="k-fill" /><circle cx="15" cy="7" r="4.5" className="k-fill" /><circle cx="28" cy="7" r="6" className="k-fill" /></svg>How much it matters</span>
    <span><svg width="16" height="14" aria-hidden="true"><circle cx="8" cy="7" r="6" className="k-ring-dot" /><circle cx="8" cy="7" r="2" className="k-fill" /></svg>Further out = more sure</span>
    <span><svg width="52" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" className="k-fill" /><circle cx="25" cy="7" r="5.5" className="k-ring-dot" /><path d="M25 1.5 A5.5 5.5 0 0 0 25 12.5Z" className="k-fill" /><circle cx="43" cy="7" r="5.5" className="k-private" /></svg>Public · if asked · private</span>
  </div>
)

function FactRow({ f, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(f.t)
  const run = async (fn, done) => { try { await fn(); onChanged(); if (done) toast(done) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } }
  const privacy = (disclosure) => run(() => api.patch(`/api/kg/facts/${f.id}`, { disclosure }))
  const save = (e) => { e.preventDefault(); setEditing(false); if (text.trim() && text.trim() !== f.t) run(() => api.patch(`/api/kg/facts/${f.id}`, { object: text.trim() }), 'Saved. Your agent will use the new wording.') }
  const del = () => run(() => api.delete(`/api/kg/facts/${f.id}`), 'Deleted. It won’t come back when you re-submit your answers.')
  return (
    <li className="fact">
      {editing ? (
        <form className="fact-t fact-edit" onSubmit={save}><input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={120} autoFocus aria-label="Edit this fact" />
          <Btn size="sm" type="submit" icon={Check}>Save</Btn><button type="button" className="icon-btn sm" aria-label="Cancel" onClick={() => setEditing(false)}><X size={16} strokeWidth={1.6} /></button></form>
      ) : <div className="fact-t"><p>{f.t}</p><span>{f.src} · {CONF[f.conf].toLowerCase()}</span></div>}
      {!editing && f.editable && (
        <>
          <div className="seg" role="radiogroup" aria-label="Who can see this">
            {Object.entries(PRIV).map(([k, [label, I]]) => <button key={k} role="radio" aria-checked={f.privacy === k} className={f.privacy === k ? 'on' : ''} onClick={() => privacy(k)} title={label}><I size={14} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></button>)}
          </div>
          <button className="icon-btn sm" aria-label={`Edit: ${f.t}`} onClick={() => setEditing(true)}><Pencil size={16} strokeWidth={1.6} /></button>
          <button className="icon-btn sm" aria-label={`Delete: ${f.t}`} onClick={del}><Trash2 size={16} strokeWidth={1.6} /></button>
        </>
      )}
    </li>
  )
}

function Conflicts({ items, onChanged }) {
  const toast = useToast()
  const [pick, setPick] = useState({})
  if (!items.length) return null
  return items.map((c) => (
    <div key={c.id} className="card conflict">
      <h3 className="t-h3">Which is right?</h3>
      <p className="small">Your agent heard two different things. It won’t use either until you say.</p>
      <div className="opts">{[c.a, c.b].map((o) => (
        <label key={o.id} className={`opt ${pick[c.id] === o.id ? 'on' : ''}`}><input type="radio" name={`cf-${c.id}`} checked={pick[c.id] === o.id} onChange={() => setPick((p) => ({ ...p, [c.id]: o.id }))} />
          <span><b>{o.object}</b><em>{o.quote ? `“${o.quote}”` : o.predicate}</em></span></label>
      ))}</div>
      <div className="conflict-a"><span /><Btn size="sm" disabled={!pick[c.id]} onClick={async () => {
        try { await api.post(`/api/kg/contradictions/${c.id}/resolve`, { keepFactId: pick[c.id] }); toast('Thanks. Your agent will go with that.'); onChanged() } catch (err) { toast(errMsg(err), { tone: 'bad' }) }
      }}>Save</Btn></div>
    </div>
  ))
}

function HowYouText({ voice, onChanged }) {
  const toast = useToast()
  const [open, setOpen] = useState(null)
  const [fix, setFix] = useState('')
  if (!voice.length) return null
  async function save(e) {
    e.preventDefault()
    try { await api.post('/api/kg/voice/corrections', { nodeId: open, text: fix.trim() || undefined }); toast('Your agent will remember'); setOpen(null); setFix(''); onChanged() } catch (err) { toast(errMsg(err), { tone: 'bad' }) }
  }
  return (
    <div className="card how">
      <div className="card-h"><h3 className="t-h3">How you text</h3><span className="small">So your agent sounds like you</span></div>
      <div className="style-chips">{voice.map((c) => <button key={c.id} className="style-chip" onClick={() => { setOpen(c.id); setFix('') }} aria-label={`${c.t}. Correct this`}><span>{c.t}</span><Pencil size={13} strokeWidth={1.6} aria-hidden="true" /></button>)}</div>
      {open && (
        <form className="how-fix" onSubmit={save}>
          <label className="field-l" htmlFor="how-fix">That’s not me: how is it really? <span className="small">(e.g. “I never use emojis”)</span></label>
          <div className="how-row"><input id="how-fix" className="input" value={fix} onChange={(e) => setFix(e.target.value)} maxLength={300} autoFocus /><Btn type="submit">Save</Btn><button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setOpen(null)}><X size={16} strokeWidth={1.6} /></button></div>
        </form>
      )}
    </div>
  )
}

export default function You({ review = false }) {
  const mobile = useMobile()
  const [graph, setGraph] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState('likes')
  const [view, setView] = useState('map')
  const load = useCallback(() => Promise.all([api.get('/api/kg/me'), api.get('/api/kg/contradictions')])
    .then(([g, c]) => { setGraph(g.data); setConflicts(c.data.contradictions); setError(null) })
    .catch((e) => setError(errMsg(e))), [])
  useEffect(() => { load() }, [load])

  const hubs = useMemo(() => {
    if (!graph) return []
    const conflictIds = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]))
    const facts = graph.nodes.filter((n) => n.hub && !n.hubNode && n.type !== 'self')
    return HUBS.map(([id, name]) => ({ id, name, facts: facts.filter((n) => n.hub === id).map((n) => ({
      id: n.id, t: n.label, conf: conf(n.confidence ?? 0.6), weight: weight(n.weight ?? 0.5), privacy: n.disclosure ?? 'public',
      src: n.type === 'voice' ? 'Learned from your replies' : SOURCE[n.source] ?? 'Your answer', conflict: conflictIds.has(n.id), editable: n.type !== 'voice',
    })) }))
  }, [graph, conflicts])

  if (error) return <div className="page"><div className="st-center"><h2 className="t-h2">We couldn’t load what your agent knows</h2><p className="t-body muted">{error}</p><Btn kind="secondary" onClick={load}>Try again</Btn></div></div>
  if (!graph) return <div className="page" aria-busy="true"><div className="sk sk-t" /><div className="card map-card" style={{ height: 420, marginTop: 16 }}><div className="sk" style={{ width: '60%', height: '80%', margin: 'auto' }} /></div></div>

  const all = hubs.flatMap((h) => h.facts)
  const hub = hubs.find((h) => h.id === selected)
  const shown = (mobile && view === 'list') ? hubs.flatMap((h) => h.facts.map((f) => ({ ...f, hubName: h.name }))) : hub.facts
  return (
    <div className={`scr you page-you ${mobile ? 'm' : 'd'}`}>
      <header className="you-head"><div><h1 className="t-h1">This is you</h1>{!mobile && <p>Everything your agent knows about you, and who can see it. It learns only from your answers and from chats you approve. Change anything, any time.</p>}</div>
        <span className="t-data">{all.length} facts · {all.filter((f) => f.privacy === 'private').length} private</span></header>
      {review && <div className="card you-review"><div><h2 className="t-h3">This is what your agent learned from your answers</h2><p className="small">Fix anything that’s off, mark things private, or delete them. Your agent only uses what’s here.</p></div><Link className="btn primary" to="/discover">Looks right, start meeting people<ArrowRight size={16} strokeWidth={1.6} /></Link></div>}
      {mobile && <div className="seg big" role="tablist"><button role="tab" className={view === 'map' ? 'on' : ''} aria-selected={view === 'map'} onClick={() => setView('map')}>Map</button><button role="tab" className={view === 'list' ? 'on' : ''} aria-selected={view === 'list'} onClick={() => setView('list')}>List</button></div>}
      <div className="you-grid">
        {(!mobile || view === 'map') && (
          <div className="you-left">
            <div className="card map-card"><KnowledgeMap hubs={hubs} selected={selected} onSelect={setSelected} size={mobile ? 330 : 430} w={mobile ? 343 : 620} compact={mobile} /><MapLegend compact={mobile} /></div>
            {!mobile && <HowYouText voice={hubs.find((h) => h.id === 'voice').facts} onChanged={load} />}
          </div>
        )}
        <div className="you-right">
          <div className="card list-card">
            <div className="card-h"><h3 className="t-h3">{mobile && view === 'list' ? 'Everything' : hub.name}</h3><span className="t-data">{shown.length} facts</span></div>
            {shown.length ? <ul className="facts">{shown.map((f) => <FactRow key={f.id} f={f} onChanged={load} />)}</ul> : <p className="small" style={{ padding: '12px 0' }}>Nothing here yet.</p>}
          </div>
          <Conflicts items={conflicts} onChanged={load} />
          {mobile && <HowYouText voice={hubs.find((h) => h.id === 'voice').facts} onChanged={load} />}
        </div>
      </div>
    </div>
  )
}
