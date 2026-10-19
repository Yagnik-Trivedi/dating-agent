import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSocketEvent } from '../hooks/useSocket'
import { useToast } from '../hooks/useToast'
import { api } from '../lib/api'
import { ShellCtx } from './r7'

/**
 * Signed-in pages: each page renders the design's <Shell> (top nav / mobile bar + tab bar); this provides what the
 * shell shows (counts, me) and the app-wide toasts that arrive over the socket.
 */
export default function Layout() {
  const toast = useToast()
  const { pathname } = useLocation()
  const { user, profile, system } = useAuth()
  const [counts, setCounts] = useState({ likesEnabled: true })
  const load = useCallback(() => {
    api.get('/api/inbox').then(({ data }) => setCounts((c) => ({ ...c, notifications: (data.items ?? []).filter((i) => i.status === 'open').length }))).catch(() => {})
    api.get('/api/likes/incoming').then(({ data }) => setCounts((c) => ({ ...c, likes: data.likes.length }))).catch(() => {})
  }, [])
  useEffect(load, [load, pathname])

  useSocketEvent('match:new', ({ match }) => toast(`You and ${match.other.name} liked each other.`, { to: `/matches/${match._id}` }))
  useSocketEvent('like:new', () => { load(); if (!pathname.startsWith('/likes')) toast('Someone liked your profile', { to: '/likes', action: 'See who' }) })
  useSocketEvent('inbox:new', () => { load(); if (!pathname.startsWith('/inbox')) toast('Your agent has a question for you', { to: '/inbox', agent: true }) })
  useSocketEvent('trust:flagged', ({ matchId }) => toast('Your agent thinks a profile is fake and stopped talking.', { to: `/matches/${matchId}`, tone: 'bad', action: 'See why' }))
  useSocketEvent('report:ready', ({ matchId }) => toast('Your agents finished talking. Your letter is ready.', { to: `/matches/${matchId}/report`, agent: true, action: 'Read it' }))

  const value = useMemo(() => ({ counts, user: profile ? { ...profile, userId: user?._id } : user }), [counts, user, profile])
  return (
    <ShellCtx.Provider value={value}>
      {system.agentPaused && <div role="status" className="sys-banner">{system.agentPaused}. Your conversations are safe, and you can still chat yourself.</div>}
      <Outlet />
    </ShellCtx.Provider>
  )
}
