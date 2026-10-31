import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useExam } from '../context/ExamContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { ExamProvider } from '../context/ExamContext.jsx'
import { Avatar, Logo, ThemeToggle } from './ui.jsx'
import Icon from './Icons.jsx'
import { AnnouncementBanner } from './Announcements.jsx'
import NotificationBell from './NotificationBell.jsx'
import OfflineBanner from './OfflineBanner.jsx'
import Prefetch from './Prefetch.jsx'
import PinExpired from './PinExpired.jsx'
import * as api from '../lib/api.js'
import { isMail, playChime } from '../lib/utils.js'

const NAV = [
  ['dashboard', 'Dashboard', 'home'],
  ['practice', 'Practice', 'practice'],
  ['mock', 'CBT Mock', 'mock'],
  ['examhall', 'ExamHall', 'hall'],
  ['calc', 'Score Calculator', 'calc'],
  ['planner', 'Study Planner', 'planner'],
  ['progress', 'My Progress', 'chart'],
  ['syllabus', 'Syllabus', 'book'],
]
const MORE = [
  ['profile', 'My Profile', 'user'],
  ['billing', 'Plans', 'card'],
  ['announcements', 'Announcements', 'announce'],
  ['rate', 'Rate & suggest', 'star'],
  ['settings', 'Settings', 'settings'],
  ['help', 'Customer Support', 'help'],
]

// the 4th field marks pages only a full admin sees; the 5th, pages only teachers see
const ADMIN_NAV = [
  ['overview', 'Overview', 'chart', true],
  ['students', 'Students', 'user'],
  ['teachers', 'Teachers', 'users', true],
  ['institutions', 'Institutions', 'school', true],
  ['chat', 'Chat with admin', 'chat', false, true],
  ['scoresheet', 'Scoresheet', 'file'],
  ['parents', 'Parent access', 'eye', true],
  ['pins', 'Access PINs', 'key', true],
  ['payments', 'Payments', 'card', true],
  ['questions', 'Questions', 'book'],
  ['syllabus', 'Syllabus', 'book'],
  ['mail', 'Mail', 'mail', true],
  ['messages', 'Support tickets', 'inbox'],
  ['settings', 'Prices', 'settings', true],
  ['coupons', 'Coupons', 'wallet', true],
  ['announcements', 'Announcements', 'announce'],
  ['feedback', 'Feedback', 'star', true],
  ['rate', 'Rate & suggest', 'star', false, true],
  ['online', 'Who is online', 'users'],
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

/** How many unread messages are waiting in Admin > Mail (checked every 10 seconds, and again when the admin opens a page). Admins only. */
function useMailCount(enabled, pathname) {
  const [n, setN] = useState(0)
  const prev = useRef(null)
  useEffect(() => {
    if (!enabled) { setN(0); return undefined }
    let alive = true
    const load = () => api.adminMessages().then((rows) => {
      if (!alive) return
      const c = rows.filter((m) => isMail(m) && m.status === 'new').length
      if (prev.current != null && c > prev.current) playChime()   // a new message arrived while the admin was here
      prev.current = c
      setN(c)
    }).catch(() => {})
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [enabled, pathname])
  return n
}

/** How many teacher questions are waiting for the admin to Accept or Decline (checked every 10 seconds). Admins only. */
function usePendingQuestions(enabled, pathname) {
  const [n, setN] = useState(0)
  const prev = useRef(null)
  useEffect(() => {
    if (!enabled) { setN(0); return undefined }
    let alive = true
    const load = () => api.adminPendingQuestions().then((rows) => {
      if (!alive) return
      if (prev.current != null && rows.length > prev.current) playChime()
      prev.current = rows.length
      setN(rows.length)
    }).catch(() => {})
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [enabled, pathname])
  return n
}

/** How many new CBT Mock / ExamHall results have arrived since the staff member last opened the Scoresheet (checked every 10 seconds). */
function useSheetCount(enabled, pathname, uid) {
  const [n, setN] = useState(0)
  const prev = useRef(0)
  const key = `jw_sheet_seen_${uid}`
  const onSheet = /\/app\/admin\/scoresheet/.test(pathname)
  useEffect(() => {
    if (!enabled) { setN(0); return undefined }
    const read = () => { try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 } }
    const write = (v) => { try { localStorage.setItem(key, String(v)) } catch { /* private window */ } }
    if (!read()) write(Date.now())   // first time on this browser: start counting from now
    let alive = true
    const load = () => {
      if (onSheet) { write(Date.now()); prev.current = 0; setN(0); return undefined }
      return api.adminNewExamCount(read()).then((c) => {
        if (!alive) return
        if (c > prev.current) playChime()
        prev.current = c
        setN(c)
      }).catch(() => {})
    }
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => { alive = false; clearInterval(t) }
  }, [enabled, onSheet, key])
  return n
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const inAdmin = pathname.startsWith('/app/admin')
  const inExam = /^\/app\/(mock|examhall)/.test(pathname)   // exam pages are full width: no menu to wander off to
  const { profile, plan, isAdmin, isTeacher, isStaff, signOut } = useAuth()
  const phone = usePhone()
  const mailN = useMailCount(isAdmin && isStaff, pathname)
  const sheetN = useSheetCount(isStaff, pathname, profile?.id)
  const pendQ = usePendingQuestions(isAdmin && isStaff, pathname)
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
      <Icon name={icon} className={(to === 'mail' && mailN > 0) || (to === 'scoresheet' && sheetN > 0) || (to === 'questions' && pendQ > 0) ? 'mail-blink' : undefined} />
      <span>{label}</span>
      {to === 'scoresheet' && sheetN > 0 && <b className="nv-n" aria-label={`${sheetN} new results`}>{sheetN > 9 ? '9+' : sheetN}</b>}
      {to === 'questions' && pendQ > 0 && <b className="nv-n" aria-label={`${pendQ} questions to review`}>{pendQ > 9 ? '9+' : pendQ}</b>}
      {to === 'mail' && mailN > 0 && <b className="nv-n" aria-label={`${mailN} unread`}>{mailN > 9 ? '9+' : mailN}</b>}
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
            <span><span className="tag">{isTeacher ? (profile.inst_title || 'Teacher').toLowerCase() : plan}</span> <Link to="/" onClick={signOut}>Log out</Link></span>
          </div>
        </aside>}
        <main className="main">
          <OfflineBanner />
          {!inExam && <AnnouncementBanner />}
          <ExamBanner />
          <Prefetch />
          {!inExam && <PinExpired />}
          <Outlet />
        </main>
      </div>
    </ExamProvider>
  )
}
