import { useCallback, useMemo, useState } from 'react'
import { Avatar, ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import TicketThread from '../../../components/TicketThread.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { useAuth } from '../../../context/AuthContext.jsx'
import { SUBJECTS } from '../../../lib/constants.js'
import { naira, studentReport, TICKET_STATUS, ticketNo } from '../../../lib/utils.js'
import { fmtDate, fmtDateTime, PLAN_IDS, TabLoader, useLoad } from './shared.jsx'

const subjectName = (k) => SUBJECTS[k]?.name || k
const chip = (s) => 'tag' + (s === 'new' ? ' bad' : s === 'answered' ? ' ok' : s === 'resolved' ? ' muted' : '')
const payChip = (s) => 'tag' + (s === 'paid' ? ' ok' : s === 'failed' ? ' bad' : ' muted')

function Meter({ pct, label }) {
  return <span className="meter" role="img" aria-label={label}><i style={{ width: pct + '%' }} className={pct >= 70 ? 'hi' : pct >= 50 ? 'mid' : 'lo'} /></span>
}

function Overview({ s, rep }) {
  const rows = [
    ['Email', s.email], ['Joined', fmtDate(s.created_at)], ['Last practised', fmtDate(s.last_active)],
    ['Plan', s.plan === 'free' ? 'Free' : `${s.plan}${s.plan_expires ? ', ends ' + fmtDate(s.plan_expires) : ''}`],
    ['Course', s.course || '–'], ['Target university', s.school || '–'],
    ['Mock subjects', (s.subjects || []).length ? ['English', ...s.subjects.map(subjectName)].join(', ') : '–'],
    ['Exam date', s.exam_date ? fmtDate(s.exam_date) : 'not set'], ['Study time', s.study_hours ? `${s.study_hours} hours a day` : '–'],
  ]
  return (
    <>
      <div className="card">
        <h3>Profile</h3>
        {rows.map(([k, v]) => <div className="ln" key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
      <div className="card">
        <h3>How they are doing</h3>
        {rep.subjects.length === 0 ? <p className="sm" style={{ margin: 0 }}>No practice yet.</p> : rep.subjects.slice(0, 5).map((x) => (
          <div className="subj-row" key={x.subject}><span>{subjectName(x.subject)}</span><Meter pct={x.pct} label={`${x.pct} percent`} /><b>{x.pct}%</b></div>
        ))}
        {rep.subjects.length > 5 && <p className="sm" style={{ marginBottom: 0 }}>See the Scores tab for all {rep.subjects.length} subjects.</p>}
      </div>
    </>
  )
}

function Scores({ rep, attempts }) {
  const [more, setMore] = useState(false)
  if (!attempts.length) return <div className="card"><p className="sm" style={{ margin: 0 }}>This student has not practised yet.</p></div>
  const shown = more ? attempts : attempts.slice(0, 10)
  return (
    <>
      <div className="card tw">
        <h3>By subject</h3>
        <table>
          <thead><tr><th>Subject</th><th>Sessions</th><th>Questions</th><th>Correct</th><th>Accuracy</th></tr></thead>
          <tbody>{rep.subjects.map((x) => (
            <tr key={x.subject}><td>{subjectName(x.subject)}</td><td>{x.sessions}</td><td>{x.total}</td><td>{x.correct}</td><td><span className="acc"><Meter pct={x.pct} label={`${x.pct} percent`} /> {x.pct}%</span></td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card">
        <h3>Mock exams {rep.mocks.length > 0 && <span className="sm">best {rep.bestMock} / 400</span>}</h3>
        {rep.mocks.length === 0 ? <p className="sm" style={{ margin: 0 }}>No mock exams yet.</p> : rep.mocks.slice(0, 8).map((m, i) => (
          <div className="ln" key={i}><span>{fmtDateTime(m.date)}</span><b>{m.score} / 400</b></div>
        ))}
      </div>
      <div className="card tw">
        <h3>Recent sessions</h3>
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Subject</th><th>Score</th></tr></thead>
          <tbody>{shown.map((a) => (
            <tr key={a.id}><td>{fmtDateTime(a.created_at)}</td><td>{a.kind === 'mock' ? 'Mock' : a.kind === 'hall' ? 'ExamHall' : 'Practice'}</td><td>{subjectName(a.subject)}</td><td>{a.correct} / {a.total} <span className="sm">({Math.round((a.correct / a.total) * 100)}%)</span></td></tr>
          ))}</tbody>
        </table>
        {attempts.length > 10 && <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show all ${attempts.length}`}</button>}
      </div>
    </>
  )
}

function Payments({ payments }) {
  const paid = payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_kobo, 0)
  if (!payments.length) return <div className="card"><p className="sm" style={{ margin: 0 }}>No payments yet. If they joined with an Access PIN, they will not have any.</p></div>
  return (
    <div className="card tw">
      <h3>Payments <span className="sm">{naira(paid)} paid in total</span></h3>
      <table>
        <thead><tr><th>Reference</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>{payments.map((p) => (
          <tr key={p.reference}><td><code>{p.reference}</code></td><td>{p.plan}</td><td>{naira(p.amount_kobo)}</td><td><span className={payChip(p.status)}>{p.status}</span></td><td>{fmtDateTime(p.paid_at || p.created_at)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function Tickets({ tickets, reload }) {
  const [open, setOpen] = useState(null)
  if (!tickets.length) return <div className="card"><p className="sm" style={{ margin: 0 }}>This student has not opened any tickets.</p></div>
  return tickets.map((t) => (
    <div className={'card ticket' + (open === t.id ? ' open' : '')} key={t.id}>
      <button className="ticket-head" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
        <span className="ticket-id">{ticketNo(t.id)}</span>
        <span className="ticket-sub">{t.subject || t.body.slice(0, 60)}</span>
        <span className={chip(t.status)}>{TICKET_STATUS[t.status]}</span>
        <span className="ticket-date">{fmtDate(t.created_at)}</span>
      </button>
      {open === t.id && <TicketThread ticket={t} staff onChange={reload} />}
    </div>
  ))
}

const ROLE_TEXT = {
  student: '{name} will lose access to the admin and teacher panels.',
  teacher: '{name} will be able to view students, scores and exam logs, add and edit questions and answer tickets. They will not see payments, PINs, prices or activity, and cannot change plans, schedules, retakes or delete anything.',
  admin: '{name} will be able to manage students, payments, PINs, questions, prices and everything else.',
}

function Manage({ s, me, onClose, reloadList }) {
  const { busy, error, run } = useAction()
  const confirm = useConfirm()
  const [f, setF] = useState({ name: s.full_name || '', course: s.course || '', school: s.school || '' })
  const [plan, setPlan] = useState(s.plan)
  const [days, setDays] = useState(30)
  const [done, setDone] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const act = (msg, fn) => run(async () => { await fn(); await reloadList(); setDone(msg) })
  const self = s.id === me
  const current = s.is_admin ? 'admin' : s.is_teacher ? 'teacher' : 'student'
  const [role, setRole] = useState(current)
  return (
    <div className="card">
      <h3>Details</h3>
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
        {!self && (
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="student">Student (no staff access)</option><option value="teacher">Teacher</option><option value="admin">Admin</option>
            </select>
            <button className="btn ghost" disabled={busy || role === current} onClick={async () => (await confirm({ danger: false, title: 'Change role to ' + role + '?', message: ROLE_TEXT[role].replace('{name}', s.full_name), confirmLabel: 'Change role' })) && act('Role changed to ' + role + '.', () => api.adminSetStaffRole(s.id, role))}>Change role</button>
          </span>
        )}
        <button className="btn ghost" disabled={busy} onClick={async () => (await confirm({ title: 'Reset progress?', message: `All practice and mock history for ${s.full_name} will be erased. This cannot be undone.`, confirmLabel: 'Reset progress' })) && act('Progress reset.', () => api.adminResetProgress(s.id))}>Reset progress</button>
        {!self && <button className="btn danger" disabled={busy} onClick={async () => (await confirm({ title: 'Delete this account?', message: `${s.full_name} and all their data will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete account' })) && run(async () => { await api.adminDeleteUser(s.id); await reloadList(); onClose() })}>Delete account</button>}
      </div>
      <ErrorLine>{error}</ErrorLine>
      {done && !error && <p className="sm ok" role="status">{done}</p>}
    </div>
  )
}

/** Everything about one student in one place: profile, scores by subject, mock results, payments, tickets, and the account controls. */
export default function StudentDetail({ s, me, onClose, reloadList }) {
  const { isAdmin } = useAuth()   // teachers get a read-only view: no payments, no account controls
  const [tab, setTab] = useState('overview')
  const fetchDetail = useCallback(() => api.adminStudentDetail(s.id), [s.id])
  const { data, error, loading, reload } = useLoad(fetchDetail)
  const rep = useMemo(() => studentReport(data?.attempts || []), [data])
  const paid = (data?.payments || []).filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_kobo, 0)
  const open = (data?.tickets || []).filter((t) => t.status === 'new' || t.status === 'read').length
  const TABS = [['overview', 'Overview'], ['scores', 'Scores'], ...(isAdmin ? [['payments', 'Payments', data?.payments.length]] : []), ['tickets', 'Tickets', data?.tickets.length], ...(isAdmin ? [['manage', 'Manage']] : [])]

  // after a change in Manage the list is reloaded; the student's own numbers are reloaded too
  const reloadAll = async () => { await reloadList(); await reload() }
  return (
    <div aria-label={`Student ${s.reg_number}`}>
      <button className="btn ghost back" onClick={onClose}><Icon name="chevl" size={16} /> All students</button>
      <div className="card sd-head">
        <Avatar profile={{ full_name: s.full_name, avatar: null }} />
        <div className="sd-id">
          <h2>{s.full_name}{s.is_admin && <span className="tag">admin</span>}{s.is_teacher && <span className="tag">teacher</span>}{s.suspended && <span className="tag bad">suspended</span>}</h2>
          <span className="sm">{s.reg_number} · {s.email}</span>
        </div>
        <span className="tag">{s.plan}</span>
      </div>
      <div className="stat-grid s4">
        <div className="card st"><b>{loading ? '–' : rep.total}</b><span>questions answered</span></div>
        <div className="card st"><b>{loading ? '–' : rep.accuracy + '%'}</b><span>accuracy</span></div>
        <div className="card st"><b>{loading ? '–' : rep.bestMock ?? '–'}</b><span>best mock, of 400</span></div>
        {isAdmin ? <div className="card st"><b>{loading ? '–' : naira(paid)}</b><span>paid so far</span></div> : <div className="card st"><b>{s.plan}</b><span>plan</span></div>}
      </div>
      <div className="dtabs" role="tablist" aria-label="Student sections">
        {TABS.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}{n > 0 && <span className="count">{n}</span>}{k === 'tickets' && open > 0 && <span className="dot" title={`${open} open`} />}
          </button>
        ))}
      </div>
      <ErrorLine>{error}</ErrorLine>
      {tab === 'manage' ? <Manage s={s} me={me} onClose={onClose} reloadList={reloadAll} /> : loading ? <TabLoader /> : data && (
        <div role="tabpanel">
          {tab === 'overview' && <Overview s={s} rep={rep} />}
          {tab === 'scores' && <Scores rep={rep} attempts={data.attempts} />}
          {tab === 'payments' && <Payments payments={data.payments} />}
          {tab === 'tickets' && <Tickets tickets={data.tickets} reload={reload} />}
        </div>
      )}
    </div>
  )
}
