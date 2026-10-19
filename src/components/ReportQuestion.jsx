import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import * as api from '../lib/api.js'
import { SUBJECTS } from '../lib/constants.js'
import { REPORT_REASONS, questionReport } from '../lib/utils.js'
import { useAction } from '../hooks.js'
import Icon from './Icons.jsx'
import Modal from './Modal.jsx'
import { ErrorLine } from './ui.jsx'

const reported = new Set()   // questions flagged during this visit, so the button is not offered twice

/**
 * "Report this question": a student flags a mistake and it arrives in the admin Support tickets as a ticket
 * that shows the question exactly as they saw it. `q` is the prepared question (id, subject, body, options, answer).
 */
export default function ReportQuestion({ q }) {
  const { profile, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(reported.has(q.id))
  const [reason, setReason] = useState('wrong_answer')
  const [note, setNote] = useState('')
  const { busy, error, run } = useAction()
  if (!q.id) return null

  const send = (e) => {
    e.preventDefault()
    const { subject, body } = questionReport({ q, subjectName: SUBJECTS[q.subject]?.name || q.subject, reason, note })
    return run(async () => {
      await api.sendMessage({ name: profile.full_name || 'Student', email: profile.email || user?.email || '', topic: 'question', subject, body, user_id: user.id })
      reported.add(q.id)
      setDone(true)
    })
  }

  if (done && !open) return <p className="report-done sm"><Icon name="check" size={15} /> Reported. Thank you, we will check it.</p>
  return (
    <>
      <button type="button" className="report-btn" onClick={() => setOpen(true)}><Icon name="flag" size={15} /> Report this question</button>
      {open && (
        <Modal title={done ? 'Report sent' : 'Report this question'} onClose={() => setOpen(false)}>
          {done ? (
            <>
              <p className="mut">Thank you! Your report is now a ticket. We will check the question and fix it if it is wrong. You can follow it under <Link to="/app/help" onClick={() => setOpen(false)}>Customer Support</Link>.</p>
              <div className="modal-actions"><button className="btn" onClick={() => setOpen(false)}>Back to the question</button></div>
            </>
          ) : (
            <form onSubmit={send} noValidate>
              <p className="sm" style={{ marginTop: 0 }}>Found a mistake? Tell us what looks wrong. We include the question for you, so there is nothing to copy.</p>
              <fieldset className="reasons">
                <legend className="sr">What is wrong?</legend>
                {REPORT_REASONS.map(([k, label]) => (
                  <label key={k} className={'reason' + (reason === k ? ' on' : '')}>
                    <input type="radio" name="reason" value={k} checked={reason === k} onChange={() => setReason(k)} /> {label}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="rq-note">Anything to add? <span className="mut">(optional)</span></label>
              <textarea id="rq-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the correct answer should be B because…" />
              <ErrorLine>{error}</ErrorLine>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  )
}
