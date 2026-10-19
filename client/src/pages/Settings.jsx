// Settings (Round 7 Step 2 design, System.jsx Settings): agent mode, Learn from my chats, profile,
// account and delete. Only settings that really exist are shown.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Inbox, Lock, LogOut, Trash2 } from 'lucide-react'
import { Btn, Seg, Sheet, Shell, Toggle } from '../components/r7'
import { useMobile } from '../components/prelude'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api, errMsg } from '../lib/api'
import { disconnectSocket } from '../lib/socket'

const MODES = {
  off: 'Your agent never talks to anyone. You chat yourself, always.',
  shadow: 'After a mutual like, your agent has the first conversation while you read along. Pause it or take over any time.',
  auto: 'Your agent has the first conversations on its own and brings you a private letter for each one.',
}

export default function Settings() {
  const mobile = useMobile()
  const { user, setUser, logout } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save(patch, done) {
    setSaving(Object.keys(patch)[0])
    try { const { data } = await api.put('/api/me/settings', patch); setUser(data.user); toast(done) } catch (err) { toast(errMsg(err), { tone: 'bad' }) } finally { setSaving(null) }
  }
  async function deleteAccount() {
    setDeleting(true)
    try { await api.delete('/api/me'); disconnectSocket(); logout() } catch (err) { toast(errMsg(err), { tone: 'bad' }); setDeleting(false) }
  }

  const learn = user.settings?.learnFromChats !== false
  const body = (
    <div className="settings">
      <section className="set-sec card"><h2 className="h3">Your agent</h2>
        <div className="set-row col"><b>Agent mode</b><Seg label="Agent mode" value={user.agentMode} onChange={(m) => m !== user.agentMode && !saving && save({ agentMode: m }, m === 'off' ? 'Your agent is off. You’ll chat yourself.' : 'Saved. Your agent will handle the first conversations.')} items={[['off', 'Off'], ['shadow', 'Shadow'], ['auto', 'Auto']]} /><p className="small">{MODES[user.agentMode]}</p></div>
        <div className="set-row"><div><b>Learn from my chats</b><span className="small">After you take over, your own messages help your agent sound like you. Only your words are kept, never theirs.</span></div>
          <Toggle on={learn} label="Learn from my chats" disabled={Boolean(saving)} onChange={(v) => save({ learnFromChats: v }, v ? 'Your agent will learn from your chats' : 'Your agent won’t learn from your chats')} /></div>
        <Link to="/inbox" className="set-row link-row"><div><b>Ask my human</b><span className="small">Questions your agent asked instead of guessing.</span></div><Inbox size={18} strokeWidth={1.7} aria-hidden="true" /></Link>
      </section>
      <section className="set-sec card"><h2 className="h3">Privacy and trust</h2>
        <Link to="/you" className="set-row link-row"><div><b>What your agent knows</b><span className="small">Make any fact public, only-if-asked or private in “This is you”.</span></div><ChevronRight size={18} strokeWidth={1.7} aria-hidden="true" /></Link>
      </section>
      <section className="set-sec card"><h2 className="h3">Account</h2>
        <Link to="/profile" className="set-row link-row"><div><b>Edit profile</b><span className="small">Photos, prompts and who you’d like to meet.</span></div><ChevronRight size={18} strokeWidth={1.7} aria-hidden="true" /></Link>
        <div className="set-row"><div><b>Signed in</b><span className="small">{user.email}</span></div><Btn kind="secondary" size="sm" icon={LogOut} onClick={() => { disconnectSocket(); logout() }}>Log out</Btn></div>
        <div className="set-row"><div><b>Delete account</b><span className="small">Removes your profile, photos, chats and everything your agent knows. This can’t be undone.</span></div><Btn kind="danger" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete</Btn></div>
      </section>
      <p className="small set-note"><Lock size={14} strokeWidth={1.7} aria-hidden="true" /> Early conversations with your matches may be handled by AI agents, including yours. You agreed to this when you signed up.</p>
      <Sheet open={confirm} title="Delete your account?" onClose={() => setConfirm(false)}
        footer={<><Btn kind="secondary" onClick={() => setConfirm(false)}>Keep my account</Btn><Btn kind="danger" icon={Trash2} loading={deleting} onClick={deleteAccount}>Delete forever</Btn></>}>
        <p className="small">Your profile, everything your agent knows about you and your messages will be removed. Chats you already continued yourself stay with the other person. This can’t be undone.</p>
      </Sheet>
    </div>
  )
  if (mobile) return <Shell title="Settings" back><div className="pad">{body}</div></Shell>
  return <Shell><div className="page narrow"><h1 className="h1">Settings</h1>{body}</div></Shell>
}
