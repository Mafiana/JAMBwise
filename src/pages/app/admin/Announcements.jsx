import { useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { AnnouncementInbox } from '../../../components/Announcements.jsx'
import { Empty, fmtDateTime, TabLoader, useLoad } from './shared.jsx'

/** Admin: write an announcement, send it to everyone or privately to chosen people, and see what was sent. */
function Compose({ onSent }) {
  const { busy, error, setError, run } = useAction()
  const { data: people } = useLoad(api.adminStudents)
  const [f, setF] = useState({ title: '', body: '' })
  const [audience, setAudience] = useState('all')
  const [picked, setPicked] = useState([])   // user ids
  const [q, setQ] = useState('')
  const eligible = useMemo(() => (people || []).filter((p) => !p.is_admin), [people])
  const byId = useMemo(() => new Map(eligible.map((p) => [p.id, p])), [eligible])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return eligible.filter((p) => !picked.includes(p.id) && [p.full_name, p.email, p.reg_number].some((v) => String(v || '').toLowerCase().includes(needle))).slice(0, 8)
  }, [eligible, picked, q])
  const add = (ids) => setPicked((p) => [...new Set([...p, ...ids])])
  const send = () => {
    if (!f.title.trim()) return setError('Write a title.')
    if (!f.body.trim()) return setError('Write the message.')
    if (audience === 'private' && !picked.length) return setError('Choose at least one person.')
    return run(async () => {
      await api.adminSendAnnouncement({ title: f.title.trim(), body: f.body.trim(), audience, userIds: picked })
      setF({ title: '', body: '' }); setPicked([]); setQ('')
      await onSent()
    }, audience === 'all' ? 'Announcement sent to everyone' : `Announcement sent to ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`)
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}><Icon name="announce" size={20} /> New announcement</h3>
      <label htmlFor="an-t">Title</label>
      <input id="an-t" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="For example: New subjects added" />
      <label htmlFor="an-b">Message</label>
      <textarea id="an-b" rows={4} maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <fieldset className="an-aud">
        <legend>Who should get it?</legend>
        <label className="an-opt"><input type="radio" name="aud" checked={audience === 'all'} onChange={() => setAudience('all')} /> <span><b>Everyone</b> (public). Every student and teacher sees it.</span></label>
        <label className="an-opt"><input type="radio" name="aud" checked={audience === 'private'} onChange={() => setAudience('private')} /> <span><b>Private</b>. Only the people you choose.</span></label>
      </fieldset>
      {audience === 'private' && (
        <div className="an-people">
          <div className="row-btns">
            <button type="button" className="btn ghost" onClick={() => add(eligible.filter((p) => p.is_teacher).map((p) => p.id))}>Add all teachers</button>
            <button type="button" className="btn ghost" onClick={() => add(eligible.filter((p) => !p.is_teacher).map((p) => p.id))}>Add all students</button>
            {picked.length > 0 && <button type="button" className="linkish" onClick={() => setPicked([])}>Clear</button>}
          </div>
          <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Find a person" placeholder="Search a name, email or reg. number" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', paddingLeft: 38 }} /></span>
          {matches.length > 0 && (
            <ul className="an-found">
              {matches.map((p) => <li key={p.id}><button type="button" onClick={() => { add([p.id]); setQ('') }}><b>{p.full_name || p.email}</b>{p.is_teacher && <span className="tag muted">Teacher</span>} <span className="sm">{p.email}</span></button></li>)}
            </ul>
          )}
          {picked.length > 0 && (
            <div className="an-chips" aria-label="Chosen people">
              {picked.slice(0, 60).map((id) => <span className="an-chip" key={id}>{byId.get(id)?.full_name || byId.get(id)?.email || 'Person'}<button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))} aria-label="Remove">×</button></span>)}
              {picked.length > 60 && <span className="sm">and {picked.length - 60} more</span>}
            </div>
          )}
          <p className="sm" style={{ margin: 0 }}>{picked.length} chosen</p>
        </div>
      )}
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={busy} onClick={send}><Icon name="send" size={16} /> {busy ? 'Sending…' : 'Send announcement'}</button>
    </div>
  )
}

function Manage() {
  const { data, error, loading, reload } = useLoad(api.adminAnnouncements)
  const act = useAction()
  const confirm = useConfirm()
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const del = async (a) => {
    if (!(await confirm({ title: 'Delete this announcement?', message: 'People will no longer see it on their Announcements page. Notifications already sent stay in their bell.', confirmLabel: 'Delete' }))) return
    act.run(async () => { await api.adminDeleteAnnouncement(a.id); await reload() }, 'Deleted')
  }
  return (
    <>
      <Compose onSent={reload} />
      <ErrorLine>{act.error}</ErrorLine>
      <h3>Sent announcements</h3>
      <div className="card tw">
        <table>
          <thead><tr><th>Sent</th><th>Title</th><th>To</th><th>Message</th><th /></tr></thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td>
                <td><b>{a.title}</b></td>
                <td>{a.audience === 'all' ? <span className="tag">Everyone</span> : <span className="tag muted" title={(a.recipients || []).join(', ')}>{(a.recipients || []).length} {(a.recipients || []).length === 1 ? 'person' : 'people'}</span>}</td>
                <td style={{ minWidth: 220, overflowWrap: 'anywhere' }}>{a.body.length > 160 ? a.body.slice(0, 160) + '…' : a.body}</td>
                <td><button className="btn danger" disabled={act.busy} onClick={() => del(a)}><Icon name="trash" size={16} /> Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <Empty>Nothing sent yet.</Empty>}
      </div>
    </>
  )
}

/** Admins write and manage announcements; teachers just read the ones sent to them, like students. */
export default function Announcements() {
  const { isAdmin } = useAuth()
  return isAdmin ? <Manage /> : <AnnouncementInbox />
}
