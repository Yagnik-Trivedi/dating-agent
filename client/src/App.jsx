import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import Discover from './pages/Discover'
import Inbox from './pages/Inbox'
import Landing from './pages/Landing'
import { Login, Signup } from './pages/Auth'
import MatchRoom from './pages/MatchRoom'
import Matches from './pages/Matches'
import Onboarding from './pages/Onboarding'
import OnboardingReview from './pages/OnboardingReview'
import Profile from './pages/Profile'
import Report from './pages/Report'
import Settings from './pages/Settings'
import You from './pages/You'

/** Not logged in → /login. Onboarding not done → /onboarding (unless this page is part of onboarding). */
function Protected({ children, onboarding = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!onboarding && user.onboarding?.status !== 'done') return <Navigate to="/onboarding" replace />
  return children
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  return user ? <Navigate to="/discover" replace /> : children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/onboarding" element={<Protected onboarding><Onboarding /></Protected>} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/onboarding/review" element={<OnboardingReview />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/matches" element={<Matches />} />
              <Route path="/matches/:id" element={<MatchRoom />} />
              <Route path="/matches/:id/report" element={<Report />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/you" element={<You />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
