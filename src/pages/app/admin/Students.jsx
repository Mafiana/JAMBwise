import { useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import { Empty, fmtDate, PLAN_IDS, useLoad, TabLoader } from './shared.jsx'

function StudentCard({ s, me, onClose, reload }) {
  const { busy, error, run } = useAction()
  const confirm = useConfirm()
  const [f, setF] = useState({ name: s.full_name || '', course: s.course || '', school: s.school || '' })
  const [plan, setPlan] = useState(s.plan)
  const [days, setDays] = useState(30)
  const [done, setDone] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const act = (msg, fn) => run(async () => { await fn(); await reload(); setDone(msg) })
  const self = s.id === me
  return (
    <div className="card" aria-label={`Student ${s.reg_number}`}>
      <div className="bar"><h3>{s.full_name} <span className="sm">{s.reg_number}</span></h3><button className="btn ghost" onClick={onClose}>Close</button></div>
      <p className="sm">{s.email} · joined {fmtDate(s.created_at)} · last practised {fmtDate(s.last_active)}{s.suspended ? ' · SUSPENDED' : ''}{s.is_admin ? ' · ADMIN' : ''}</p>
      <div className="adm-form">
        <div><label htmlFor="sn">Full name</label><input id="sn" value={f.name} onChange={set('name')} /></div>
        <div><label htmlFor="sc">Course</label><input id="sc" value={f.course} onChange={set('course')} /></div>
        <div><label htmlFor="ss">Target university</label><input id="ss" value={f.school} onChange={set('school')} /></div>
      </div>
      <button className="btn" disabled={busy} onClick={() => act('Details saved.', () => api.adminSetStudent(s.id, { ...f, suspended: s.suspended }))}>Save details</button>

      <h3>Plan</h3>
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLAN_IDS.map((p) => <option key={p}>{p}</option>)}</select>
        {plan !== 'free' && <input aria-label="Days of access" type="number" min="1" max="3650" value={days} onChange={(e) => setDays(e.target.value)} style={{ maxWidth: 90 }} />}
        <button className="btn" disabled={busy} onClick={() => act('Plan updated.', () => api.adminSetPlan(s.id, plan, Number(days) || 30))}>Apply plan</button>
      </div>
      <p className="sm">{s.plan === 'free' ? 'Currently on Free.' : `Currently ${s.plan}${s.plan_expires ? ', ends ' + fmtDate(s.plan_expires) : ''}.`} Days count from today.</p>

      <h3>Account</h3>
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        {!self && <button className="btn ghost" disabled={busy} onClick={() => act(s.suspended ? 'Account restored.' : 'Account suspended.', () => api.adminSetStudent(s.id, { name: s.full_name, course: s.course, school: s.school, suspended: !s.suspended }))}>{s.suspended ? 'Restore account' : 'Suspend account'}</button>}
        {!self && <button className="btn ghost" disabled={busy} onClick={async () => (await confirm({ danger: false, title: s.is_admin ? 'Remove admin rights?' : 'Make this student an admin?', message: s.is_admin ? `${s.full_name} will lose access to the admin panel.` : `${s.full_name} will be able to manage students, payments, questions and prices.`, confirmLabel: s.is_admin ? 'Remove admin' : 'Make admin' })) && act(s.is_admin ? 'Admin rights removed.' : 'Now an admin.', () => api.adminSetRole(s.id, !s.is_admin))}>{s.is_admin ? 'Remove admin' : 'Make admin'}</button>}
        <button className="btn ghost" disabled={busy} onClick={async () => (await confirm({ title: 'Reset progress?', message: `All practice and mock history for ${s.full_name} will be erased. This cannot be undone.`, confirmLabel: 'Reset progress' })) && act('Progress reset.', () => api.adminResetProgress(s.id))}>Reset progress</button>
        {!self && <button className="btn danger" disabled={busy} onClick={async () => (await confirm({ title: 'Delete this account?', message: `${s.full_name} and all their data will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete account' })) && run(async () => { await api.adminDeleteUser(s.id); await reload(); onClose() })}>Delete account</button>}
      </div>
      <ErrorLine>{error}</ErrorLine>
      {done && !error && <p className="sm ok" role="status">{done}</p>}
    </div>
  )
}

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
  const exportCsv = () => downloadText('jambwise-students.csv', toCsv(shown, [
    { label: 'Reg number', value: (s) => s.reg_number }, { label: 'Name', value: (s) => s.full_name }, { label: 'Email', value: (s) => s.email },
    { label: 'Course', value: (s) => s.course }, { label: 'School', value: (s) => s.school }, { label: 'Plan', value: (s) => s.plan },
    { label: 'Plan ends', value: (s) => s.plan_expires }, { label: 'Suspended', value: (s) => (s.suspended ? 'yes' : 'no') },
    { label: 'Questions', value: (s) => Number(s.questions) }, { label: 'Correct', value: (s) => Number(s.correct) },
    { label: 'Mocks', value: (s) => Number(s.mocks) }, { label: 'Joined', value: (s) => s.created_at }, { label: 'Last active', value: (s) => s.last_active },
  ]))
  return (
    <>
      {current && <StudentCard key={current.id} s={current} me={user.id} onClose={() => setOpen(null)} reload={reload} />}
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
                <td>{s.full_name}{s.is_admin && <span className="tag">admin</span>}{s.suspended && <span className="tag bad">suspended</span>}<br /><span className="sm">{s.email}</span></td>
                <td>{s.reg_number}</td>
                <td>{s.plan}{s.plan !== 'free' && s.plan_expires && <div className="sm">to {fmtDate(s.plan_expires)}</div>}</td>
                <td>{Number(s.questions)}</td>
                <td>{Number(s.questions) ? Math.round((Number(s.correct) / Number(s.questions)) * 100) : 0}%</td>
                <td>{Number(s.mocks)}</td>
                <td>{fmtDate(s.last_active)}</td>
                <td><button className="btn ghost" onClick={() => { setOpen(s.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No students match.</Empty>}
      </div>
    </>
  )
}
