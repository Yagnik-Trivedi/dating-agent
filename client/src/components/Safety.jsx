// Plan 30 S3.8: report and block sheets (design: System.jsx#Report, #Block). A block hides both people everywhere and
// stops any agent chat at once; neither is ever told who did it.
import { useState } from 'react'
import { Ban, Flag, Lock } from 'lucide-react'
import { Btn, Check2, Field, Sheet } from './r7'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'

export const REASONS = [['fake_profile', 'Fake profile'], ['scam', 'Scam or asking for money'], ['harassment', 'Harassment'], ['inappropriate_photos', 'Inappropriate photos'], ['underage', 'Might be under 18'], ['other', 'Something else']]

export function ReportSheet({ open, name, userId, matchId, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState(null)
  const [note, setNote] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [busy, setBusy] = useState(false)
  async function send() {
    setBusy(true)
    try {
      await api.post(`/api/users/${userId}/report`, { reason, note: note.trim() || undefined, matchId, block: alsoBlock })
      toast(alsoBlock ? `Thanks. We’ll look into it, and you won’t see ${name} again.` : 'Thanks. We’ll look into it.')
      onDone?.({ blocked: alsoBlock })
    } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} title={`Report ${name}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={send} loading={busy} disabled={!reason}>Send report</Btn></>}>
      <p className="small">Reports are private and read by a person. {name} won’t know who reported them.</p>
      <div className="radio-list" role="radiogroup" aria-label="Reason">{REASONS.map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={reason === k} className={reason === k ? 'on' : ''} onClick={() => setReason(k)}><span className="rd" />{l}</button>)}</div>
      <Field label="Anything else we should know?" optional>{(id) => <textarea id={id} className="ta" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <Check2 checked={alsoBlock} onChange={setAlsoBlock}>Also block {name}</Check2>
    </Sheet>
  )
}

export function BlockSheet({ open, name, userId, onClose, onDone, onReport }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    try { await api.post(`/api/users/${userId}/block`); toast(`${name} is blocked.`); onDone?.() } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} title={`Block ${name}?`} onClose={onClose} footer={<><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn kind="danger" icon={Ban} onClick={go} loading={busy}>Block</Btn></>}>
      <ul className="lc-points">
        <li><Ban size={18} strokeWidth={1.8} aria-hidden="true" /><span>{name} won’t see your profile or be able to message you.</span></li>
        <li><Lock size={18} strokeWidth={1.8} aria-hidden="true" /><span>{name} won’t be told. Your agent stops talking to theirs at once.</span></li>
        {onReport && <li><Flag size={18} strokeWidth={1.8} aria-hidden="true" /><span>Something wrong? You can <button type="button" className="link" onClick={onReport}>report {name}</button> too.</span></li>}
      </ul>
    </Sheet>
  )
}
