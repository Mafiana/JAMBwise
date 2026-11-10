import PlanBadge from '../../../components/PlanBadge.jsx'
import { useEffect, useMemo, useState } from 'react'
import { Avatar, ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import { Empty, fmtDate, PLAN_IDS, useLoad, TabLoader, Pagination, useAvatars } from './shared.jsx'
import StudentDetail from './StudentDetail.jsx'
import ExamLog from './ExamLog.jsx'
import AddUser from './AddUser.jsx'
import { useInstitutions } from './InstitutionAssign.jsx'

export default function Students() {
  const { user, isAdmin } = useAuth()
  const { data: all, error, loading, reload } = useLoad(api.adminStudents)
  // this page is for students only: admins and teachers have their own pages (Teachers), so they never appear here, whoever is looking
  const data = useMemo(() => (all ? all.filter((s) => !s.is_admin && !s.is_teacher) : all), [all])
  const [q, setQ] = useState('')
  const [planF, setPlanF] = useState('all')
  const [instF, setInstF] = useState('all')
  const insts = useInstitutions()
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const [logOf, setLogOf] = useState(null)   // the student whose exam log is showing
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data || []).filter((s) => (planF === 'all' || s.plan === planF || (planF === 'suspended' && s.suspended)) &&
      (instF === 'all' || (instF === 'none' ? !s.institution_id : s.institution_id === instF)) &&
      (!needle || [s.full_name, s.email, s.reg_number, s.school].some((v) => String(v || '').toLowerCase().includes(needle))))
  }, [data, q, planF, instF])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [q, planF, instF, pageSize])
  const lastPage = Math.max(1, Math.ceil(shown.length / pageSize))
  const pageNo = Math.min(page, lastPage)
  const pageRows = useMemo(() => shown.slice((pageNo - 1) * pageSize, pageNo * pageSize), [shown, pageNo, pageSize])
  const pics = useAvatars(pageRows.map((s) => s.id))
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const current = data.find((s) => s.id === open)
  if (current) return <StudentDetail key={current.id} s={current} me={user.id} onClose={() => { setOpen(null); window.scrollTo({ top: 0 }) }} reloadList={reload} />
  const exportCsv = () => downloadText('jambwise-students.csv', toCsv(shown, [
    { label: 'Reg number', value: (s) => s.reg_number }, { label: 'Name', value: (s) => s.full_name }, { label: 'Email', value: (s) => s.email },
    { label: 'Institution', value: (s) => s.institution }, { label: 'Course', value: (s) => s.course }, { label: 'School', value: (s) => s.school }, { label: 'Plan', value: (s) => s.plan },
    { label: 'Plan ends', value: (s) => s.plan_expires }, { label: 'Suspended', value: (s) => (s.suspended ? 'yes' : 'no') },
    { label: 'Questions', value: (s) => Number(s.questions) }, { label: 'Correct', value: (s) => Number(s.correct) },
    { label: 'Mocks', value: (s) => Number(s.mocks) }, { label: 'Joined', value: (s) => s.created_at }, { label: 'Last active', value: (s) => s.last_active },
  ]))
  return (
    <>
      <div className="adm-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search students" placeholder="Search name, email, number or school" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <select aria-label="Filter by plan" value={planF} onChange={(e) => setPlanF(e.target.value)}>
          <option value="all">All plans</option>{PLAN_IDS.map((p) => <option key={p} value={p}>{p}</option>)}<option value="suspended">Suspended</option>
        </select>
        {isAdmin && !insts.builtIn && insts.list.length > 0 && (
          <select aria-label="Filter by institution" value={instF} onChange={(e) => setInstF(e.target.value)}>
            <option value="all">All institutions</option><option value="none">No institution</option>
            {insts.list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        )}
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        {isAdmin && <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add student</button>}
      </div>
      <p className="sm">{shown.length} of {data.length} students</p>
      <div className="card tw">
        <table>
          <thead><tr><th>Student</th><th>Reg number</th>{isAdmin && <th>Institution</th>}<th>Plan</th><th>Qs</th><th>Acc</th><th>Mocks</th><th>Last active</th><th /></tr></thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id}>
                <td><span className="who-cell"><Avatar profile={{ full_name: s.full_name, avatar: pics.get(s.id) || null }} /><span><button className="linkish" onClick={() => setOpen(s.id)}>{s.full_name}</button>{s.is_admin && <span className="tag">admin</span>}{s.is_teacher && <span className="tag">teacher</span>}{s.suspended && <span className="tag bad">suspended</span>}<br /><span className="sm">{s.email}</span></span></span></td>
                <td>{s.reg_number}</td>
                {isAdmin && <td>{s.institution || <span className="sm">–</span>}</td>}
                <td><PlanBadge plan={s.plan} />{s.plan !== 'free' && s.plan_expires && <div className="sm">to {fmtDate(s.plan_expires)}</div>}</td>
                <td>{Number(s.questions)}</td>
                <td>{Number(s.questions) ? Math.round((Number(s.correct) / Number(s.questions)) * 100) : 0}%</td>
                <td>{Number(s.mocks)}</td>
                <td>{fmtDate(s.last_active)}</td>
                <td className="acts"><button className="btn ghost" onClick={() => { setOpen(s.id); window.scrollTo({ top: 0 }) }}>View</button> <button className="btn ghost" onClick={() => setLogOf(s)}>Logs</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No students match.</Empty>}
        {shown.length > 0 && <Pagination page={pageNo} pageSize={pageSize} total={shown.length} onPage={(n) => { setPage(n); window.scrollTo({ top: 0 }) }} onPageSize={setPageSize} sizes={[10, 20, 50, 100]} />}
      </div>
      {adding && <AddUser role="student" onClose={() => setAdding(false)} onDone={reload} />}
      {logOf && <ExamLog student={logOf} onClose={() => setLogOf(null)} />}
    </>
  )
}
