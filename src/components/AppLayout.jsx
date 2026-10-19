import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ExamProvider } from '../context/ExamContext.jsx'
import { Avatar, Logo, ThemeToggle } from './ui.jsx'
import Icon from './Icons.jsx'
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

export default function AppLayout() {
  const { profile, plan, isAdmin, signOut } = useAuth()
  const link = ([to, label, icon]) => (
    <NavLink key={to} to={`/app/${to}`} className={({ isActive }) => 'nv' + (isActive ? ' on' : '')}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  )
  return (
    <ExamProvider>
      <div className="app">
        <aside className="side">
          <div className="row">
            <Logo />
            <ThemeToggle />
          </div>
          {NAV.map(link)}
          <div className="nv-sep" />
          {MORE.map(link)}
          {isAdmin && (
            <>
              <div className="nv-sep" />
              {link(['admin', 'Admin', 'shield'])}
            </>
          )}
          <div className="who">
            <Avatar profile={profile} />
            <b>{profile.full_name}</b>
            <span><span className="tag">{plan}</span> <Link to="/" onClick={signOut}>Log out</Link></span>
          </div>
        </aside>
        <main className="main">
          <OfflineBanner />
          <Prefetch />
          <Outlet />
        </main>
      </div>
    </ExamProvider>
  )
}
