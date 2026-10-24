import { useCallback, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Modal from '../../../components/Modal.jsx'
import * as api from '../../../lib/api.js'
import { EVENT_LABEL, isLeave } from '../../../lib/integrity.js'
import { fmtDateTime, useLoad } from './shared.jsx'

/** A student's CBT Mock and ExamHall log: when they started, every time they left the exam screen, and how they submitted. */
export default function ExamLog({ student, onClose }) {
  const load = useCallback(() => api.adminStudentExamLog(student.id), [student.id])   // a stable function, or useLoad would reload forever
  const { data, error, loading } = useLoad(load)
  const [kind, setKind] = useState('hall')
  const list = data?.[kind] || []
  return (
    <Modal title={`${student.full_name || 'Student'}: exam log`} onClose={onClose} wide>
      <div className="seg" role="group" aria-label="Which exam">
        {[['mock', 'CBT Mock'], ['hall', 'ExamHall']].map(([k, label]) => (
          <button key={k} className={'chip ' + (kind === k ? 'on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label} {data && <span className="sm">({data[k].length})</span>}
          </button>
        ))}
      </div>
      {loading && <p className="mut" role="status">Loading the log…</p>}
      {!loading && !data && <ErrorLine>{error}</ErrorLine>}
      {data && list.length === 0 && <p className="mut">Nothing has been logged for {kind === 'hall' ? 'ExamHall' : 'CBT Mock'} yet.</p>}
      {data && list.length > 0 && (
        <ul className="ev-list">
          {list.map((e, i) => (
            <li key={i} className={isLeave(e) || e.type === 'limit_reached' ? 'warn-row' : ''}>
              <span>{EVENT_LABEL[e.type] || e.type}{e.detail ? <span className="sm"> ({e.detail})</span> : null}</span>
              <span className="mut">{fmtDateTime(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="sm">Leaving the exam screen is only watched in ExamHall.</p>
    </Modal>
  )
}
