import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLine, Loader, Logo, ThemeToggle } from '../components/ui.jsx'
import Icon from '../components/Icons.jsx'
import ParentForm from '../components/ParentForm.jsx'
import * as api from '../lib/api.js'
import { SUBJECTS } from '../lib/constants.js'
import { clearParentSession, getParentSession } from '../lib/parentSession.js'
import { streak } from '../lib/utils.js'

const subjectName = (k) => SUBJECTS[k]?.name || k
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '–')
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
const level = (pct) => (pct >= 70 ? 'hi' : pct >= 50 ? 'mid' : 'lo')
const KIND = { practice: 'Practice', mock: 'CBT Mock', hall: 'ExamHall' }

function minutesLeft(iso) { return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000)) }

function Report({ session, report, onEnd }) {
  const [left, setLeft] = useState(minutesLeft(report.expires_at))
  useEffect(() => {
    const t = setInterval(() => { const m = minutesLeft(report.expires_at); setLeft(m); if (m <= 0) onEnd(true) }, 15000)
    return () => clearInterval(t)
  }, [report.expires_at, onEnd])
  const s = report.student
  const total = report.subjects.reduce((n, x) => n + x.total, 0)
  const correct = report.subjects.reduce((n, x) => n + x.correct, 0)
  const accuracy = total ? Math.round((correct / total) * 100) : 0
  const best = report.mocks.length ? Math.max(...report.mocks.map((m) => m.score)) : null
  const run = useMemo(() => streak(report.days.map((d) => d + 'T12:00:00')), [report.days])
  const strip = useMemo(() => {
    const set = new Set(report.days)
    return Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const k = d.toLocaleDateString('en-CA'); return { k, on: set.has(k) } })
  }, [report.days])
  const weak = report.subjects.filter((x) => x.pct < 60).slice(0, 3)
  const hall = report.hall
  const [saved, setSaved] = useState('')
  /** Builds the PDF at this moment, so it carries the real date and time of the download. */
  const download = async () => {
    const now = new Date()
    const [{ buildParentReportPdf, stampForFile }, { downloadBytes }] = await Promise.all([import('../lib/reportPdf.js'), import('../lib/download.js')])
    const days = strip.filter((d) => d.on).length
    const bytes = buildParentReportPdf({
      student: { name: s.name, reg_number: s.reg_number, course: s.course, school: s.school, plan: s.plan, exam_date: s.exam_date ? fmtDate(s.exam_date) : '' },
      parent: session.name,
      stats: [{ value: total, label: 'questions answered' }, { value: accuracy + '%', label: 'accuracy' }, { value: best ?? '-', label: 'best mock, of 400' }, { value: run, label: 'day streak' }],
      attention: weak.length ? weak.map((x) => `${subjectName(x.subject)} (${x.pct}%)`).join(', ') + '. Encourage extra practice here.' : '',
      subjects: report.subjects.map((x) => ({ name: subjectName(x.subject), pct: x.pct, detail: `${x.correct} of ${x.total} correct` })),
      activity: `Practised on ${days} of the last 14 days. Current streak: ${run} day${run === 1 ? '' : 's'}.`,
      mocks: report.mocks.slice(0, 10).map((m) => ({ when: fmtDateTime(m.date), score: m.score })),
      hall: hall ? { title: 'ExamHall', lines: hall.released ? [`Sat on ${fmtDate(hall.date)}. Score: ${hall.total} / 400`, (hall.subjects || []).map((x) => `${subjectName(x.subject)} ${x.correct}/${x.total}`).join('  |  ')].filter(Boolean) : [`Sat on ${fmtDate(hall.date)}. The score will show once the school releases the results.`] } : null,
      recent: report.recent.map((a) => [fmtDateTime(a.created_at), KIND[a.kind] || a.kind, subjectName(a.subject), `${a.correct} / ${a.total} (${Math.round((a.correct / a.total) * 100)}%)`]),
    }, now)
    downloadBytes(`JAMBwise-report-${s.reg_number}-${stampForFile(now)}.pdf`, bytes)
    setSaved(now.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'medium' }))
  }
  return (
    <div className="parent-report">
      <div className="card pr-head">
        <span className="av">{(s.name[0] || '?').toUpperCase()}</span>
        <div className="sd-id">
          <h2>{s.name}</h2>
          <span className="sm">{s.reg_number}{s.course ? ' · ' + s.course : ''}{s.school ? ' · ' + s.school : ''}</span>
        </div>
        <span className="tag">{s.plan}</span>
      </div>
      <p className="sm pr-note" role="status">Signed in as <b>{session.name}</b>. This is a read-only view and ends in about {left} minute{left === 1 ? '' : 's'}. {s.exam_date ? <>Exam date: <b>{fmtDate(s.exam_date)}</b>.</> : null}</p>

      <div className="pr-actions">
        <button type="button" className="btn" onClick={download}><Icon name="download" size={18} /> Download report</button>
        {saved && <span className="sm" role="status">Report downloaded on {saved}.</span>}
      </div>

      <div className="stat-grid s4">
        <div className="card st"><b>{total}</b><span>questions answered</span></div>
        <div className="card st"><b>{accuracy}%</b><span>accuracy</span></div>
        <div className="card st"><b>{best ?? '–'}</b><span>best mock, of 400</span></div>
        <div className="card st"><b>{run}</b><span>day streak</span></div>
      </div>

      {weak.length > 0 && (
        <div className="card pr-weak">
          <h3>Needs attention</h3>
          <p className="sm" style={{ margin: 0 }}>{weak.map((x) => `${subjectName(x.subject)} (${x.pct}%)`).join(', ')}. Encourage extra practice here.</p>
        </div>
      )}

      <div className="card">
        <h3>Practice by subject</h3>
        {report.subjects.length === 0 ? <p className="sm" style={{ margin: 0 }}>No practice yet.</p> : report.subjects.map((x) => (
          <div className="subj-row" key={x.subject}>
            <span>{subjectName(x.subject)}</span>
            <span className="meter" role="img" aria-label={`${x.pct} percent`}><i className={level(x.pct)} style={{ width: x.pct + '%' }} /></span>
            <b>{x.pct}%</b>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Last 14 days</h3>
        <div className="pr-strip" role="img" aria-label={`Practised on ${strip.filter((d) => d.on).length} of the last 14 days`}>
          {strip.map((d) => <i key={d.k} className={d.on ? 'on' : ''} title={d.k + (d.on ? ': practised' : '')} />)}
        </div>
        <p className="sm" style={{ marginBottom: 0 }}>Practised on {strip.filter((d) => d.on).length} of the last 14 days.</p>
      </div>

      <div className="card">
        <h3>Mock exams {report.mocks.length > 0 && <span className="sm">best {best} / 400</span>}</h3>
        {report.mocks.length === 0 ? <p className="sm" style={{ margin: 0 }}>No CBT mock yet.</p> : report.mocks.slice(0, 6).map((m, i) => (
          <div className="ln" key={i}><span>{fmtDateTime(m.date)}</span><b>{m.score} / 400</b></div>
        ))}
      </div>

      {hall && (
        <div className="card">
          <h3>ExamHall</h3>
          {hall.released ? (
            <>
              <div className="ln"><span>{fmtDate(hall.date)}</span><b>{hall.total} / 400</b></div>
              <p className="sm" style={{ marginBottom: 0 }}>{(hall.subjects || []).map((x) => `${subjectName(x.subject)} ${x.correct}/${x.total}`).join(' · ')}</p>
            </>
          ) : <p className="sm" style={{ margin: 0 }}>Sat on {fmtDate(hall.date)}. The score will show here once the school releases the results.</p>}
        </div>
      )}

      <div className="card tw">
        <h3>Recent sessions</h3>
        {report.recent.length === 0 ? <p className="sm" style={{ margin: 0 }}>Nothing yet.</p> : (
          <table>
            <thead><tr><th>When</th><th>Type</th><th>Subject</th><th>Score</th></tr></thead>
            <tbody>{report.recent.map((a, i) => (
              <tr key={i}><td>{fmtDateTime(a.created_at)}</td><td>{KIND[a.kind] || a.kind}</td><td>{subjectName(a.subject)}</td><td>{a.correct} / {a.total} <span className="sm">({Math.round((a.correct / a.total) * 100)}%)</span></td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <p className="sm">{s.name} can switch parent access off at any time in Settings.</p>
      <button className="btn danger" onClick={() => onEnd(false)}><Icon name="arrow" size={16} /> Log out</button>
    </div>
  )
}

/** /parent: the read-only report for a signed-in parent, or the sign-in form. */
export default function Parent() {
  const [session, setSession] = useState(getParentSession)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const end = useCallback(async (expired) => {
    const s = getParentSession()
    clearParentSession()
    setSession(null); setReport(null)
    if (expired) setNote('Your session has ended. Please sign in again to keep viewing.')
    if (s) api.parentEnd(s.token)
  }, [])

  useEffect(() => {
    if (!session) return undefined
    let alive = true
    api.parentReport(session.token).then((r) => alive && setReport(r)).catch((e) => {
      if (!alive) return
      if (e.ended) { clearParentSession(); setSession(null); setNote('Your session has ended. Please sign in again to keep viewing.') } else setError(e.message)
    })
    return () => { alive = false }
  }, [session])

  return (
    <>
      <header className="nav">
        <Logo />
        <span><ThemeToggle /><Link to="/">Back to home</Link></span>
      </header>
      <div className="wrap parent-wrap">
        {session ? (
          <>
            <h1>Your child's progress</h1>
            <ErrorLine>{error}</ErrorLine>
            {report ? <Report session={session} report={report} onEnd={end} /> : !error && <Loader size="md" label="Loading your child's progress…" />}
          </>
        ) : (
          <>
            <h1>Parent access</h1>
            <p className="lead mut">See how your child is doing on JAMBwise. Ask them for their Student ID and the parent code from their Settings page.</p>
            {note && <p className="notice" role="status">{note}</p>}
            <div className="card"><ParentForm idPrefix="pp" /></div>
          </>
        )}
      </div>
    </>
  )
}
