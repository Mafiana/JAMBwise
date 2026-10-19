import { useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { downloadBytes } from '../../../lib/download.js'
import { buildTablePdf } from '../../../lib/pdf.js'
import { breakdown, EXAMS, scoreStats } from '../../../lib/scoresheet.js'
import { useAction } from '../../../hooks.js'
import { Empty, fmtDate, TabLoader, useLoad } from './shared.jsx'

const PDF_COLUMNS = [
  { label: 'Rank', width: 40, align: 'center' }, { label: 'Student', width: 175 }, { label: 'Reg. number', width: 105 },
  { label: 'Subjects (correct / questions)', width: 270 }, { label: 'Score / 400', width: 70, align: 'right' }, { label: 'Date', width: 90, align: 'center' },
]

export default function Scoresheet() {
  const { data, error, loading, reload } = useLoad(api.adminScoresheet)
  const confirm = useConfirm()
  const { busy, error: actError, run } = useAction()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('mock')
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
    const bytes = buildTablePdf({
      title: `JAMBwise ${exam.label} Scoresheet`,
      subtitle: `${rows.length} student${rows.length === 1 ? '' : 's'}${q.trim() ? ` matching "${q.trim()}"` : ''}  |  Average ${shown.average}  |  Highest ${shown.highest}  |  300 and above: ${shown.over300}`,
      columns: PDF_COLUMNS,
      rows: rows.map((r) => [String(r.rank), r.name, r.reg, breakdown(r), String(r.total), fmtDate(r.date)]),
      note: 'ENG English, MAT Mathematics, PHY Physics, CHM Chemistry, BIO Biology, GOV Government, ECO Economics, COM Commerce, AGR Agricultural Science. Scores are out of 400.',
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
      <div className="adm-filters">
        <input aria-label="Search the scoresheet" placeholder="Search name, number, email or school" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={downloadPdf} disabled={!all.length}><Icon name="download" size={16} /> Download PDF</button>
      </div>
      <ErrorLine>{actError}</ErrorLine>
      <div className="card tw">
        <table>
          <thead><tr><th>Rank</th><th>Student</th><th>Reg. number</th><th>Subjects</th><th>Score</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Rank"><b>{r.rank}</b></td>
                <td data-label="Student">{r.name}<br /><span className="sm">{r.email}</span></td>
                <td data-label="Reg. number">{r.reg}</td>
                <td data-label="Subjects" className="sm">{breakdown(r)}</td>
                <td data-label="Score"><b>{r.total}</b> / 400</td>
                <td data-label="Date">{fmtDate(r.date)}</td>
                <td><button className="btn ghost" disabled={busy} onClick={() => retake(r)}>Allow retake</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>{all.length ? 'No student matches that search.' : `No one has submitted ${exam.label} yet.`}</Empty>}
      </div>
    </>
  )
}
