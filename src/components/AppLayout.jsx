import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useExam } from '../context/ExamContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { ExamProvider } from '../context/ExamContext.jsx'
import { Avatar, Logo, ThemeToggle } from './ui.jsx'
import Icon from './Icons.jsx'
import NotificationBell from './NotificationBell.jsx'
import OfflineBanner from './OfflineBanner.jsx'
import Prefetch from './Prefetch.jsx'

const NAV = [
  ['dashboard', 'Dashboard', 'home'],
  ['practice', 'Practice', 'practice'],
  ['mock', 'CBT Mock', 'mock'],
  ['examhall', 'ExamHall', 'hall'],
  ['calc', 'Score Calculator', 'calc'],
  ['planner', 'Study Planner', 'planner'],
  ['progress', 'My Progress', 'chart'],
]
const MORE = [
  ['profile', 'My Profile', 'user'],
  ['billing', 'Plans', 'card'],
  ['settings', 'Settings', 'settings'],
  ['help', 'Customer Support', 'help'],
]

// the 4th field marks pages only a full admin sees; the 5th, pages only teachers see
const ADMIN_NAV = [
  ['overview', 'Overview', 'chart', true],
  ['students', 'Students', 'user'],
  ['teachers', 'Teachers', 'users', true],
  ['chat', 'Chat with admin', 'chat', false, true],
  ['scoresheet', 'Scoresheet', 'file'],
  ['parents', 'Parent access', 'eye', true],
  ['pins', 'Access PINs', 'key', true],
  ['payments', 'Payments', 'card', true],
  ['questions', 'Questions', 'book'],
  ['messages', 'Support tickets', 'inbox'],
  ['settings', 'Prices', 'settings', true],
  ['activity', 'Activity', 'clock', true],
]

/** Shown on any other page while an exam is running (for example after a refresh), so the student can get straight back to it. */
function ExamBanner() {
  const { mock } = useExam()
  const { pathname } = useLocation()
  if (!mock || mock.done || /^\/app\/(mock|examhall)/.test(pathname)) return null
  const hall = mock.kind === 'hall'
  return (
    <div className="notice" role="status">
      <b>{hall ? 'ExamHall' : 'CBT Mock'} is in progress.</b> Your timer is still running. <Link className="btn" to={hall ? '/app/examhall' : '/app/mock'}>Return to exam</Link>
    </div>
  )
}

/** True while the window is phone-sized (the same 760px the stylesheet uses for the drawer menu). */
function usePhone() {
  const q = '(max-width: 760px)'
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false)
  const [phone, setPhone] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const m = window.matchMedia(q)
    const f = () => setPhone(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return phone
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const inAdmin = pathname.startsWith('/app/admin')
  const inExam = /^\/app\/(mock|examhall)/.test(pathname)   // exam pages are full width: no menu to wander off to
  const { profile, plan, isAdmin, isTeacher, isStaff, signOut } = useAuth()
  const phone = usePhone()
  const [drawer, setDrawer] = useState(false)   // the menu on phones
  useEffect(() => { setDrawer(false) }, [pathname])
  useEffect(() => {
    if (!drawer) return undefined
    const key = (e) => { if (e.key === 'Escape') setDrawer(false) }
    const wide = () => { if (window.innerWidth > 760) setDrawer(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', key)
    window.addEventListener('resize', wide)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', key); window.removeEventListener('resize', wide) }
  }, [drawer])
  const link = ([to, label, icon], base = '/app/') => (
    <NavLink key={to} to={`${base}${to}`} className={({ isActive }) => 'nv' + (isActive ? ' on' : '')}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  )
  return (
    <ExamProvider>
      <div className={'app' + (inExam ? ' no-side' : '')}>
        {!inExam && (
          <div className="mbar">
            <button type="button" className="burger on-app" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="app-menu" aria-label="Open menu"><Icon name="menu" size={24} /></button>
            <Logo />
            {phone && <span className="tools"><NotificationBell /><ThemeToggle /></span>}
          </div>
        )}
        {!inExam && drawer && <div className="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
        {!inExam && <aside id="app-menu" className={'side' + (drawer ? ' open' : '')} aria-label="Menu">
          <div className="row">
            <Logo />
            {!phone && <span className="tools"><NotificationBell /><ThemeToggle /></span>}
            <button type="button" className="burger on-app close-x" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="close" size={22} /></button>
          </div>
          {isStaff && (inAdmin || isTeacher) ? (
            <>
              {ADMIN_NAV.filter((n) => (isAdmin || !n[3]) && (!n[4] || !isAdmin)).map((n) => link(n, '/app/admin/'))}
              <div className="nv-sep" />
              {isTeacher
                ? <>{link(['profile', 'My Profile', 'user'])}{link(['settings', 'Settings', 'settings'])}</>
                : <NavLink to="/app/dashboard" className="nv"><Icon name="arrow" /><span>Back to student view</span></NavLink>}
            </>
          ) : (
            <>
              {NAV.map((n) => link(n))}
              <div className="nv-sep" />
              {MORE.map((n) => link(n))}
              {isStaff && (
                <>
                  <div className="nv-sep" />
                  {link(['admin', isAdmin ? 'Admin' : 'Teacher panel', 'shield'])}
                </>
              )}
            </>
          )}
          <div className="who">
            <Avatar profile={profile} />
            <b>{profile.full_name}</b>
            <span><span className="tag">{isTeacher ? 'teacher' : plan}</span> <Link to="/" onClick={signOut}>Log out</Link></span>
          </div>
        </aside>}
        <main className="main">
          <OfflineBanner />
          <ExamBanner />
          <Prefetch />
          <Outlet />
        </main>
      </div>
    </ExamProvider>
  )
}
