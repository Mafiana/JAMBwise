import { useMemo, useRef, useState } from 'react'
import { ErrorLine, Loader } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import Modal from '../../../components/Modal.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { SUBJECTS } from '../../../lib/constants.js'
import { fileToPdf, fmtSize, pdfUrl } from '../../../lib/syllabus.js'
import { useAuth } from '../../../context/AuthContext.jsx'
import { useAction } from '../../../hooks.js'
import StudentSyllabus from '../Syllabus.jsx'
import { Empty, fmtDate, TabLoader, useLoad } from './shared.jsx'

const SUGGEST = [...Object.values(SUBJECTS).map((s) => s.name), 'Hausa', 'Yoruba', 'Igbo', 'History', 'Home Economics', 'Islamic Studies', 'Christian Religious Studies', 'Geography', 'Civic Education', 'Further Mathematics', 'French', 'Fine Art', 'Music', 'Computer Studies']

/** Add a syllabus: a subject name and its PDF. A subject that already has one is replaced. */
function AddForm({ existing, onClose, onSaved }) {
  const { busy, error, setError, run } = useAction()
  const [subject, setSubject] = useState('')
  const [pdf, setPdf] = useState(null)
  const fileRef = useRef(null)
  const choose = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setError('')
    try { setPdf(await fileToPdf(file)) } catch (err) { setPdf(null); setError(err.message) }
  }
  const replaces = existing.some((s) => s.subject.toLowerCase() === subject.trim().toLowerCase())
  const submit = (e) => {
    e.preventDefault()
    if (subject.trim().length < 2) return setError('Enter the subject name.')
    if (!pdf) return setError('Please choose the PDF file.')
    return run(async () => { await api.adminAddSyllabus({ subject: subject.trim(), fileName: pdf.name, size: pdf.size, data: pdf.data }); await onSaved(); onClose() }, 'Syllabus saved')
  }
  return (
    <Modal title="Add syllabus" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label htmlFor="sy-s">Subject</label>
        <input id="sy-s" list="sy-list" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} placeholder="For example Mathematics" autoComplete="off" />
        <datalist id="sy-list">{SUGGEST.map((n) => <option key={n} value={n} />)}</datalist>
        <label>PDF file</label>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={choose} aria-label="Choose the syllabus PDF" style={{ display: 'none' }} />
        <div className="row-btns">
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> {pdf ? 'Change PDF' : 'Choose PDF'}</button>
          {pdf && <span className="sm">{pdf.name} · {fmtSize(pdf.size)}</span>}
        </div>
        <p className="sm">One PDF, up to 3 MB.{replaces && <> <b>{subject.trim()}</b> already has a syllabus. Saving replaces it.</>}</p>
        <ErrorLine>{error}</ErrorLine>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save syllabus'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Admin: the syllabi students can open, with Add syllabus and Delete. */
export default function Syllabus() {
  const { isAdmin } = useAuth()
  // teachers can only view and download, exactly like students: they get the student cards, with no Add or Delete
  return isAdmin ? <Manage /> : <StudentSyllabus embedded />
}

function Manage() {
  const { data, error, loading, reload } = useLoad(api.getSyllabi)
  const act = useAction()
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data || []).filter((s) => !needle || s.subject.toLowerCase().includes(needle))
  }, [data, q])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const view = (s) => act.run(async () => { const url = pdfUrl(await api.getSyllabusFile(s.id)); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000) })
  const del = async (s) => {
    if (!(await confirm({ title: `Delete the ${s.subject} syllabus?`, message: 'Students will no longer be able to open it. You can add it again later.', confirmLabel: 'Delete' }))) return
    act.run(async () => { await api.adminDeleteSyllabus(s.id); await reload() }, 'Syllabus deleted')
  }
  return (
    <>
      <div className="adm-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search syllabus" placeholder="Search subjects" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add syllabus</button>
      </div>
      <ErrorLine>{act.error}</ErrorLine>
      <p className="sm">{shown.length} of {data.length} syllabus{data.length === 1 ? '' : 'es'}. Students see these on their Syllabus page.</p>
      <div className="card tw">
        <table>
          <thead><tr><th>Subject</th><th>File</th><th>Size</th><th>Added</th><th /></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td><b>{s.subject}</b></td>
                <td>{s.file_name || '–'}</td>
                <td>{s.size_bytes ? fmtSize(s.size_bytes) : '–'}</td>
                <td>{fmtDate(s.created_at)}</td>
                <td className="acts">
                  <button className="btn ghost" disabled={act.busy} onClick={() => view(s)}><Icon name="eye" size={16} /> View</button>{' '}
                  <button className="btn danger" disabled={act.busy} onClick={() => del(s)}><Icon name="trash" size={16} /> Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>{data.length ? 'No subject matches.' : 'No syllabus yet. Use Add syllabus.'}</Empty>}
      </div>
      {adding && <AddForm existing={data} onClose={() => setAdding(false)} onSaved={reload} />}
    </>
  )
}
