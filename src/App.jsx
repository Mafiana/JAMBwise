import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { demoMode } from './lib/supabase.js'
import DemoBanner from './components/DemoBanner.jsx'
import { RequireAuth } from './components/Guard.jsx'
import AppLayout from './components/AppLayout.jsx'
import { Spinner } from './components/ui.jsx'
import AdminLoader from './components/AdminLoader.jsx'
import { ConfirmProvider } from './components/Confirm.jsx'
import Landing from './pages/Landing.jsx'
import Auth from './pages/Auth.jsx'
import Contact from './pages/Contact.jsx'
import Legal from './pages/Legal.jsx'
import Dashboard from './pages/app/Dashboard.jsx'
import Practice from './pages/app/Practice.jsx'
import Mock from './pages/app/Mock.jsx'
import ExamHall from './pages/app/ExamHall.jsx'
import Calc from './pages/app/Calc.jsx'
import Progress from './pages/app/Progress.jsx'
import Profile from './pages/app/Profile.jsx'
import Billing from './pages/app/Billing.jsx'
import Settings from './pages/app/Settings.jsx'
import Help from './pages/app/Help.jsx'

// Only admins ever open these, so they load on demand.
const Planner = lazy(() => import('./pages/app/Planner.jsx'))
const AdminLayout = lazy(() => import('./pages/app/admin/AdminLayout.jsx'))
const Overview = lazy(() => import('./pages/app/admin/Overview.jsx'))
const Students = lazy(() => import('./pages/app/admin/Students.jsx'))
const Pins = lazy(() => import('./pages/app/admin/Pins.jsx'))
const Scoresheet = lazy(() => import('./pages/app/admin/Scoresheet.jsx'))
const Payments = lazy(() => import('./pages/app/admin/Payments.jsx'))
const Questions = lazy(() => import('./pages/app/admin/Questions.jsx'))
const Messages = lazy(() => import('./pages/app/admin/Messages.jsx'))
const PriceSettings = lazy(() => import('./pages/app/admin/PriceSettings.jsx'))
const Activity = lazy(() => import('./pages/app/admin/Activity.jsx'))

export default function App() {
  return (
    <ThemeProvider>
      {demoMode && <DemoBanner />}
      <AuthProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth/:mode" element={<Auth />} />
                <Route path="/auth" element={<Navigate to="/auth/login" replace />} />
                <Route path="/privacy" element={<Legal kind="privacy" />} />
                <Route path="/terms" element={<Legal kind="terms" />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
                <Route path="/app" element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="practice" element={<Practice />} />
                    <Route path="mock" element={<Mock />} />
                    <Route path="examhall" element={<ExamHall />} />
                    <Route path="calc" element={<Calc />} />
                    <Route path="planner" element={<Planner />} />
                    <Route path="progress" element={<Progress />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="billing" element={<Billing />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="help" element={<Help />} />
                    <Route path="admin" element={<Suspense fallback={<AdminLoader />}><AdminLayout /></Suspense>}>
                      <Route index element={<Navigate to="overview" replace />} />
                      <Route path="overview" element={<Overview />} />
                      <Route path="students" element={<Students />} />
                      <Route path="pins" element={<Pins />} />
                      <Route path="scoresheet" element={<Scoresheet />} />
                      <Route path="payments" element={<Payments />} />
                      <Route path="questions" element={<Questions />} />
                      <Route path="messages" element={<Messages />} />
                      <Route path="settings" element={<PriceSettings />} />
                      <Route path="activity" element={<Activity />} />
                      <Route path="*" element={<Navigate to="overview" replace />} />
                    </Route>
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
