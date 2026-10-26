import { useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { downloadBytes } from '../../../lib/download.js'
import { buildTablePdf } from '../../../lib/pdf.js'
import { breakdown, EXAMS, scoreStats } from '../../../lib/scoresheet.js'
import { useAction } from '../../../hooks.js'
import Modal from '../../../components/Modal.jsx'
import { EVENT_LABEL, fmtWhen, isLeave } from '../../../lib/integrity.js'
import { Empty, fmtDate, fmtDateTime, TabLoader, useLoad } from './shared.jsx'

const PDF_COLUMNS = [
  { label: 'Rank', width: 40, align: 'center' }, { label: 'Student', width: 175 }, { label: 'Reg. number', width: 105 },
  { label: 'Subjects (correct / questions)', width: 270 }, { label: 'Score / 400', width: 70, align: 'right' }, { label: 'Date', width: 90, align: 'center' },
]
// ExamHall also prints how many times the student left the exam screen
const PDF_COLUMNS_HALL = [
  { label: 'Rank', width: 38, align: 'center' }, { label: 'Student', width: 160 }, { label: 'Reg. number', width: 100 },
  { label: 'Subjects (correct / questions)', width: 235 }, { label: 'Score / 400', width: 66, align: 'right' }, { label: 'Date', width: 86, align: 'center' }, { label: 'Left screen', width: 65, align: 'center' },
]

const pad = (n) => String(n).padStart(2, '0')
/** ms -> the value a datetime-local input wants, in the admin's own time zone */
const toLocalInput = (ms) => { if (ms == null) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
const lefts = (events) => events.filter(isLeave)   // started / submitted entries are log lines, not times they left
const countText = (n) => (n === 1 ? '1 time' : `${n} times`)

/** Admin: when ExamHall can be entered, and how many warnings before an automatic submit. */
function Schedule({ win, onSaved }) {
  const { busy, error, run } = useAction()
  const [opens, setOpens] = useState(toLocalInput(win.opens))
  const [closes, setCloses] = useState(toLocalInput(win.closes))
  const [max, setMax] = useState(String(win.maxViolations))
  const save = (o, c) => run(async () => {
    const n = Number(max)
    if (!Number.isInteger(n) || n < 0 || n > 20) throw new Error('Warnings must be a whole number from 0 to 20.')
    if (o && c && new Date(c) <= new Date(o)) throw new Error('The closing time must be after the opening time.')
    await api.adminSetExamWindow('hall', o || null, c || null, n)
    await onSaved()
  }, 'Schedule saved')
  const summary = win.opens == null && win.closes == null ? 'ExamHall is open any time.'
    : `Students can enter ${win.opens != null ? 'from ' + fmtWhen(win.opens - win.offset) : 'any time'}${win.closes != null ? ' until ' + fmtWhen(win.closes - win.offset) : ''}.`
  return (
    <div className="card sched">
      <b>ExamHall schedule</b>
      <p className="sm" style={{ margin: '4px 0 0' }}>{summary} Times are in your time zone. Students whose exam is still running when it closes are submitted automatically.</p>
      <div className="grid">
        <label>Opens<input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} /></label>
        <label>Closes<input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} /></label>
        <label>Warnings before auto-submit<input type="number" min="0" max="20" value={max} onChange={(e) => setMax(e.target.value)} /><span className="sm">0 = warn only, never auto-submit</span></label>
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => save(opens, closes)}>Save schedule</button>
        <button className="btn ghost" disabled={busy} onClick={() => { setOpens(''); setCloses(''); save('', '') }}>Open any time</button>
      </div>
    </div>
  )
}

/** Admin: show or hide ExamHall scores to the students who wrote it. Hidden until released. */
function Release({ win, onSaved }) {
  const { busy, error, run } = useAction()
  const confirm = useConfirm()
  const on = win.released
  const toggle = async () => {
    const ok = await confirm(on
      ? { title: 'Hide ExamHall results again?', message: 'Students will no longer see their ExamHall score.', confirmLabel: 'Hide results', danger: false }
      : { title: 'Release ExamHall results?', message: 'Every student who wrote ExamHall will be able to see their own score and subject breakdown on the ExamHall page and under My Progress. You can hide them again at any time.', confirmLabel: 'Release results', danger: false })
    if (ok) run(async () => { await api.adminSetResultsReleased('hall', !on); await onSaved() })
  }
  return (
    <div className="card rel">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <b>Results for students: {on ? 'visible' : 'hidden'}</b>
          <p className="sm" style={{ margin: '4px 0 0' }}>{on ? 'Students can see their own ExamHall score.' : 'Students only see that they have submitted. Release the results when you are ready.'}</p>
        </div>
        <button className={'btn' + (on ? ' ghost' : '')} disabled={busy} onClick={toggle}>{on ? 'Hide results' : 'Release results'}</button>
      </div>
      <ErrorLine>{error}</ErrorLine>
    </div>
  )
}

/** The "left the exam screen" log of one student. */
function EventsModal({ who, events, onClose }) {
  return (
    <Modal title={`${who}: left the exam screen`} onClose={onClose}>
      <p className="sm" style={{ marginTop: 0 }}>Reported by the student's browser during ExamHall. Switching tabs or apps, or leaving full screen, is recorded.</p>
      <ul className="ev-list">
        {events.map((e, i) => <li key={i}><span>{EVENT_LABEL[e.type] || e.type}{e.detail ? <span className="sm"> ({e.detail})</span> : null}</span><span className="mut">{fmtDateTime(e.occurred_at)}</span></li>)}
      </ul>
    </Modal>
  )
}

export default function Scoresheet() {
  const { data, error, loading, reload } = useLoad(api.adminScoresheet)
  const confirm = useConfirm()
  const { isAdmin } = useAuth()   // teachers can look and download, but not release, schedule or allow retakes
  const { busy, error: actError, run } = useAction()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('mock')
  const [seen, setSeen] = useState(null)   // { who, events } shown in the log box
  const exam = EXAMS[kind]
  const all = data?.[kind]
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (all || []).filter((r) => !needle || [r.name, r.reg, r.email, r.school].some((v) => String(v || '').toLowerCase().includes(needle)))
  }, [all, q])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const st = scoreStats(all)

  const downloadPdf = () => {
    const today = new Date().toISOString().slice(0, 10)
    const shown = scoreStats(rows)
    const hall = kind === 'hall'
    const bytes = buildTablePdf({
      title: `JAMBwise ${exam.label} Scoresheet`,
      subtitle: `${rows.length} student${rows.length === 1 ? '' : 's'}${q.trim() ? ` matching "${q.trim()}"` : ''}  |  Average ${shown.average}  |  Highest ${shown.highest}  |  300 and above: ${shown.over300}`,
      columns: hall ? PDF_COLUMNS_HALL : PDF_COLUMNS,
      rows: rows.map((r) => [String(r.rank), r.name, r.reg, breakdown(r), String(r.total), fmtDate(r.date), ...(hall ? [lefts(r.events).length ? String(lefts(r.events).length) : '-'] : [])]),
      note: 'ENG English, MAT Mathematics, PHY Physics, CHM Chemistry, BIO Biology, GOV Government, ECO Economics, COM Commerce, AGR Agricultural Science, ACC Accounts, MKT Marketing, LIT Literature in English, IRK Islamic Religious Knowledge, CRK Christian Religious Knowledge. Scores are out of 400.',
      generated: 'Generated ' + new Date().toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    })
    downloadBytes(`jambwise-${kind === 'hall' ? 'examhall' : 'cbt-mock'}-scoresheet-${today}.pdf`, bytes)
  }

  const retake = async (r) => {
    if (!(await confirm({ title: 'Allow a retake?', message: `${r.name}'s ${exam.label} score (${r.total} / 400) will be removed from the Scoresheet and they will be able to write ${exam.label} one more time. Their other exam and practice history are kept.`, confirmLabel: 'Allow retake' }))) return
    run(async () => { await api.adminAllowRetake(r.id, kind); await reload() })
  }

  return (
    <>
      <div className="seg" role="group" aria-label="Which exam">
        {Object.entries(EXAMS).map(([k, e]) => (
          <button key={k} className={'chip ' + (kind === k ? 'on' : '')} aria-pressed={kind === k} onClick={() => { setKind(k); setQ('') }}>
            {e.label} <span className="sm">({data[k].length})</span>
          </button>
        ))}
      </div>
      <div className="stat-grid">
        <div className="card st"><b>{st.count}</b><span>students have written {exam.label}</span></div>
        <div className="card st"><b>{st.average}</b><span>average score (out of 400)</span></div>
        <div className="card st"><b>{st.highest}</b><span>highest score</span></div>
        <div className="card st"><b>{st.over300}</b><span>scored 300 or more</span></div>
      </div>
      {kind === 'hall' && isAdmin && <Release key={'r' + data.schedule.hall.released} win={data.schedule.hall} onSaved={reload} />}
      {kind === 'hall' && isAdmin && <Schedule key={JSON.stringify(data.schedule.hall)} win={data.schedule.hall} onSaved={reload} />}
      <div className="adm-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search the scoresheet" placeholder="Search name, number, email or school" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <button className="btn" onClick={downloadPdf} disabled={!all.length}><Icon name="download" size={16} /> Download PDF</button>
      </div>
      <ErrorLine>{actError}</ErrorLine>
      <div className="card tw">
        <table>
          <thead><tr><th>Rank</th><th>Student</th><th>Reg. number</th><th>Subjects</th><th>Score</th><th>Date</th>{kind === 'hall' && <th>Left screen</th>}{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Rank"><b>{r.rank}</b></td>
                <td data-label="Student">{r.name}<br /><span className="sm">{r.email}</span></td>
                <td data-label="Reg. number">{r.reg}</td>
                <td data-label="Subjects" className="sm">{breakdown(r)}</td>
                <td data-label="Score"><b>{r.total}</b> / 400</td>
                <td data-label="Date">{fmtDate(r.date)}</td>
                {kind === 'hall' && (
                  <td data-label="Left screen">
                    {lefts(r.events).length
                      ? <button className="flag" onClick={() => setSeen({ who: r.name, events: r.events })} aria-label={`${r.name} left the exam screen ${countText(lefts(r.events).length)}`}><Icon name="flag" size={13} /> {countText(lefts(r.events).length)}</button>
                      : <span className="flag none">None</span>}
                  </td>
                )}
                {isAdmin && <td><button className="btn ghost" disabled={busy} onClick={() => retake(r)}>Allow retake</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>{all.length ? 'No student matches that search.' : `No one has submitted ${exam.label} yet.`}</Empty>}
      </div>
      {kind === 'hall' && data.flagged.hall.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <b>Left the exam screen but have not submitted</b>
          <p className="sm" style={{ margin: '4px 0 8px' }}>These students were flagged during an ExamHall sitting that has no score yet (still writing, or the page closed).</p>
          {data.flagged.hall.map((f) => (
            <div className="ln" key={f.id}>
              <span>{f.name} <span className="sm">{f.reg}</span></span>
              <button className="flag" onClick={() => setSeen({ who: f.name, events: f.events })}><Icon name="flag" size={13} /> {countText(lefts(f.events).length)}</button>
            </div>
          ))}
        </div>
      )}
      {seen && <EventsModal who={seen.who} events={seen.events} onClose={() => setSeen(null)} />}
    </>
  )
}
