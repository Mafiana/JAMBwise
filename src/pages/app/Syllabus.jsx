import { useEffect, useMemo, useState } from 'react'
import { ErrorLine, Loader } from '../../components/ui.jsx'
import Icon from '../../components/Icons.jsx'
import Modal from '../../components/Modal.jsx'
import SubjectIcon, { SUBJECT_COLOR } from '../../components/SubjectIcon.jsx'
import * as api from '../../lib/api.js'
import { SUBJECTS } from '../../lib/constants.js'
import { fmtSize, pdfUrl } from '../../lib/syllabus.js'
import { useLoad } from './admin/shared.jsx'

/** The subject key for a syllabus title ("Use of English", "Mathematics"...), so it gets that subject's icon and colour. */
export const keyFor = (name) => {
  const n = String(name || '').trim().toLowerCase()
  return Object.keys(SUBJECTS).find((k) => SUBJECTS[k].name.toLowerCase() === n || k === n) || null
}
export const subjectLabel = (name) => String(name || '').replace(/\s+/g, '-')   // shown like Home-Economics, as on the cards

/** One syllabus PDF in a box: shown in a frame, with open and download buttons (phones often cannot show a PDF in a frame). */
function Viewer({ item, onClose }) {
  const [state, setState] = useState({ url: '', error: '' })
  useEffect(() => {
    let alive = true
    let made = ''
    api.getSyllabusFile(item.id).then((data) => {
      made = pdfUrl(data)
      if (alive) setState({ url: made, error: '' }); else URL.revokeObjectURL(made)
    }).catch((e) => alive && setState({ url: '', error: e.message }))
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [item.id])
  const file = (item.file_name || item.subject + '.pdf').replace(/[^\w.\- ]+/g, '_')
  return (
    <Modal title={`${item.subject} syllabus`} onClose={onClose} wide>
      {state.error && <ErrorLine>{state.error}</ErrorLine>}
      {!state.url && !state.error && <Loader label="Opening the syllabus…" />}
      {state.url && (
        <>
          <iframe className="syl-frame" title={`${item.subject} syllabus`} src={state.url} />
          <div className="modal-actions">
            <a className="btn ghost" href={state.url} target="_blank" rel="noreferrer"><Icon name="eye" size={16} /> Open in a new tab</a>
            <a className="btn" href={state.url} download={file}><Icon name="download" size={16} /> Download PDF{item.size_bytes ? ` (${fmtSize(item.size_bytes)})` : ''}</a>
          </div>
        </>
      )}
    </Modal>
  )
}

/** Student page: every subject's PDF syllabus as a card. */
export default function Syllabus({ embedded = false }) {
  const { data, error, loading } = useLoad(api.getSyllabi)
  const [q, setQ] = useState('')
  const [size, setSize] = useState(12)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState(null)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data || []).filter((s) => !needle || s.subject.toLowerCase().includes(needle))
  }, [data, q])
  const pages = Math.max(1, Math.ceil(shown.length / size))
  const cur = Math.min(page, pages - 1)
  const rows = shown.slice(cur * size, cur * size + size)
  return (
    <>
      {!embedded && <h1>Syllabus</h1>}
      <label htmlFor="syl-q" className="syl-lab">Search Subjects</label>
      <span className="srch syl-srch"><Icon name="search" size={20} /><input id="syl-q" type="search" placeholder="Search Subjects" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} /></span>
      <div className="syl-bar">
        <h2>PDF Syllabus</h2>
        <label className="syl-show">Show
          <select aria-label="Entries per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }}>{[12, 24, 48].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          entries
        </label>
      </div>
      {loading && <Loader label="Loading syllabus…" />}
      {!loading && !data && <ErrorLine>{error}</ErrorLine>}
      {data && rows.length === 0 && <p className="mut">{data.length ? 'No subject matches your search.' : 'No syllabus has been added yet. Please check back soon.'}</p>}
      <div className="syl-grid">
        {rows.map((s) => {
          const k = keyFor(s.subject)
          return (
            <div className="syl-card" key={s.id}>
              <span className="syl-ic" style={{ color: SUBJECT_COLOR[k] || '#16A34A' }}><SubjectIcon k={k || 'lit'} size={32} /></span>
              <h3>{subjectLabel(s.subject)}</h3>
              <button type="button" className="btn syl-btn" onClick={() => setOpen(s)}>View details <Icon name="eye" size={20} /></button>
            </div>
          )
        })}
      </div>
      {pages > 1 && (
        <div className="syl-pager">
          <button className="btn ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <span className="sm">Page {cur + 1} of {pages}</span>
          <button className="btn ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
        </div>
      )}
      {open && <Viewer item={open} onClose={() => setOpen(null)} />}
    </>
  )
}
