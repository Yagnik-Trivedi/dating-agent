// Settings (Prelude design language): agent mode, Learn from my chats, appearance (light / lamplight), profile, delete.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Btn } from '../components/prelude'
import { ErrorBox, Modal, Segmented } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { disconnectSocket } from '../lib/socket'

const MODES = {
  off: ['Off', 'You handle every conversation yourself. Your agent never sends a message.'],
  shadow: ['Watch along', 'Your agent has the first conversation while you can read every line, pause it, or take over in one tap.'],
  auto: ['Quietly', 'Your agent has the first conversations on its own and only brings you the matches worth your time.'],
}

function applyTheme(theme) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme
    try { localStorage.removeItem('theme') } catch { /* private mode */ }
  } else {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch { /* private mode */ }
  }
}

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const toast = useToast()
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') ?? 'system' } catch { return 'system' } })
  const [saving, setSaving] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  async function save(patch, done) {
    setSaving(Object.keys(patch)[0])
    try {
      const { data } = await api.put('/api/me/settings', patch)
      setUser(data.user)
      toast(done)
    } catch (err) {
      toast(errMsg(err), { tone: 'bad' })
    } finally {
      setSaving(null)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete('/api/me')
      disconnectSocket()
      logout()
    } catch (err) {
      setDeleteError(errMsg(err))
      setDeleting(false)
    }
  }

  const learn = user.settings?.learnFromChats !== false
  return (
    <div className="page settings">
      <header className="page-head"><div><h1 className="t-h1">Settings</h1><p>How your agent works for you. You can change any of this at any time.</p></div></header>

      <section className="card set-sec">
        <h2 className="t-h3">Your agent</h2>
        <div className="set-modes" role="radiogroup" aria-label="Agent mode">
          {Object.entries(MODES).map(([mode, [label, help]]) => (
            <button key={mode} role="radio" aria-checked={user.agentMode === mode} className={`opt ${user.agentMode === mode ? 'on' : ''}`} onClick={() => save({ agentMode: mode }, `Your agent: ${label.toLowerCase()}`)} disabled={Boolean(saving)}>
              <span><b>{label}</b><em>{help}</em></span>
            </button>
          ))}
        </div>
      </section>

      <section className="card set-sec">
        <div className="set-row">
          <div><h2 className="t-h3">Learn from my chats</h2><p className="small">After you take over, your own messages help your agent sound like you. Only your words are kept, never theirs.</p></div>
          <button role="switch" aria-checked={learn} className={`switch ${learn ? 'on' : ''}`} onClick={() => save({ learnFromChats: !learn }, learn ? 'Your agent won’t learn from your chats' : 'Your agent will learn from your chats')} disabled={Boolean(saving)}>
            <span className="sr-only">Learn from my chats</span><i aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="card set-sec">
        <div className="set-row">
          <div><h2 className="t-h3">Live check</h2><p className="small">{user.liveCheck?.status === 'passed' ? `Passed on ${new Date(user.liveCheck.checkedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}. Your profile shows “Live-checked”.` : user.liveCheck?.status === 'failed' ? 'Not passed yet. It’s optional.' : 'Not done. Two quick moves on camera show you’re a real person. Optional.'}</p></div>
          <Link className="btn secondary" to="/live-check">{user.liveCheck?.status === 'passed' ? 'Check again' : user.liveCheck?.status === 'failed' ? 'Try again' : 'Do the live check'}</Link>
        </div>
      </section>

      <section className="card set-sec">
        <h2 className="t-h3">Appearance</h2>
        <Segmented label="Theme" value={theme} onChange={(t) => { setTheme(t); applyTheme(t) }} options={[{ value: 'system', label: 'Match my device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Lamplight' }]} />
      </section>

      <section className="card set-sec">
        <div className="set-row">
          <div><h2 className="t-h3">Your profile</h2><p className="small">Photos, bio, prompts and who you’d like to meet. What your agent knows about you lives in <Link className="text-link" to="/you">This is you</Link>.</p></div>
          <Link className="btn secondary" to="/profile">Edit profile</Link>
        </div>
      </section>

      <section className="card set-sec">
        <div className="set-row">
          <div><h2 className="t-h3">Account</h2><p className="small">Signed in as {user.email}.</p></div>
          <Btn kind="secondary" onClick={() => { disconnectSocket(); logout() }}>Log out</Btn>
        </div>
        <div className="set-row danger-row">
          <div><h3 className="t-h3">Delete my account</h3><p className="small">Removes your profile, everything your agent knows about you, and your messages. It can’t be undone.</p></div>
          <Btn kind="secondary" onClick={() => setConfirm(true)}>Delete…</Btn>
        </div>
      </section>
      <p className="privacy-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" />Early conversations with your matches may be handled by AI agents, including yours. You agreed to this when you signed up.</p>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete your account?">
        <p className="t-body">Your profile, everything your agent knows about you and your messages will be removed. Chats you already continued yourself stay with the other person. This can’t be undone.</p>
        {deleteError && <ErrorBox message={deleteError} />}
        <div className="v-actions" style={{ borderTop: 0, paddingTop: 4 }}><Btn kind="secondary" onClick={() => setConfirm(false)}>Keep my account</Btn><button className="btn primary danger" onClick={deleteAccount} disabled={deleting}>Delete forever</button></div>
      </Modal>
    </div>
  )
}
