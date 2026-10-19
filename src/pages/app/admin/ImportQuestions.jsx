import { useMemo, useRef, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { downloadText } from '../../../lib/download.js'
import { LIMITS, parseQuestionFile, TEMPLATE_CSV, toPayload } from '../../../lib/importQuestions.js'
import { SUBJECTS, SUBJECT_KEYS } from '../../../lib/constants.js'

const PREVIEW = 8

/**
 * Bulk import: pick a CSV (easy to make in Excel or Google Sheets) or JSON file, check it, then import.
 * Rows with a problem are listed and skipped; questions that already exist are skipped by the database.
 */
export default function ImportQuestions({ onDone, onCancel }) {
  const { busy, error, setError, run } = useAction()
  const input = useRef(null)
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState(null)       // { name, format, rows }
  const [fallback, setFallback] = useState('')  // used for rows with no subject
  const [raw, setRaw] = useState(null)         // the text, kept so the fallback subject can be applied
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const read = async (f) => {
    setError(''); setResult(null); setFile(null)
    if (!f) return
    if (f.size > LIMITS.file) return setError('That file is larger than 2 MB. Split it into smaller files.')
    const text = await f.text()
    setRaw({ text, name: f.name })
    const parsed = parseQuestionFile(text, f.name, fallback)
    if (parsed.error) return setError(parsed.error)
    setFile({ name: f.name, ...parsed })
  }
  const withFallback = (k) => {
    setFallback(k)
    if (raw) { const p = parseQuestionFile(raw.text, raw.name, k); if (p.error) { setFile(null); setError(p.error) } else { setError(''); setFile({ name: raw.name, ...p }) } }
  }

  const good = useMemo(() => (file ? file.rows.filter((r) => !r.error) : []), [file])
  const bad = useMemo(() => (file ? file.rows.filter((r) => r.error) : []), [file])
  const bySubject = useMemo(() => {
    const m = {}
    good.forEach((r) => { m[r.subject] = (m[r.subject] || 0) + 1 })
    return Object.entries(m)
  }, [good])

  const start = () => run(async () => {
    setProgress([0, good.length])
    const out = await api.adminImportQuestions(good.map(toPayload), (done, total) => setProgress([done, total]))
    setResult({ ...out, skippedByYou: bad.length })
    setFile(null); setRaw(null); setProgress(null)
  })

  if (result) {
    return (
      <div className="card import" aria-label="Import result">
        <span className="ic" style={{ marginBottom: 8 }}><Icon name="check" /></span>
        <h3>Import finished</h3>
        <div className="stat-grid s3">
          <div className="card st"><b>{result.inserted}</b><span>questions added</span></div>
          <div className="card st"><b>{result.duplicates}</b><span>already existed, skipped</span></div>
          <div className="card st"><b>{result.invalid + result.skippedByYou}</b><span>had a problem, skipped</span></div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={onDone}>Done</button>
          <button className="btn ghost" onClick={() => setResult(null)}>Import another file</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card import" aria-label="Import questions">
      <div className="bar"><h3><Icon name="upload" size={18} /> Import questions from a file</h3><button className="btn ghost" onClick={onCancel}>Close</button></div>
      <p className="mut" style={{ marginTop: 0 }}>
        Easiest way: <b>CSV</b>. Download the template, fill it in with Excel or Google Sheets (one question per row), save it as CSV and choose it below.
        JSON files also work, including the files in <code>supabase/questions</code>.
      </p>
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => downloadText('jambwise-question-template.csv', TEMPLATE_CSV)}><Icon name="download" size={16} /> Download CSV template</button>
      </div>
      <details className="fmt">
        <summary>What goes in each column?</summary>
        <ul className="sm">
          <li><b>subject</b>: eng, mat, phy, chm, bio, gov, eco, com or agr (names like Mathematics also work)</li>
          <li><b>question</b>, <b>option_a</b> to <b>option_d</b>: the text. All four options are needed.</li>
          <li><b>answer</b>: the letter of the right option, A, B, C or D</li>
          <li><b>explanation</b>: optional, shown when a student gets it wrong</li>
        </ul>
      </details>

      <label className="adm-sub" htmlFor="imp-sub">Subject for rows that have no subject column</label>
      <select id="imp-sub" value={fallback} onChange={(e) => withFallback(e.target.value)}>
        <option value="">Not needed, my file has a subject column</option>
        {SUBJECT_KEYS.map((k) => <option key={k} value={k}>{SUBJECTS[k].name}</option>)}
      </select>

      <div
        className={'drop' + (drag ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files?.[0]) }}
      >
        <Icon name="file" size={26} />
        <p style={{ margin: '6px 0' }}>Drop a .csv or .json file here, or</p>
        <button className="btn" type="button" onClick={() => input.current?.click()}>Choose file</button>
        <input ref={input} type="file" accept=".csv,.json,text/csv,application/json" hidden aria-label="Question file" onChange={(e) => { read(e.target.files?.[0]); e.target.value = '' }} />
        {file && <p className="sm" style={{ margin: '8px 0 0' }}>{file.name} · {file.format}</p>}
      </div>
      <ErrorLine>{error}</ErrorLine>

      {file && (
        <>
          <div className="stat-grid s3">
            <div className="card st"><b>{good.length}</b><span>ready to import</span></div>
            <div className="card st"><b className={bad.length ? 'warn' : ''}>{bad.length}</b><span>will be skipped</span></div>
            <div className="card st"><b>{bySubject.length}</b><span>subject{bySubject.length === 1 ? '' : 's'}</span></div>
          </div>
          {bySubject.length > 0 && <p className="sm">{bySubject.map(([k, n]) => `${SUBJECTS[k].name}: ${n}`).join(' · ')}</p>}

          {bad.length > 0 && (
            <div className="problems" role="region" aria-label="Rows with problems">
              <b>Rows that will be skipped</b>
              <ul>{bad.slice(0, 12).map((r) => <li key={r.line}><span className="tag bad">row {r.line}</span> {r.error}{r.body ? <span className="sm"> · {r.body.slice(0, 50)}{r.body.length > 50 ? '…' : ''}</span> : null}</li>)}</ul>
              {bad.length > 12 && <p className="sm" style={{ margin: 0 }}>…and {bad.length - 12} more.</p>}
            </div>
          )}

          {good.length > 0 && (
            <div className="card tw" style={{ margin: '12px 0' }}>
              <table>
                <thead><tr><th>Subject</th><th>Question</th><th>Answer</th></tr></thead>
                <tbody>{good.slice(0, PREVIEW).map((r) => (
                  <tr key={r.line}><td>{SUBJECTS[r.subject].name}</td><td style={{ minWidth: 200 }}>{r.body}</td><td>{'ABCD'[r.answer]}. {r.options[r.answer]}</td></tr>
                ))}</tbody>
              </table>
              {good.length > PREVIEW && <p className="sm" style={{ margin: '8px 0 0' }}>Showing the first {PREVIEW} of {good.length}.</p>}
            </div>
          )}

          <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button className="btn" disabled={busy || good.length === 0} onClick={start}>
              {busy ? (progress ? `Importing… ${progress[0]} of ${progress[1]}` : 'Importing…') : `Import ${good.length} question${good.length === 1 ? '' : 's'}`}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => { setFile(null); setRaw(null); setError('') }}>Choose a different file</button>
          </div>
          <p className="sm">Questions that already exist in the same subject are skipped, so importing the same file twice is safe.</p>
        </>
      )}
    </div>
  )
}
