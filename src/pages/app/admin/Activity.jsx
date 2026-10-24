import { useEffect, useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import * as api from '../../../lib/api.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import { Empty, fmtDateTime, Pagination, useLoad, TabLoader } from './shared.jsx'

const LABEL = {
  'pin.create': 'Made a PIN', 'pin.bulk': 'Made PINs in bulk', 'student.edit': 'Edited a student', 'student.suspend': 'Suspended a student',
  'student.plan': 'Changed a plan', 'student.reset': 'Reset progress', 'mock.retake': 'Allowed a CBT Mock retake', 'hall.retake': 'Allowed an ExamHall retake', 'hall.schedule': 'Set the ExamHall schedule', 'hall.release': 'Released ExamHall results to students', 'hall.unrelease': 'Hid ExamHall results from students', 'role.teacher': 'Made a teacher', 'role.admin': 'Made an admin', 'role.student': 'Removed staff access', 'mock.schedule': 'Set the CBT Mock schedule', 'student.delete': 'Deleted a student', 'student.create': 'Added a student', 'teacher.create': 'Added a teacher', 'password.reset': 'Reset a password', 'parent.revoke': 'Switched off parent access', 'admin.grant': 'Made an admin',
  'admin.revoke': 'Removed an admin', 'question.add': 'Added a question', 'question.edit': 'Edited a question', 'question.delete': 'Deleted a question', 'plan.price': 'Changed a price', 'ticket.reply': 'Replied to a ticket', 'ticket.resolve': 'Resolved a ticket',
}
const label = (a) => LABEL[a] || a
const day = (d) => new Date(d).toLocaleDateString('en-CA')   // yyyy-mm-dd in the admin's own time zone

/** Everything admins did, with search, filters by action, person and dates, and pages. */
export default function Activity() {
  const { data, error, loading, reload } = useLoad(api.adminAudit)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('all')
  const [who, setWho] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [oldest, setOldest] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [q, action, who, from, to, oldest, pageSize])

  const actions = useMemo(() => [...new Set((data || []).map((a) => a.action))].sort((x, y) => label(x).localeCompare(label(y))), [data])
  const people = useMemo(() => [...new Set((data || []).map((a) => a.actor_email).filter(Boolean))].sort(), [data])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = (data || []).filter((a) =>
      (action === 'all' || a.action === action) && (who === 'all' || a.actor_email === who) &&
      (!from || day(a.created_at) >= from) && (!to || day(a.created_at) <= to) &&
      (!needle || [label(a.action), a.action, a.actor_email, a.detail].some((v) => String(v || '').toLowerCase().includes(needle))))
    return oldest ? rows.slice().reverse() : rows
  }, [data, q, action, who, from, to, oldest])

  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const lastPage = Math.max(1, Math.ceil(matches.length / pageSize))
  const current = Math.min(page, lastPage)
  const shown = matches.slice((current - 1) * pageSize, current * pageSize)
  const filtered = q || action !== 'all' || who !== 'all' || from || to
  const clear = () => { setQ(''); setAction('all'); setWho('all'); setFrom(''); setTo('') }
  const exportCsv = () => downloadText('jambwise-activity.csv', toCsv(matches, [
    { label: 'When', value: (a) => a.created_at }, { label: 'Who', value: (a) => a.actor_email }, { label: 'What', value: (a) => label(a.action) }, { label: 'Details', value: (a) => a.detail },
  ]))

  return (
    <>
      <div className="act-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search activity" placeholder="Search who, what or details" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="all">All actions</option>{actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </select>
        <select aria-label="Filter by admin or teacher" value={who} onChange={(e) => setWho(e.target.value)}>
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
        <button className="btn ghost" onClick={reload}>Refresh</button>
        <button className="btn ghost" onClick={exportCsv} disabled={!matches.length}>Export CSV</button>
      </div>
      <p className="sm">{matches.length} of {data.length} entries. The log is written by the server and cannot be edited.{data.length >= 2000 ? ' Showing the latest 2000.' : ''}</p>
      <div className="card tw">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
          <tbody>{shown.map((a) => <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.actor_email || '–'}</td><td>{label(a.action)}</td><td>{a.detail}</td></tr>)}</tbody>
        </table>
        {matches.length === 0 && <Empty>{data.length ? 'No activity matches these filters.' : 'Nothing yet.'}</Empty>}
        {matches.length > 0 && <Pagination page={current} pageSize={pageSize} total={matches.length} onPage={setPage} onPageSize={setPageSize} sizes={[10, 20, 50, 100]} />}
      </div>
    </>
  )
}
