import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { demoMode } from './lib/supabase.js'
import DemoBanner from './components/DemoBanner.jsx'
import { AdminOnly, RequireAuth, StudentOnly } from './components/Guard.jsx'
import AppLayout from './components/AppLayout.jsx'
import { Spinner } from './components/ui.jsx'
import AdminLoader from './components/AdminLoader.jsx'
import { ConfirmProvider } from './components/Confirm.jsx'
import { DoneProvider } from './components/Done.jsx'
import Landing from './pages/Landing.jsx'
import Auth from './pages/Auth.jsx'
import Contact from './pages/Contact.jsx'
import Legal from './pages/Legal.jsx'
import Institution from './pages/Institution.jsx'
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
const Parent = lazy(() => import('./pages/Parent.jsx'))
const ParentAccess = lazy(() => import('./pages/app/admin/ParentAccess.jsx'))
const Teachers = lazy(() => import('./pages/app/admin/Teachers.jsx'))
const Institutions = lazy(() => import('./pages/app/admin/Institutions.jsx'))
const StaffChatPage = lazy(() => import('./pages/app/admin/Chat.jsx'))
const Online = lazy(() => import('./pages/app/admin/Online.jsx'))
const Activity = lazy(() => import('./pages/app/admin/Activity.jsx'))
/** Admins start on Overview, teachers on Students. */
function AdminHome() { const { isAdmin } = useAuth(); return <Navigate to={isAdmin ? 'overview' : 'students'} replace /> }

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider><DoneProvider>
          {demoMode && <DemoBanner />}
          <BrowserRouter>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth/:mode" element={<Auth />} />
                <Route path="/auth" element={<Navigate to="/auth/login" replace />} />
                <Route path="/privacy" element={<Legal kind="privacy" />} />
                <Route path="/terms" element={<Legal kind="terms" />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/parent" element={<Parent />} />
                <Route path="/institution/:slug" element={<Institution />} />
                <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
                <Route path="/app" element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<StudentOnly><Dashboard /></StudentOnly>} />
                    <Route path="practice" element={<StudentOnly><Practice /></StudentOnly>} />
                    <Route path="mock" element={<StudentOnly><Mock /></StudentOnly>} />
                    <Route path="examhall" element={<StudentOnly><ExamHall /></StudentOnly>} />
                    <Route path="calc" element={<StudentOnly><Calc /></StudentOnly>} />
                    <Route path="planner" element={<StudentOnly><Planner /></StudentOnly>} />
                    <Route path="progress" element={<StudentOnly><Progress /></StudentOnly>} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="billing" element={<StudentOnly><Billing /></StudentOnly>} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="help" element={<StudentOnly><Help /></StudentOnly>} />
                    <Route path="admin" element={<Suspense fallback={<AdminLoader />}><AdminLayout /></Suspense>}>
                      <Route index element={<AdminHome />} />
                      <Route path="overview" element={<AdminOnly><Overview /></AdminOnly>} />
                      <Route path="students" element={<Students />} />
                      <Route path="teachers" element={<AdminOnly><Teachers /></AdminOnly>} />
                      <Route path="institutions" element={<AdminOnly><Institutions /></AdminOnly>} />
                      <Route path="online" element={<Online />} />
                      <Route path="chat" element={<StaffChatPage />} />
                      <Route path="parents" element={<AdminOnly><ParentAccess /></AdminOnly>} />
                      <Route path="pins" element={<AdminOnly><Pins /></AdminOnly>} />
                      <Route path="scoresheet" element={<Scoresheet />} />
                      <Route path="payments" element={<AdminOnly><Payments /></AdminOnly>} />
                      <Route path="questions" element={<Questions />} />
                      <Route path="messages" element={<Messages />} />
                      <Route path="settings" element={<AdminOnly><PriceSettings /></AdminOnly>} />
                      <Route path="activity" element={<AdminOnly><Activity /></AdminOnly>} />
                      <Route path="*" element={<AdminHome />} />
                    </Route>
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </DoneProvider></ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
