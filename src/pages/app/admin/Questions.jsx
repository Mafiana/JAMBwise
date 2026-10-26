import { useCallback, useEffect, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { SUBJECTS, SUBJECT_KEYS } from '../../../lib/constants.js'
import { Empty, Pagination, useLoad, TabLoader } from './shared.jsx'
import ImportQuestions from './ImportQuestions.jsx'
import Icon from '../../../components/Icons.jsx'

const blank = (subject) => ({ subject, body: '', options: ['', '', '', ''], answer: 0, explanation: '' })

function Editor({ q, onDone }) {
  const { busy, error, setError, run } = useAction()
  const [f, setF] = useState({ ...q, options: [...q.options], explanation: q.explanation || '' })
  const setOpt = (i, v) => setF({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) })
  const save = () => {
    if (!f.body.trim()) return setError('Write the question first.')
    if (f.options.some((o) => !o.trim())) return setError('Fill in all four options.')
    return run(async () => {
      await api.adminSaveQuestion({ ...f, body: f.body.trim(), options: f.options.map((o) => o.trim()), explanation: f.explanation.trim() })
      onDone(true)
    }, 'Question saved')
  }
  return (
    <div className="card" aria-label="Question editor">
      <h3>{q.id ? `Edit question #${q.id}` : 'Add a question'}</h3>
      <label htmlFor="qs">Subject</label>
      <select id="qs" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>{SUBJECT_KEYS.map((k) => <option key={k} value={k}>{SUBJECTS[k].name}</option>)}</select>
      <label htmlFor="qb">Question</label>
      <textarea id="qb" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      {f.options.map((o, i) => (
        <div className="row" key={i} style={{ justifyContent: 'flex-start' }}>
          <label className="opt-pick"><input type="radio" name="ans" checked={f.answer === i} onChange={() => setF({ ...f, answer: i })} aria-label={`Option ${'ABCD'[i]} is correct`} /> {'ABCD'[i]}</label>
          <input aria-label={`Option ${'ABCD'[i]}`} value={o} onChange={(e) => setOpt(i, e.target.value)} style={{ margin: 0 }} />
        </div>
      ))}
      <p className="sm">Tick the circle next to the correct option.</p>
      <label htmlFor="qe">Explanation (shown when a student gets it wrong)</label>
      <textarea id="qe" rows={2} value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} />
      <ErrorLine>{error}</ErrorLine>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={busy} onClick={save}>Save question</button>
        <button className="btn ghost" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  )
}

export default function Questions() {
  const { isAdmin } = useAuth()   // teachers can add and edit, but only admins delete
  const [subject, setSubject] = useState('eng')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(false)
  const fetchQ = useCallback(() => api.adminQuestions(subject), [subject])
  const { data, error, loading, reload } = useLoad(fetchQ)
  const act = useAction()
  const confirm = useConfirm()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  useEffect(() => { setPage(1) }, [subject, q, pageSize])
  const needle = q.trim().toLowerCase()
  const matches = (data || []).filter((x) => !needle || x.body.toLowerCase().includes(needle))
  const lastPage = Math.max(1, Math.ceil(matches.length / pageSize))
  const current = Math.min(page, lastPage)
  const shown = matches.slice((current - 1) * pageSize, current * pageSize)
  return (
    <>
      <div className="adm-filters">
        <select aria-label="Subject" value={subject} onChange={(e) => { setSubject(e.target.value); setEditing(null) }}>
          {SUBJECT_KEYS.map((k) => <option key={k} value={k}>{SUBJECTS[k].name}</option>)}
        </select>
        <input aria-label="Search questions" placeholder="Search this subject" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost" onClick={() => { setImporting(true); setEditing(null) }}><Icon name="upload" size={16} /> Import</button>
        <button className="btn" onClick={() => { setEditing(blank(subject)); setImporting(false) }}>Add question</button>
      </div>
      {importing && <ImportQuestions onCancel={() => setImporting(false)} onDone={() => { setImporting(false); reload() }} />}
      {editing && <Editor key={editing.id || 'new'} q={editing} onDone={(saved) => { setEditing(null); if (saved) reload() }} />}
      <ErrorLine>{act.error || error}</ErrorLine>
      {loading ? <TabLoader /> : (
        <>
          <p className="sm">{matches.length} question{matches.length === 1 ? '' : 's'} in {SUBJECTS[subject].name}{needle ? ' match your search' : ''}</p>
          <div className="card tw">
            <table>
              <thead><tr><th>#</th><th>Question</th><th>Answer</th><th /></tr></thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td style={{ minWidth: 220 }}>{x.body}</td>
                    <td>{'ABCD'[x.answer]}. {x.options[x.answer]}</td>
                    <td>
                      <button className="btn ghost" onClick={() => { setEditing(x); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>{' '}
                      {isAdmin && <button className="btn danger" onClick={async () => (await confirm({ title: 'Delete this question?', message: `"${x.body.length > 110 ? x.body.slice(0, 110) + '…' : x.body}" will be removed for every student.`, confirmLabel: 'Delete question' })) && act.run(async () => { await api.adminDeleteQuestion(x.id); await reload() })}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <Empty>No questions found.</Empty>}
          </div>
          {matches.length > 0 && <Pagination page={current} pageSize={pageSize} total={matches.length} onPage={setPage} onPageSize={setPageSize} />}
        </>
      )}
    </>
  )
}
