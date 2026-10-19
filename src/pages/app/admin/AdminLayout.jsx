import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import AdminLoader from '../../../components/AdminLoader.jsx'
import { Lock } from '../../../components/ui.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'

const TABS = [
  ['overview', 'Overview'], ['students', 'Students'], ['scoresheet', 'Scoresheet'], ['pins', 'Access PINs'], ['payments', 'Payments'],
  ['questions', 'Questions'], ['messages', 'Support tickets'], ['settings', 'Prices'], ['activity', 'Activity'],
]

let introShown = false   // the branded loader plays once each time the app is opened, not on every tab click

export default function AdminLayout() {
  const { isAdmin } = useAuth()
  const [intro, setIntro] = useState(!introShown)
  useEffect(() => {
    if (!intro) return undefined
    const t = setTimeout(() => { introShown = true; setIntro(false) }, 900)
    return () => clearTimeout(t)
  }, [intro])
  if (!isAdmin) return <Lock title="Admin dashboard" plan="admin" />
  if (intro) return <AdminLoader />
  return (
    <>
      <h1>Admin</h1>
      <nav className="adm-tabs" aria-label="Admin sections">
        {TABS.map(([to, label]) => <NavLink key={to} to={`/app/admin/${to}`}>{label}</NavLink>)}
      </nav>
      <Suspense fallback={<AdminLoader inline label="Loading…" />}><Outlet /></Suspense>
    </>
  )
}
