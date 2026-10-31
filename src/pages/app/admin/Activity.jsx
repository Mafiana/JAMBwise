import { useEffect, useMemo, useState } from 'react'
import { ErrorLine, Loader } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import * as api from '../../../lib/api.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import { Empty, fmtDateTime, Pagination, useLoad, TabLoader } from './shared.jsx'

const LABEL = {
  'pin.create': 'Made a PIN', 'pin.bulk': 'Made PINs in bulk', 'student.edit': 'Edited a student', 'student.suspend': 'Suspended a student',
  'student.plan': 'Changed a plan', 'student.reset': 'Reset progress', 'mock.retake': 'Allowed a CBT Mock retake', 'hall.retake': 'Allowed an ExamHall retake', 'hall.schedule': 'Set the ExamHall schedule', 'hall.release': 'Released ExamHall results to students', 'hall.unrelease': 'Hid ExamHall results from students', 'role.teacher': 'Made a teacher', 'role.admin': 'Made an admin', 'role.student': 'Removed staff access', 'mock.schedule': 'Set the CBT Mock schedule', 'student.delete': 'Deleted a student', 'student.create': 'Added a student', 'teacher.create': 'Added a teacher', 'password.reset': 'Reset a password', 'parent.revoke': 'Switched off parent access', 'admin.grant': 'Made an admin',
  'admin.revoke': 'Removed an admin', 'login.admin': 'Admin signed in', 'login.teacher': 'Teacher signed in', 'login.student': 'Student signed in', 'parent.login': 'Parent signed in', 'parent.denied': 'Parent sign-in refused', 'institution.add': 'Added an institution', 'institution.edit': 'Edited an institution', 'institution.delete': 'Deleted an institution', 'institution.assign': 'Assigned someone to an institution', 'syllabus.add': 'Added a syllabus', 'syllabus.delete': 'Deleted a syllabus', 'question.add': 'Added a question', 'question.edit': 'Edited a question', 'question.delete': 'Deleted a question', 'plan.price': 'Changed a price', 'ticket.reply': 'Replied to a ticket', 'ticket.resolve': 'Resolved a ticket',
}
const label = (a) => LABEL[a] || a
const isSignIn = (a) => /^login\.|^parent\.(login|denied)$/.test(a)
/** Which icon and colour an entry gets: sign-ins green, parents blue, changes indigo, deletions red, money gold. */
function look(a) {
  if (/^parent\.denied$/.test(a)) return ['alert', 'red']
  if (/^parent\./.test(a)) return ['eye', 'blue']
  if (/^login\./.test(a)) return [a === 'login.student' ? 'user' : a === 'login.teacher' ? 'users' : 'shield', 'green']
  if (/delete|revoke|suspend|^role\.student/.test(a)) return ['trash', 'red']
  if (/^question/.test(a)) return ['book', 'indigo']
  if (/^plan|^pin/.test(a)) return [a.startsWith('pin') ? 'key' : 'card', 'gold']
  if (/^institution/.test(a)) return ['school', 'indigo']
  if (/^ticket/.test(a)) return ['inbox', 'indigo']
  if (/^password/.test(a)) return ['lock', 'indigo']
  return ['layers', 'indigo']
}
/** "Today", "Yesterday" or "Mon 26 Oct 2026", for the heading over each day's entries. */
function dayName(key) {
  const t = new Date(); const k = (d) => d.toLocaleDateString('en-CA')
  if (key === k(t)) return 'Today'
  t.setDate(t.getDate() - 1); if (key === k(t)) return 'Yesterday'
  return new Date(key + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const clock = (d) => new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
const day = (d) => new Date(d).toLocaleDateString('en-CA')   // yyyy-mm-dd in the admin's own time zone

/** Everything admins did, with search, filters by action, person and dates, and pages. */
export default function Activity() {
  const { data, error, loading, reload } = useLoad(api.adminActivity)
  const [refreshing, setRefreshing] = useState(false)
  const [at, setAt] = useState(() => new Date())   // when the log was last loaded
  /** Reloads the log from the server, with a loader showing for at least a moment so the click is seen to work. */
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await Promise.all([reload(), new Promise((r) => setTimeout(r, 600))]); setAt(new Date()) } finally { setRefreshing(false) }
  }
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')   // all | signins | actions
  const [action, setAction] = useState('all')
  const [who, setWho] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [oldest, setOldest] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [q, kind, action, who, from, to, oldest, pageSize])

  const actions = useMemo(() => [...new Set((data || []).map((a) => a.action))].sort((x, y) => label(x).localeCompare(label(y))), [data])
  const people = useMemo(() => [...new Set((data || []).map((a) => a.actor_email).filter(Boolean))].sort(), [data])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = (data || []).filter((a) =>
      (kind === 'all' || (kind === 'signins') === isSignIn(a.action)) && (action === 'all' || a.action === action) && (who === 'all' || a.actor_email === who) &&
      (!from || day(a.created_at) >= from) && (!to || day(a.created_at) <= to) &&
      (!needle || [label(a.action), a.action, a.actor_email, a.detail].some((v) => String(v || '').toLowerCase().includes(needle))))
    return oldest ? rows.slice().reverse() : rows
  }, [data, q, kind, action, who, from, to, oldest])

  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const lastPage = Math.max(1, Math.ceil(matches.length / pageSize))
  const current = Math.min(page, lastPage)
  const shown = matches.slice((current - 1) * pageSize, current * pageSize)
  const groups = Object.entries(shown.reduce((m, a) => { (m[day(a.created_at)] ||= []).push(a); return m }, {})).sort((x, y) => (oldest ? x[0].localeCompare(y[0]) : y[0].localeCompare(x[0])))
  const todayKey = day(new Date())
  const todays = data.filter((a) => day(a.created_at) === todayKey)
  const filtered = q || kind !== 'all' || action !== 'all' || who !== 'all' || from || to
  const clear = () => { setQ(''); setKind('all'); setAction('all'); setWho('all'); setFrom(''); setTo('') }
  const exportCsv = () => downloadText('jambwise-activity.csv', toCsv(matches, [
    { label: 'When', value: (a) => a.created_at }, { label: 'Who', value: (a) => a.actor_email }, { label: 'What', value: (a) => label(a.action) }, { label: 'Details', value: (a) => a.detail },
  ]))

  return (
    <>
      <div className="stat-grid s3 act-sum">
        <div className="card st"><span className="ic"><Icon name="clock" /></span><b>{todays.length}</b><span>entries today</span></div>
        <div className="card st"><span className="ic"><Icon name="user" /></span><b>{todays.filter((a) => isSignIn(a.action)).length}</b><span>sign-ins today</span></div>
        <div className="card st"><span className="ic"><Icon name="settings" /></span><b>{todays.filter((a) => !isSignIn(a.action)).length}</b><span>changes made today</span></div>
      </div>
      <div className="act-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search activity" placeholder="Search who, what or details" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <select aria-label="Type of entry" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Everything</option><option value="signins">Sign-ins only</option><option value="actions">Admin actions only</option>
        </select>
        <select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="all">All actions</option>{actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </select>
        <select aria-label="Filter by person" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>{people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="act-filters">
        <label>From <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <select aria-label="Order" value={oldest ? 'old' : 'new'} onChange={(e) => setOldest(e.target.value === 'old')}>
          <option value="new">Newest first</option><option value="old">Oldest first</option>
        </select>
        {filtered && <button className="btn ghost" onClick={clear}>Clear filters</button>}
        <button className="btn" onClick={refresh} disabled={refreshing} aria-busy={refreshing}><Icon name="refresh" size={16} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn" onClick={exportCsv} disabled={!matches.length}>Export CSV</button>
      </div>
      {refreshing && <Loader size="sm" label="Refreshing the list…" />}
      <p className="sm">Updated {at.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}. {matches.length} of {data.length} entries: every sign-in by admins, teachers, students and parents, and everything admins change. The log is written by the server and cannot be edited.{data.length >= 2000 ? ' Showing the latest 2000.' : ''}</p>
      <div className="card act-feed">
        {groups.map(([key, rows]) => (
          <section key={key} className="act-day">
            <h3>{dayName(key)} <span className="sm">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span></h3>
            <ul>{rows.map((a) => {
              const [ic, tone] = look(a.action)
              return (
                <li key={a.id} className="act-row">
                  <span className={'act-ic ' + tone}><Icon name={ic} size={18} /></span>
                  <div className="act-main">
                    <b>{label(a.action)}</b>
                    <span className="act-det">{a.detail || '–'}</span>
                    <span className="act-who">{a.actor_email || '–'}</span>
                  </div>
                  <time className="act-time" dateTime={a.created_at}>{clock(a.created_at)}</time>
                </li>
              )
            })}</ul>
          </section>
        ))}
        {matches.length === 0 && <Empty>{data.length ? 'No activity matches these filters.' : 'Nothing yet.'}</Empty>}
        {matches.length > 0 && <Pagination page={current} pageSize={pageSize} total={matches.length} onPage={setPage} onPageSize={setPageSize} sizes={[10, 20, 50, 100]} />}
      </div>
    </>
  )
}
