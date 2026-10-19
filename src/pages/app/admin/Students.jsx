import { useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import { Empty, fmtDate, PLAN_IDS, useLoad, TabLoader } from './shared.jsx'
import StudentDetail from './StudentDetail.jsx'

export default function Students() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useLoad(api.adminStudents)
  const [q, setQ] = useState('')
  const [planF, setPlanF] = useState('all')
  const [open, setOpen] = useState(null)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data || []).filter((s) => (planF === 'all' || s.plan === planF || (planF === 'suspended' && s.suspended)) &&
      (!needle || [s.full_name, s.email, s.reg_number, s.school].some((v) => String(v || '').toLowerCase().includes(needle))))
  }, [data, q, planF])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const current = data.find((s) => s.id === open)
  if (current) return <StudentDetail key={current.id} s={current} me={user.id} onClose={() => { setOpen(null); window.scrollTo({ top: 0 }) }} reloadList={reload} />
  const exportCsv = () => downloadText('jambwise-students.csv', toCsv(shown, [
    { label: 'Reg number', value: (s) => s.reg_number }, { label: 'Name', value: (s) => s.full_name }, { label: 'Email', value: (s) => s.email },
    { label: 'Course', value: (s) => s.course }, { label: 'School', value: (s) => s.school }, { label: 'Plan', value: (s) => s.plan },
    { label: 'Plan ends', value: (s) => s.plan_expires }, { label: 'Suspended', value: (s) => (s.suspended ? 'yes' : 'no') },
    { label: 'Questions', value: (s) => Number(s.questions) }, { label: 'Correct', value: (s) => Number(s.correct) },
    { label: 'Mocks', value: (s) => Number(s.mocks) }, { label: 'Joined', value: (s) => s.created_at }, { label: 'Last active', value: (s) => s.last_active },
  ]))
  return (
    <>
      <div className="adm-filters">
        <input aria-label="Search students" placeholder="Search name, email, number or school" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by plan" value={planF} onChange={(e) => setPlanF(e.target.value)}>
          <option value="all">All plans</option>{PLAN_IDS.map((p) => <option key={p} value={p}>{p}</option>)}<option value="suspended">Suspended</option>
        </select>
        <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      <p className="sm">{shown.length} of {data.length} students</p>
      <div className="card tw">
        <table>
          <thead><tr><th>Student</th><th>Reg number</th><th>Plan</th><th>Qs</th><th>Acc</th><th>Mocks</th><th>Last active</th><th /></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td><button className="linkish" onClick={() => setOpen(s.id)}>{s.full_name}</button>{s.is_admin && <span className="tag">admin</span>}{s.suspended && <span className="tag bad">suspended</span>}<br /><span className="sm">{s.email}</span></td>
                <td>{s.reg_number}</td>
                <td>{s.plan}{s.plan !== 'free' && s.plan_expires && <div className="sm">to {fmtDate(s.plan_expires)}</div>}</td>
                <td>{Number(s.questions)}</td>
                <td>{Number(s.questions) ? Math.round((Number(s.correct) / Number(s.questions)) * 100) : 0}%</td>
                <td>{Number(s.mocks)}</td>
                <td>{fmtDate(s.last_active)}</td>
                <td><button className="btn ghost" onClick={() => { setOpen(s.id); window.scrollTo({ top: 0 }) }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No students match.</Empty>}
      </div>
    </>
  )
}
