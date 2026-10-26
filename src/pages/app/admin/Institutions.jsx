import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import InstLogo from '../../../components/InstLogo.jsx'
import { fileToLogo } from '../../../lib/logoImage.js'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAction } from '../../../hooks.js'
import * as api from '../../../lib/api.js'
import { INST_TITLES } from '../../../lib/constants.js'
import { Empty, fmtDate, TabLoader, useLoad } from './shared.jsx'

/** Add or rename an institution. */
function InstForm({ inst, onClose, onSaved }) {
  const { busy, error, run } = useAction()
  const [f, setF] = useState({ name: inst?.name || '', location: inst?.location || '', note: inst?.note || '' })
  const [logo, setLogo] = useState(undefined)   // undefined = keep the saved logo, '' = remove it, a data: URL = the new one
  const [logoErr, setLogoErr] = useState('')
  const fileRef = useRef(null)
  const shownLogo = logo === undefined ? inst?.logo || null : logo || null
  const choose = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setLogoErr('')
    try { setLogo(await fileToLogo(file)) } catch (err) { setLogoErr(err.message) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  const submit = (e) => {
    e.preventDefault()
    run(async () => { const id = await api.adminSaveInstitution({ id: inst?.id || null, ...f, logo: logo === undefined ? null : logo }); await onSaved(id); onClose() }, 'Institution saved')
  }
  return (
    <div className="modal-back">
      <form className="modal form" role="dialog" aria-modal="true" aria-label={inst ? 'Edit institution' : 'Add institution'} onSubmit={submit}>
        <h3>{inst ? 'Edit institution' : 'Add institution'}</h3>
        <label>Logo (optional)</label>
        <div className="logo-pick">
          <InstLogo inst={{ name: f.name, logo: shownLogo }} size={64} />
          <div>
            <input ref={fileRef} id="in-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} aria-label="Choose a logo picture" />
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>{shownLogo ? 'Change logo' : 'Upload logo'}</button>
              {shownLogo && <button type="button" className="btn ghost" onClick={() => setLogo('')}>Remove</button>}
            </div>
            <span className="sm">PNG, JPEG or WebP. It is shrunk to fit automatically.</span>
            {logoErr && <span className="err" role="alert">{logoErr}</span>}
          </div>
        </div>
        <label htmlFor="in-n">Name</label>
        <input id="in-n" required autoFocus maxLength={120} value={f.name} onChange={set('name')} placeholder="e.g. Lagos Baptist Academy" />
        <label htmlFor="in-l">Location (optional)</label>
        <input id="in-l" maxLength={120} value={f.location} onChange={set('location')} placeholder="e.g. Obanikoro, Lagos State" />
        <label htmlFor="in-o">Short note (optional)</label>
        <input id="in-o" maxLength={200} value={f.note} onChange={set('note')} placeholder="Shown on the home page when the school is chosen" />
        <ErrorLine>{error}</ErrorLine>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || f.name.trim().length < 2}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

/** One institution: its staff and students, and a box to add people. */
function Detail({ inst, people, onBack, reload, onEdit }) {
  const confirm = useConfirm()
  const { busy, error, run } = useAction()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState('')
  const [title, setTitle] = useState('Teacher')
  const staff = useMemo(() => people.filter((p) => p.is_teacher && p.institution_id === inst.id), [people, inst.id])
  const students = useMemo(() => people.filter((p) => !p.is_teacher && !p.is_admin && p.institution_id === inst.id), [people, inst.id])
  const addable = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return people.filter((p) => !p.is_admin && p.institution_id !== inst.id &&
      (!needle || [p.full_name, p.email, p.reg_number].some((v) => String(v || '').toLowerCase().includes(needle)))).slice(0, 60)
  }, [people, inst.id, q])
  const chosen = people.find((p) => p.id === pick)
  const assign = (id, t) => run(async () => { await api.adminAssignInstitution(id, inst.id, t); await reload() })
  const remove = (p) => run(async () => { await api.adminAssignInstitution(p.id, null); await reload() })
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={onBack}>← All institutions</button>
        <button className="btn ghost" onClick={onEdit}>Edit details</button>
        <button className="btn danger" disabled={busy} onClick={async () => (await confirm({ title: `Delete ${inst.name}?`, message: `${staff.length + students.length} people are assigned to it. They stay on JAMBwise and are only taken out of the institution. Their results are not deleted.`, confirmLabel: 'Delete institution' })) && run(async () => { await api.adminDeleteInstitution(inst.id); await reload(); onBack() })}>Delete</button>
      </div>
      <div className="card">
        <div className="inst-head" style={{ marginTop: 0 }}><InstLogo inst={inst} size={56} /><h3 style={{ margin: 0 }}>{inst.name}</h3></div>
        <p className="sm">{[inst.location, inst.note].filter(Boolean).join(' · ') || 'No location or note yet.'}</p>
        <p className="sm">Login page for this institution: <code>/institution/{inst.slug}</code></p>
        <div className="inst-count">
          <div className="card st"><b>{staff.length}</b><span>teachers and officials</span></div>
          <div className="card st"><b>{students.length}</b><span>students</span></div>
        </div>
        <ErrorLine>{error}</ErrorLine>
      </div>

      <div className="card tw">
        <h3 style={{ margin: '14px 14px 6px' }}>Teachers, proprietors and officials</h3>
        <table>
          <thead><tr><th>Name</th><th>Title</th><th /></tr></thead>
          <tbody>
            {staff.map((p) => (
              <tr key={p.id}>
                <td><b>{p.full_name}</b><br /><span className="sm">{p.email}</span></td>
                <td>
                  <select aria-label={`Title of ${p.full_name}`} value={p.inst_title || 'Teacher'} disabled={busy} onChange={(e) => assign(p.id, e.target.value)} style={{ margin: 0 }}>
                    {INST_TITLES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td className="acts"><button className="btn ghost" disabled={busy} onClick={() => remove(p)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {staff.length === 0 && <Empty>No staff yet. Add a teacher below. They will see only this institution's students.</Empty>}
      </div>

      <div className="card tw">
        <h3 style={{ margin: '14px 14px 6px' }}>Students</h3>
        <table>
          <thead><tr><th>Student</th><th>Reg number</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {students.map((p) => (
              <tr key={p.id}>
                <td><b>{p.full_name}</b><br /><span className="sm">{p.email}</span></td>
                <td>{p.reg_number}</td>
                <td>{fmtDate(p.created_at)}</td>
                <td className="acts"><button className="btn ghost" disabled={busy} onClick={() => remove(p)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.length === 0 && <Empty>No students yet.</Empty>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a person to {inst.name}</h3>
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search people to add" placeholder="Search name, email or number" value={q} onChange={(e) => { setQ(e.target.value); setPick('') }} /></span>
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <select aria-label="Person to add" value={pick} onChange={(e) => setPick(e.target.value)} style={{ margin: 0, maxWidth: 360 }}>
            <option value="">Choose a person…</option>
            {addable.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.email}){p.is_teacher ? ' – teacher' : ''}{p.institution ? ' – now at ' + p.institution : ''}</option>)}
          </select>
          {chosen?.is_teacher && (
            <select aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ margin: 0, maxWidth: 160 }}>{INST_TITLES.map((t) => <option key={t}>{t}</option>)}</select>
          )}
          <button className="btn" disabled={busy || !chosen} onClick={() => assign(chosen.id, chosen.is_teacher ? title : null).then(() => { setPick(''); setQ('') })}>Add to institution</button>
        </div>
        <p className="sm">To make a new teacher, proprietor or official, use <b>Teachers → Add teacher</b>, then add them here (or choose the institution while adding).</p>
      </div>
    </>
  )
}

/** Admin only: the list of institutions, who belongs to each, and the tools to add, edit, delete and assign. */
export default function Institutions() {
  const fetchAll = useCallback(async () => {
    const [inst, people] = await Promise.all([api.getInstitutions({ logo: true }), api.adminStudents()])
    return { list: inst.list, builtIn: inst.builtIn, people }
  }, [])
  const { data, error, loading, reload } = useLoad(fetchAll)
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)   // null | 'new' | an institution
  const [openId, setOpenId] = useState(null)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.list || []).filter((i) => !needle || [i.name, i.location, i.note].some((v) => String(v || '').toLowerCase().includes(needle)))
  }, [data, q])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const { list, builtIn, people } = data
  if (builtIn) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Institutions are not switched on yet</h3>
        <p>Your database does not have the institutions table. In Supabase, open the <b>SQL Editor</b>, run <code>supabase/migrate-institutions.sql</code>, then reload this page.</p>
      </div>
    )
  }
  const current = list.find((i) => i.id === openId)
  if (current) return <><Detail inst={current} people={people} onBack={() => setOpenId(null)} reload={reload} onEdit={() => setForm(current)} />{form && <InstForm inst={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={async () => { await reload() }} />}</>
  const count = (id) => ({ staff: people.filter((p) => p.is_teacher && p.institution_id === id).length, students: people.filter((p) => !p.is_teacher && !p.is_admin && p.institution_id === id).length })
  return (
    <>
      <div className="adm-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search institutions" placeholder="Search name or location" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={16} /> Add institution</button>
      </div>
      <p className="sm">{shown.length} of {list.length} institutions</p>
      <div className="card tw">
        <table>
          <thead><tr><th>Institution</th><th>Location</th><th>Staff</th><th>Students</th><th /></tr></thead>
          <tbody>
            {shown.map((i) => {
              const c = count(i.id)
              return (
                <tr key={i.id}>
                  <td><span className="who-cell"><InstLogo inst={i} size={36} /><span><button className="linkish" onClick={() => { setOpenId(i.id); window.scrollTo({ top: 0 }) }}>{i.name}</button>{i.note && <><br /><span className="sm">{i.note}</span></>}</span></span></td>
                  <td>{i.location || '–'}</td>
                  <td>{c.staff}</td>
                  <td>{c.students}</td>
                  <td className="acts"><button className="btn ghost" onClick={() => { setOpenId(i.id); window.scrollTo({ top: 0 }) }}>Manage</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>{list.length ? 'No institutions match.' : 'No institutions yet. Use Add institution.'}</Empty>}
      </div>
      {form && <InstForm inst={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={async () => { await reload() }} />}
    </>
  )
}
