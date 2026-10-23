import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { lazy, Suspense } from 'react'
import { MotionConfig } from 'motion/react'
import Landing from './pages/Landing'
import { Login, Signup } from './pages/Auth'
import WakeUp from './components/WakeUp'

// The landing and auth pages load first; every signed-in screen is its own chunk.
const Discover = lazy(() => import('./pages/Discover'))
const Inbox = lazy(() => import('./pages/Inbox'))
const MatchRoom = lazy(() => import('./pages/MatchRoom'))
const Matches = lazy(() => import('./pages/Matches'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Welcome = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.Welcome })))
const Teach = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.Teach })))
const TeachModules = lazy(() => import('./pages/Modules').then((m) => ({ default: m.TeachModules }))) // plan 33
const TeachModule = lazy(() => import('./pages/Modules').then((m) => ({ default: m.TeachModule })))
const WorldStep = lazy(() => import('./pages/Modules').then((m) => ({ default: m.WorldStep })))
const Profile = lazy(() => import('./pages/Profile'))
const Replay = lazy(() => import('./pages/Replay'))
const Report = lazy(() => import('./pages/Report'))
const Settings = lazy(() => import('./pages/Settings'))
const You = lazy(() => import('./pages/You'))
const LikesYou = lazy(() => import('./pages/LikesYou'))
const ProfileView = lazy(() => import('./pages/ProfileView'))

/** Not logged in → /login. Onboarding not done → /onboarding (unless this page is part of onboarding). */
function Protected({ children, onboarding = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!onboarding && user.onboarding?.status !== 'done') return <Navigate to="/onboarding" replace />
  return children
}

/** Logged in → Discover. `/login?switch=1` shows the form anyway: log this tab into another account (lib/token.js). */
function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  return user && !new URLSearchParams(location.search).has('switch') ? <Navigate to="/discover" replace /> : children
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <WakeUp>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/onboarding" element={<Protected onboarding><Onboarding /></Protected>} />
            <Route path="/welcome" element={<Protected><Welcome /></Protected>} />
            <Route path="/onboarding/world" element={<Protected><WorldStep /></Protected>} />
            <Route path="/teach" element={<Protected><TeachModules /></Protected>} />
            <Route path="/teach/m/:id" element={<Protected><TeachModule /></Protected>} />
            <Route path="/teach/:block" element={<Protected><Teach /></Protected>} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/onboarding/review" element={<You review />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/likes" element={<LikesYou />} />
              <Route path="/u/:id" element={<ProfileView />} />
              <Route path="/matches" element={<Matches />} />
              <Route path="/matches/:id" element={<MatchRoom />} />
              <Route path="/matches/:id/report" element={<Report />} />
              <Route path="/matches/:id/replay" element={<Replay />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/you" element={<You />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
    </WakeUp>
    </MotionConfig>
  )
}
