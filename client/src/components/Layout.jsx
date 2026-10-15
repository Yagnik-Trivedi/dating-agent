import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSocketEvent } from '../hooks/useSocket'
import { useToast } from '../hooks/useToast'
import { AgentIcon } from './ui'

const NAV = [
  { to: '/discover', label: 'Discover', icon: 'M12 3l2.6 5.6L20 9.5l-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.4-.9L12 3z' },
  { to: '/matches', label: 'Matches', icon: 'M4 6h16v10H8l-4 4V6z' },
  { to: '/inbox', label: 'Inbox', icon: 'M4 5h16v14H4zM4 13h5l1 2h4l1-2h5' },
  { to: '/profile', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z' },
]

function Icon({ d }) {
  return <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
      <svg className="size-7" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)" /><path d="M16 7.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5 4.6-.7 7.8-3.9 8.5-8.5z" fill="var(--bg)" /></svg>
      dating-agent
    </span>
  )
}

/** App shell for signed-in pages: top bar on desktop, tab bar on mobile, global toasts. */
export default function Layout() {
  const toast = useToast()
  const { pathname } = useLocation()
  const { system } = useAuth()

  useSocketEvent('match:new', ({ match }) => toast(`New match with ${match.other.name}! Your agent is checking their profile…`, { to: `/matches/${match._id}`, agent: true }))
  useSocketEvent('inbox:new', () => {
    if (!pathname.startsWith('/inbox')) toast('Your agent has a question for you', { to: '/inbox', agent: true })
  })
  useSocketEvent('trust:flagged', ({ matchId }) => toast('Your agent flagged a profile as likely fake and stopped. Tap to see why.', { to: `/matches/${matchId}`, agent: true, tone: 'bad' }))
  useSocketEvent('report:ready',({ matchId }) => toast('Your agent finished a verdict', { to: `/matches/${matchId}/report`, agent: true }))

  const linkCls = ({ isActive }) => `flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition ${isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <NavLink to="/discover" aria-label="Home"><Logo /></NavLink>
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} className={linkCls}><Icon d={n.icon} />{n.label}</NavLink>)}
          </nav>
          <span className="md:hidden"><AgentIcon className="size-7" /></span>
        </div>
      </header>

      {system.agentPaused && (
        <div role="status" className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-sm font-medium text-warn">
          {system.agentPaused}. Your conversations are safe; you can still chat yourself.
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:pb-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-muted'}`}>
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
