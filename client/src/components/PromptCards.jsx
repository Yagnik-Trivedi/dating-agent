// UI polish A4: the Edit profile prompts as cards you can obviously edit. Click a card to write in place (autosaves on
// blur, with a "Saved" tick), swap the question (the answer stays), drag to reorder, and an inviting empty slot.
import { useRef, useState } from 'react'
import { Reorder, useReducedMotion } from 'motion/react'
import { Check, GripVertical, Pencil, Plus, Repeat } from 'lucide-react'
import { PROMPT_LIST, PROMPT_MAX } from '../lib/prompts'

/** value: [{ q, a }] (≤ 3); onChange(prompts); onSave(prompts) → Promise (saves the answered ones). */
export default function PromptCards({ value, onChange, onSave }) {
  const rm = useReducedMotion()
  const [editing, setEditing] = useState(null) // index being written
  const [picking, setPicking] = useState(null) // index whose question is being chosen (value.length = a new one)
  const [saved, setSaved] = useState(null) // index that just saved
  const items = value.map((p, i) => ({ ...p, id: p.q || `new-${i}` }))
  const used = value.map((p) => p.q)

  const save = async (next) => {
    try { await onSave(next); return true } catch { return false }
  }
  const finish = async (i) => {
    setEditing(null)
    if (await save(value)) { setSaved(i); setTimeout(() => setSaved((s) => (s === i ? null : s)), 1800) }
  }
  const choose = (i, q) => {
    const next = i < value.length ? value.map((p, k) => (k === i ? { q, a: p.a } : p)) : [...value, { q, a: '' }]
    onChange(next); setPicking(null); setEditing(i)
    if (i < value.length && value[i].a.trim()) save(next)
  }
  const reorder = (order) => onChange(order.map(({ id, ...p }) => p)) // eslint-disable-line no-unused-vars

  return (
    <div className="pc-list">
      <Reorder.Group as="div" axis="y" values={items} onReorder={reorder} className="pc-group">
        {items.map((p, i) => (
          <Reorder.Item as="div" key={p.id} value={p} className={`pc-card card ${editing === i ? 'editing' : ''}`} dragListener={editing !== i && picking !== i}
            onDragEnd={() => save(value)} whileHover={rm || editing === i ? undefined : { y: -2 }}>
            <span className="pc-grip" aria-hidden="true"><GripVertical size={16} strokeWidth={1.8} /></span>
            <div className="pc-body">
              <p className="pq">{p.q}</p>
              {picking === i ? <Picker used={used} current={p.q} onPick={(q) => choose(i, q)} onCancel={() => setPicking(null)} />
                : editing === i ? (
                  <>
                    <label className="sr-only" htmlFor={`pc-a-${i}`}>Your answer to “{p.q}”</label>
                    <AutoText id={`pc-a-${i}`} value={p.a} onChange={(a) => onChange(value.map((x, k) => (k === i ? { ...x, a } : x)))} onDone={() => finish(i)} />
                    <span className="small pa-n">{p.a.length}/{PROMPT_MAX}</span>
                  </>
                ) : (
                  <button type="button" className={`pc-answer ${p.a.trim() ? '' : 'empty'}`} onClick={() => setEditing(i)} aria-label={`Edit your answer to “${p.q}”`}>
                    {p.a.trim() || 'Tap to write your answer…'}
                  </button>
                )}
            </div>
            <div className="pc-acts">
              {saved === i && <span className="pc-saved" role="status"><Check size={14} strokeWidth={2.4} aria-hidden="true" />Saved</span>}
              {editing !== i && picking !== i && <>
                <button type="button" className="pc-act" onClick={() => setEditing(i)} aria-label={`Edit “${p.q}”`}><Pencil size={16} strokeWidth={1.8} aria-hidden="true" /></button>
                <button type="button" className="pc-act" onClick={() => setPicking(i)} aria-label={`Swap the prompt “${p.q}”`} title="Swap prompt"><Repeat size={16} strokeWidth={1.8} aria-hidden="true" /></button>
              </>}
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {value.length < 3 && (picking === value.length
        ? <div className="pc-card card open"><div className="pc-body"><p className="pq">Choose a prompt</p><Picker used={used} onPick={(q) => choose(value.length, q)} onCancel={() => setPicking(null)} /></div></div>
        : <button type="button" className="pc-add" onClick={() => setPicking(value.length)}><Plus size={18} strokeWidth={2} aria-hidden="true" />Add a prompt<span className="small"> · {3 - value.length} left, the easiest thing for someone to like</span></button>)}
    </div>
  )
}

function Picker({ used, current, onPick, onCancel }) {
  return (
    <div className="pc-picker">
      <ul className="pr-list" role="listbox" aria-label="Prompts">
        {PROMPT_LIST.filter((x) => !used.includes(x) || x === current).map((x) => (
          <li key={x} role="option" aria-selected={x === current} className={x === current ? 'on' : ''} tabIndex={0}
            onClick={() => onPick(x)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(x))}>{x}</li>
        ))}
      </ul>
      <button type="button" className="link" onClick={onCancel}>Cancel</button>
    </div>
  )
}

/** A textarea that grows with its text and saves on blur (or Ctrl/Cmd+Enter). */
function AutoText({ id, value, onChange, onDone }) {
  const ref = useRef(null)
  const grow = (el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }
  return (
    <textarea id={id} ref={(el) => { ref.current = el; grow(el) }} className="pa-in pc-in" rows={2} maxLength={PROMPT_MAX} autoFocus value={value}
      placeholder="Say it the way you would out loud" onChange={(e) => { onChange(e.target.value); grow(e.target) }} onBlur={onDone}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur() }} />
  )
}
