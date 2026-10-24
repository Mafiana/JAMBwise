import { Suspense, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import AdminLoader from '../../../components/AdminLoader.jsx'
import { Lock } from '../../../components/ui.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'

let introShown = false   // the branded loader plays once each time the app is opened, not on every tab click

export default function AdminLayout() {
  const { isStaff, isAdmin } = useAuth()
  const [intro, setIntro] = useState(!introShown)
  useEffect(() => {
    if (!intro) return undefined
    const t = setTimeout(() => { introShown = true; setIntro(false) }, 900)
    return () => clearTimeout(t)
  }, [intro])
  if (!isStaff) return <Lock title="Admin dashboard" plan="admin" />
  if (intro) return <AdminLoader />
  return (
    <>
      <h1>{isAdmin ? 'Admin' : 'Teacher panel'}</h1>
      <Suspense fallback={<AdminLoader inline label="Loading…" />}><Outlet /></Suspense>
    </>
  )
}
