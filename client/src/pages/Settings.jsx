import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ErrorBox, Modal, Segmented } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { AGENT_MODES } from '../lib/status'

function applyTheme(theme) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme
    localStorage.removeItem('theme')
  } else {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }
}

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') ?? 'system')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  async function setMode(agentMode) {
    setSaving(agentMode)
    try {
      const { data } = await api.put('/api/me/settings', { agentMode })
      setUser(data.user)
      toast(`Agent mode: ${AGENT_MODES[agentMode].label}`)
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
      logout()
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteError(errMsg(err))
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>

      <Card>
        <h2 className="font-display text-xl font-semibold">Your agent</h2>
        <p className="mt-1 text-sm text-muted">The default for new matches. You can take over any single conversation with one tap.</p>
        <div role="radiogroup" aria-label="Agent mode" className="mt-4 space-y-2">
          {Object.entries(AGENT_MODES).map(([mode, m]) => (
            <button key={mode} role="radio" aria-checked={user.agentMode === mode} onClick={() => setMode(mode)} disabled={Boolean(saving)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${user.agentMode === mode ? 'border-agent bg-agent-soft' : 'border-line hover:bg-surface-2'}`}>
              <span className={`mt-1 size-4 shrink-0 rounded-full border-2 ${user.agentMode === mode ? 'border-agent bg-agent' : 'border-muted'}`} aria-hidden="true" />
              <span>
                <span className="font-semibold">{m.label}</span>
                <span className="mt-0.5 block text-sm text-muted">{m.help}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Appearance</h2>
        <Segmented label="Theme" value={theme} onChange={(t) => { setTheme(t); applyTheme(t) }} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Signed in as {user.name}</h2>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <Button variant="secondary" onClick={() => { logout(); navigate('/login') }}>Log out</Button>
      </Card>

      <Card className="border-bad/30">
        <h2 className="font-semibold text-bad">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Removes your profile, knowledge graph, likes, messages and inbox. This can’t be undone.</p>
        <Button variant="danger" className="mt-4" onClick={() => setConfirmOpen(true)}>Delete my account</Button>
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete your account?">
        <p className="text-muted">Everything about you is removed and your matches are closed. This can’t be undone.</p>
        {deleteError && <div className="mt-3"><ErrorBox message={deleteError} /></div>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={deleteAccount} loading={deleting}>Delete forever</Button>
        </div>
      </Modal>
    </div>
  )
}
