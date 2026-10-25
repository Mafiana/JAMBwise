import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Avatar, ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAction } from '../../../hooks.js'
import * as api from '../../../lib/api.js'
import { Empty, fmtDate, TabLoader, useLoad } from './shared.jsx'
import AddUser, { makePassword } from './AddUser.jsx'
import StaffChat from './StaffChat.jsx'

/** Edit one teacher: details, suspend, new password, take away the role, delete. */
function EditTeacher({ t, onClose, reload }) {
  const { busy, error, run } = useAction()
  const confirm = useConfirm()
  const [f, setF] = useState({ name: t.full_name || '', course: t.course || '', school: t.school || '' })
  const [pw, setPw] = useState('')
  const [done, setDone] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const act = (msg, fn) => run(async () => { await fn(); await reload(); setDone(msg) })
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal form" role="dialog" aria-modal="true" aria-label={`Edit ${t.full_name}`}>
        <h3>{t.full_name}</h3>
        <p className="sm">{t.email} · {t.reg_number}{t.suspended && <span className="tag bad">suspended</span>}</p>
        <label htmlFor="et-n">Full name</label>
        <input id="et-n" value={f.name} maxLength={100} onChange={set('name')} />
        <label htmlFor="et-c">Subject or course</label>
        <input id="et-c" value={f.course} maxLength={100} onChange={set('course')} />
        <label htmlFor="et-s">School</label>
        <input id="et-s" value={f.school} maxLength={100} onChange={set('school')} />
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => act('Details saved.', () => api.adminSetStudent(t.id, { ...f, suspended: t.suspended }))}>Save details</button>

        <h4>New password</h4>
        <div className="row" style={{ gap: 8 }}>
          <input aria-label="New password" value={pw} minLength={8} maxLength={72} placeholder="At least 8 characters" onChange={(e) => setPw(e.target.value)} style={{ margin: 0 }} />
          <button type="button" className="btn danger" onClick={() => setPw(makePassword())}>Generate</button>
        </div>
        <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy || pw.length < 8} onClick={() => act(`Password changed. Tell ${t.full_name}: ${pw}`, async () => { await api.adminSetPassword(t.id, pw); setPw('') })}>Set password</button>

        <h4>Account</h4>
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn ghost" disabled={busy} onClick={() => act(t.suspended ? 'Account restored.' : 'Account suspended.', () => api.adminSetStudent(t.id, { name: t.full_name, course: t.course, school: t.school, suspended: !t.suspended }))}>{t.suspended ? 'Restore account' : 'Suspend account'}</button>
          <button className="btn ghost" disabled={busy} onClick={async () => (await confirm({ danger: false, title: 'Remove teacher access?', message: `${t.full_name} becomes an ordinary student and loses the teacher panel. Their account and chat history stay.`, confirmLabel: 'Remove access' })) && run(async () => { await api.adminSetStaffRole(t.id, 'student'); await reload(); onClose() })}>Remove teacher role</button>
          <button className="btn danger" disabled={busy} onClick={async () => (await confirm({ title: 'Delete this teacher?', message: `${t.full_name}'s account and all their data will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete account' })) && run(async () => { await api.adminDeleteUser(t.id); await reload(); onClose() })}>Delete account</button>
        </div>
        <ErrorLine>{error}</ErrorLine>
        {done && !error && <p className="sm ok" role="status">{done}</p>}
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

/** Admin only: add, edit, suspend, reset the password of, remove and chat with teachers. */
export default function Teachers() {
  const [params, setParams] = useSearchParams()
  const { data, error, loading, reload } = useLoad(api.adminStudents)
  const fetchInbox = useCallback(() => api.staffChatInbox(), [])
  const inbox = useLoad(fetchInbox)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState(null)   // id of the teacher being edited
  const chatId = params.get('chat')
  const teachers = useMemo(() => (data || []).filter((s) => s.is_teacher), [data])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return teachers.filter((s) => !needle || [s.full_name, s.email, s.reg_number].some((v) => String(v || '').toLowerCase().includes(needle)))
  }, [teachers, q])
  const last = useMemo(() => new Map((inbox.data || []).map((m) => [m.teacher_id, m])), [inbox.data])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const chatWith = teachers.find((t) => t.id === chatId)
  const editing = teachers.find((t) => t.id === edit)
  const openChat = (id) => { setParams({ chat: id }, { replace: true }); window.scrollTo({ top: 0 }) }

  return (
    <>
      <div className="adm-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search teachers" placeholder="Search name, email or number" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add teacher</button>
      </div>
      <p className="sm">{shown.length} of {teachers.length} teachers</p>

      {chatWith && (
        <div className="card" aria-label={`Chat with ${chatWith.full_name}`}>
          <div className="row" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Chat with {chatWith.full_name}</h3>
            <button className="btn danger" onClick={() => setParams({}, { replace: true })}>Close chat</button>
          </div>
          <StaffChat teacherId={chatWith.id} markLink={'/app/admin/teachers?chat=' + chatWith.id} onSent={inbox.reload} />
        </div>
      )}

      <div className="card tw">
        <table>
          <thead><tr><th>Teacher</th><th>Reg number</th><th>Last message</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {shown.map((t) => {
              const m = last.get(t.id)
              return (
                <tr key={t.id}>
                  <td><span className="who-cell"><Avatar profile={{ full_name: t.full_name, avatar: null }} /><span><b>{t.full_name}</b>{t.suspended && <span className="tag bad">suspended</span>}<br /><span className="sm">{t.email}</span></span></span></td>
                  <td>{t.reg_number}</td>
                  <td className="sm">{m ? <>{m.last_from === t.id ? 'Teacher: ' : 'You: '}{String(m.last_body).slice(0, 40)}{m.last_body.length > 40 ? '…' : ''}</> : '–'}</td>
                  <td>{fmtDate(t.created_at)}</td>
                  <td className="acts"><button className="btn ghost" onClick={() => openChat(t.id)}><Icon name="chat" size={16} /> Chat</button> <button className="btn ghost" onClick={() => setEdit(t.id)}>Edit</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>{teachers.length ? 'No teachers match.' : 'No teachers yet. Use Add teacher to make the first one.'}</Empty>}
      </div>
      {adding && <AddUser role="teacher" onClose={() => setAdding(false)} onDone={reload} />}
      {editing && <EditTeacher key={editing.id} t={editing} onClose={() => setEdit(null)} reload={reload} />}
    </>
  )
}
