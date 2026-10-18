import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Compass, Inbox, Settings, UserRound, UsersRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSocketEvent } from '../hooks/useSocket'
import { useToast } from '../hooks/useToast'
import { useMobile } from './prelude'

// The design's app bar (desktop) and tab bar (mobile): Introductions · Matches · Inbox · This is you · Settings.
const TABS = [
  { to: '/discover', label: 'Introductions', short: 'Intros', icon: Compass },
  { to: '/matches', label: 'Matches', icon: UsersRound },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/you', label: 'This is you', short: 'You', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export const Logo = ({ sm }) => <span className={`wordmark ${sm ? 'sm' : ''}`}>Prelude</span>

/** App shell for signed-in pages, plus the app-wide toasts. Full-height screens (match room, verdict) hide the bars on mobile. */
export default function Layout() {
  const toast = useToast()
  const { pathname } = useLocation()
  const { user, system } = useAuth()
  const mobile = useMobile()
  const narrow = useMobile(1100)
  const fullScreen = narrow && /^\/matches\/[^/]+(\/report)?\/?$/.test(pathname) // below 1100 px the room and the verdict bring their own top bar

  useSocketEvent('match:new', ({ match }) => toast(`You and ${match.other.name} liked each other. Your agent is reading their profile…`, { to: `/matches/${match._id}`, agent: true }))
  useSocketEvent('inbox:new', () => { if (!pathname.startsWith('/inbox')) toast('Your agent has a question for you', { to: '/inbox', agent: true }) })
  useSocketEvent('trust:flagged', ({ matchId }) => toast('Your agent thinks a profile is fake and stopped talking. Tap to see why.', { to: `/matches/${matchId}`, agent: true, tone: 'bad' }))
  useSocketEvent('report:ready', ({ matchId }) => toast('Your agent’s read is ready', { to: `/matches/${matchId}/report`, agent: true }))

  return (
    <div className="shell">
      {!mobile && !fullScreen && (
        <nav className="app-bar" aria-label="Main">
          <NavLink to="/discover" aria-label="Prelude home"><Logo sm /></NavLink>
          <div className="app-tabs">{TABS.map((t) => <NavLink key={t.to} to={t.to}>{t.label}</NavLink>)}</div>
          <NavLink to="/settings" className="avatar" aria-label="Your account">{(user?.name ?? '?').slice(0, 1).toUpperCase()}</NavLink>
        </nav>
      )}
      {system.agentPaused && <div role="status" className="banner">{system.agentPaused}. Your conversations are safe, and you can still chat yourself.</div>}
      <main><Outlet /></main>
      {mobile && !fullScreen && (
        <nav className="tabbar" aria-label="Main">
          {TABS.map(({ to, label, short, icon: I }) => <NavLink key={to} to={to}><I size={20} strokeWidth={1.6} aria-hidden="true" /><span>{short ?? label}</span></NavLink>)}
        </nav>
      )}
    </div>
  )
}
