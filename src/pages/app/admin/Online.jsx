import { useCallback, useEffect, useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import * as api from '../../../lib/api.js'
import { Empty, TabLoader, useLoad } from './shared.jsx'

const ROLES = { admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' }
const ago = (d) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} hr ago`
}

/** Who is using JAMBwise right now (heard from in the last 3 minutes), and who was here earlier today. Refreshes itself every 20 seconds. */
export default function Online() {
  const { data, error, loading, reload } = useLoad(api.adminOnline)
  const [role, setRole] = useState('all')
  const [q, setQ] = useState('')
  const [at, setAt] = useState(() => new Date())
  const [spin, setSpin] = useState(false)
  const refresh = useCallback(async () => {
    setSpin(true)
    try { await Promise.all([reload(), new Promise((r) => setTimeout(r, 500))]); setAt(new Date()) } finally { setSpin(false) }
  }, [reload])
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') { reload(); setAt(new Date()) } }, 20000)
    return () => clearInterval(t)
  }, [reload])
  const needle = q.trim().toLowerCase()
  const rows = useMemo(() => (data || []).filter((r) => (role === 'all' || r.role === role)
    && (!needle || [r.full_name, r.email, r.reg_number, r.institution].some((v) => (v || '').toLowerCase().includes(needle)))), [data, role, needle])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const now = rows.filter((r) => r.online)
  const earlier = rows.filter((r) => !r.online)
  const count = (r) => data.filter((x) => x.online && x.role === r).length
  const table = (list) => (
    <div className="card tw">
      <table>
        <thead><tr><th>Person</th><th>Role</th><th>Institution</th><th>Last seen</th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id}>
            <td><span className={'on-dot' + (r.online ? ' live' : '')} aria-hidden="true" /> {r.full_name || '–'}<br /><span className="sm">{r.email || r.reg_number || ''}{r.role === 'parent' && r.reg_number ? ` · child ${r.reg_number}` : ''}</span></td>
            <td><span className={'tag' + (r.role === 'admin' ? ' bad' : r.role === 'teacher' ? ' ok' : ' muted')}>{ROLES[r.role]}{r.inst_title && r.role === 'teacher' ? ' · ' + r.inst_title : ''}</span></td>
            <td>{r.institution || '–'}</td>
            <td>{r.online ? <b className="on-now">Online now</b> : ago(r.last_seen)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
  return (
    <>
      <div className="on-sum">
        <div className="card st"><b>{data.filter((x) => x.online).length}</b><span>online now</span></div>
        <div className="card st"><b>{count('student')}</b><span>students</span></div>
        <div className="card st"><b>{count('teacher') + count('admin')}</b><span>teachers and admins</span></div>
        <div className="card st"><b>{count('parent')}</b><span>parents</span></div>
      </div>
      <div className="act-filters">
        <input aria-label="Search people" placeholder="Search name, email, ID or school" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">Everyone</option>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
        </select>
        <button className="btn" onClick={refresh} disabled={spin} aria-busy={spin}><Icon name="refresh" size={16} className={spin ? 'spin' : ''} /> {spin ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <p className="sm">Updated {at.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}, and it refreshes by itself every 20 seconds. "Online" means seen in the last 3 minutes; the list keeps the last 24 hours.</p>
      <ErrorLine>{error}</ErrorLine>
      <h3>Online now ({now.length})</h3>
      {now.length ? table(now) : <Empty>Nobody matching is online right now.</Empty>}
      <h3>Seen earlier today ({earlier.length})</h3>
      {earlier.length ? table(earlier) : <Empty>No one else in the last 24 hours.</Empty>}
    </>
  )
}
