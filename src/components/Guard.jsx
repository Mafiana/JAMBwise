import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useState } from 'react'
import * as api from '../lib/api.js'
import { useAction } from '../hooks.js'
import { ErrorLine, Spinner } from './ui.jsx'

/** On the suspended-account screen: a box to write to support. It arrives in Admin > Mail. */
function SuspendedMessage() {
  const { profile, user } = useAuth()
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, setError, run } = useAction()
  if (sent) return <p className="ok" role="status">Message sent. Support will reply by email.</p>
  const send = () => {
    if (text.trim().length < 5) return setError('Please write a few words first.')
    return run(async () => {
      await api.sendMessage({ name: profile.full_name || 'Student', email: profile.email || user?.email || '', topic: 'suspended', subject: 'Suspended account', body: text, user_id: user.id })
      setSent(true)
    })
  }
  return (
    <div style={{ textAlign: 'left' }}>
      <label htmlFor="sus-m">Write to support</label>
      <textarea id="sus-m" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us why you think this is a mistake, or ask what to do next." />
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send message'}</button>
    </div>
  )
}

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
          <p className="mut">This account has been suspended.</p>
          <SuspendedMessage />
          <button className="btn danger" onClick={signOut} style={{ marginTop: 10 }}>Log out</button>
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
