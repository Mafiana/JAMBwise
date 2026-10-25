import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorLine, Spinner } from './ui.jsx'

/** Everything under /app needs a signed-in, not-suspended student. */
export function RequireAuth() {
  const { session, booting, profile, profileError, refreshProfile, signOut } = useAuth()
  const loc = useLocation()
  if (booting) return <Spinner />
  if (!session) return <Navigate to="/auth/login" replace state={{ from: loc.pathname + loc.search }} />
  // only block the screen while there is no profile at all; later refreshes (after a payment, say) happen quietly
  if (profileError && !profile)
    return (
      <div className="ctr">
        <ErrorLine>{profileError}</ErrorLine>
        <button className="btn" onClick={refreshProfile}>Try again</button> <button className="btn ghost" onClick={signOut}>Log out</button>
      </div>
    )
  if (!profile) return <Spinner />
  if (profile.suspended)
    return (
      <div className="wrap">
        <div className="card auth c">
          <h2>Account suspended</h2>
          <p className="mut">This account has been suspended. Please contact support@jambwise.ng.</p>
          <button className="btn" onClick={signOut}>Log out</button>
        </div>
      </div>
    )
  return <Outlet />
}

export function RequireAdmin({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/app/dashboard" replace />
  return children
}

/** Student pages (practice, mocks, planner, plans...). A teacher has no student side, so they go to their panel. */
export function StudentOnly({ children }) {
  const { isTeacher } = useAuth()
  if (isTeacher) return <Navigate to="/app/admin" replace />
  return children
}

/** Pages only a full admin may open (money, PINs, prices, activity). Teachers are sent to the Students page. */
export function AdminOnly({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/app/admin/students" replace />
  return children
}
