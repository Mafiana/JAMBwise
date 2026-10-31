import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ErrorLine } from '../../../components/ui.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { SUBJECTS, SUBJECT_KEYS } from '../../../lib/constants.js'
import { Empty, Pagination, useLoad, TabLoader } from './shared.jsx'
import ImportQuestions from './ImportQuestions.jsx'
import Icon from '../../../components/Icons.jsx'
import Modal from '../../../components/Modal.jsx'

const blank = (subject) => ({ subject, body: '', options: ['', '', '', ''], answer: 0, explanation: '' })

function Editor({ q, onDone, review = false }) {
  const { busy, error, setError, run } = useAction()
  const [f, setF] = useState({ ...q, options: [...q.options], explanation: q.explanation || '' })
  const setOpt = (i, v) => setF({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) })
  const save = () => {
    if (!f.body.trim()) return setError('Write the question first.')
    if (f.options.some((o) => !o.trim())) return setError('Fill in all four options.')
    const row = { ...f, body: f.body.trim(), options: f.options.map((o) => o.trim()), explanation: f.explanation.trim() }
    if (review) return run(async () => { await api.submitQuestion(row); onDone('review') })   // a teacher's new question goes to the admins first
    return run(async () => { await api.adminSaveQuestion(row); onDone(true) }, 'Question saved')
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
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save question'}</button>
        <button className="btn ghost" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </div>
  )
}

const STATUS = { pending: ['Under review', 'tag'], approved: ['Approved', 'tag ok'], declined: ['Declined', 'tag bad'] }
const subName = (k) => SUBJECTS[k]?.name || String(k || '').toUpperCase()

/** Teacher: the questions they have sent in and what the admin decided. */
function MySubmissions({ rows }) {
  if (!rows.length) return null
  return (
    <div className="card" aria-label="Your submitted questions">
      <h3 style={{ marginTop: 0 }}>Your submitted questions</h3>
      <ul className="sub-list">
        {rows.slice(0, 8).map((r) => {
          const [label, cls] = STATUS[r.status] || STATUS.pending
          return (
            <li key={r.id}>
              <span className="sub-q"><b>{subName(r.subject)}</b> · {r.body.length > 110 ? r.body.slice(0, 110) + '…' : r.body}{r.status === 'declined' && r.decline_reason && <><br /><span className="sm">Reason: {r.decline_reason}</span></>}</span>
              <span className={cls}>{label}</span>
            </li>
          )
        })}
      </ul>
      {rows.length > 8 && <p className="sm" style={{ marginBottom: 0 }}>Showing your latest 8 of {rows.length}.</p>}
    </div>
  )
}

/** Admin: one waiting question at a time, with Accept and Decline. The teacher is told either way. */
function ReviewBox({ pending, onChanged, onClose }) {
  const { busy, error, setError, run } = useAction()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const item = pending[0]
  useEffect(() => { if (!item) onClose() }, [item, onClose])
  useEffect(() => { setDeclining(false); setReason(''); setError('') }, [item?.id, setError])
  if (!item) return null
  const decide = (approve) => run(async () => { await api.adminReviewQuestion(item.id, approve, approve ? '' : reason.trim()); await onChanged() }, approve ? 'Question accepted and added' : 'Question declined. The teacher has been told')
  return (
    <Modal title="Question to review" onClose={onClose} wide>
      <p className="sm" style={{ marginTop: 0 }}><b>{item.teacher_name || 'A teacher'}</b> added this question in <b>{subName(item.subject)}</b>. {pending.length > 1 ? `${pending.length} are waiting for your review.` : 'It is the only one waiting.'}</p>
      <div className="review-q">
        <h4>{item.body}</h4>
        <ul>
          {item.options.map((o, i) => <li key={i} className={i === item.answer ? 'right' : ''}><b>{'ABCD'[i]}.</b> {o}{i === item.answer && <span className="tag ok" style={{ marginLeft: 8 }}>Correct answer</span>}</li>)}
        </ul>
        {item.explanation && <p className="sm"><b>Explanation:</b> {item.explanation}</p>}
      </div>
      {declining && (
        <>
          <label htmlFor="rv-why">Reason for declining (optional, the teacher will see it)</label>
          <textarea id="rv-why" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the answer is not correct" />
        </>
      )}
      <ErrorLine>{error}</ErrorLine>
      <div className="review-actions">
        {declining ? (
          <>
            <button type="button" className="btn ghost" onClick={() => setDeclining(false)} disabled={busy}>Back</button>
            <button type="button" className="btn danger" onClick={() => decide(false)} disabled={busy}>{busy ? 'Declining…' : 'Confirm decline'}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn danger" onClick={() => setDeclining(true)} disabled={busy}>Decline</button>
            <button type="button" className="btn" onClick={() => decide(true)} disabled={busy}>{busy ? 'Adding…' : 'Accept'}</button>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Questions() {
  const { isAdmin } = useAuth()   // teachers can add and edit, but only admins delete
  const [subject, setSubject] = useState('eng')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(false)
  const [sent, setSent] = useState(false)           // teacher: "under review" box
  const [reviewing, setReviewing] = useState(false) // admin: the Accept / Decline box
  const [params, setParams] = useSearchParams()
  const sideFn = isAdmin ? api.adminPendingQuestions : api.mySubmittedQuestions
  const { data: side, reload: reloadSide } = useLoad(sideFn)
  const opened = useRef(false)
  // arriving from the bell ("Question to review") opens the box straight away
  useEffect(() => {
    if (!isAdmin || opened.current || params.get('review') !== '1' || !side) return
    opened.current = true
    setParams({}, { replace: true })
    if (side.length) setReviewing(true)
  }, [isAdmin, params, side, setParams])
  const closeReview = useCallback(() => setReviewing(false), [])
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
        {isAdmin && <button className="btn ghost" onClick={() => { setImporting(true); setEditing(null) }}><Icon name="upload" size={16} /> Import</button>}
        <button className="btn" onClick={() => { setEditing(blank(subject)); setImporting(false) }}>Add question</button>
        {isAdmin && (data || []).length > 0 && (
          <button
            className="btn danger"
            onClick={async () => (await confirm({
              title: `Delete all ${SUBJECTS[subject].name} questions?`,
              message: `All ${data.length} question${data.length === 1 ? '' : 's'} in ${SUBJECTS[subject].name} will be removed for every student. This cannot be undone. Other subjects are not touched.`,
              confirmLabel: `Delete all ${data.length}`,
            })) && act.run(async () => { await api.adminDeleteSubjectQuestions(subject); setEditing(null); await reload() })}
          >Delete all</button>
        )}
      </div>
      {isAdmin && side && side.length > 0 && (
        <p className="notice review-bar" role="status">
          <Icon name="flag" size={18} /> <span><b>{side.length}</b> question{side.length === 1 ? '' : 's'} added by teachers {side.length === 1 ? 'is' : 'are'} waiting for your review.</span>
          <button type="button" className="btn" onClick={() => setReviewing(true)}>Review</button>
        </p>
      )}
      {!isAdmin && side && <MySubmissions rows={side} />}
      {importing && isAdmin && <ImportQuestions onCancel={() => setImporting(false)} onDone={() => { setImporting(false); reload() }} />}
      {editing && <Editor key={editing.id || 'new'} q={editing} review={!isAdmin && !editing.id} onDone={(saved) => { setEditing(null); if (saved === 'review') { setSent(true); reloadSide() } else if (saved) reload() }} />}
      {sent && (
        <Modal title="Question under review" onClose={() => setSent(false)}>
          <div className="c" role="status">
            <span className="ic" style={{ margin: '0 auto 12px' }}><Icon name="check" /></span>
            <h3 style={{ marginTop: 0 }}>Thank you, your question is in good hands</h3>
            <p className="mut">The admin will review it shortly. You will get a notification as soon as it has been approved and added.</p>
          </div>
          <div className="modal-actions"><button type="button" className="btn" onClick={() => setSent(false)}>Got it</button></div>
        </Modal>
      )}
      {reviewing && side && <ReviewBox pending={side} onChanged={async () => { await reloadSide(); await reload() }} onClose={closeReview} />}
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
