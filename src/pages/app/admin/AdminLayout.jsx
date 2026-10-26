import { Suspense, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import AdminLoader from '../../../components/AdminLoader.jsx'
import InstLogo from '../../../components/InstLogo.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'

/** The first word of the person's name (or the start of their email) for the greeting. */
const firstName = (p) => (p?.full_name || '').trim().split(/\s+/)[0] || (p?.email || '').split('@')[0] || 'there'

let introShown = false   // the branded loader plays once each time the app is opened, not on every tab click

export default function AdminLayout() {
  const { isStaff, isAdmin, institution, profile } = useAuth()
  const [intro, setIntro] = useState(!introShown)
  useEffect(() => {
    if (!intro) return undefined
    const t = setTimeout(() => { introShown = true; setIntro(false) }, 900)
    return () => clearTimeout(t)
  }, [intro])
  if (!isStaff) return <Navigate to="/app/dashboard" replace />   // students never see the admin area, not even a "locked" notice
  if (intro) return <AdminLoader />
  return (
    <>
      <p className="gd-hello">Good day, {firstName(profile)} <span aria-hidden="true">👋</span></p>
      <h1>{isAdmin ? 'Admin' : institution ? institution.name : 'Teacher panel'}</h1>
      {!isAdmin && institution && (
        <p className="inst-banner" role="status">
          <InstLogo inst={institution} size={34} />
          <span><b>{profile?.inst_title || 'Teacher'} panel.</b> You see the results of {institution.name}'s students only.</span>
        </p>
      )}
      <Suspense fallback={<AdminLoader inline label="Loading…" />}><Outlet /></Suspense>
    </>
  )
}
