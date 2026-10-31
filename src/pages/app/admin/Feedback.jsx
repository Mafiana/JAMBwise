import { useEffect, useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { Empty, fmtDate, Pagination, TabLoader, useLoad } from './shared.jsx'

const KIND = { feedback: 'Feedback', feature: 'Feature idea', bug: 'Bug' }
const FILTERS = [['all', 'All'], ['new', 'New'], ['feedback', 'Feedback'], ['feature', 'Feature ideas'], ['bug', 'Bugs']]
const Stars = ({ n, size = 16 }) => <span className="fb-stars" style={{ fontSize: size }} role="img" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''}>{i <= n ? '★' : '☆'}</span>)}</span>
const ago = (d) => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5)
  if (days >= 1) return `${days} d ago`
  const h = Math.floor((Date.now() - new Date(d).getTime()) / 36e5)
  return h >= 1 ? `${h} h ago` : 'just now'
}

/** Admin: every rating, feature idea, bug report and piece of feedback students and teachers have sent. */
export default function Feedback() {
  const { data, error, loading, reload } = useLoad(api.adminFeedback)
  const act = useAction()
  const confirm = useConfirm()
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  useEffect(() => { setPage(1) }, [filter, pageSize])
  const rows = data || []
  const stats = useMemo(() => {
    const rated = rows.filter((r) => r.rating)
    const dist = [5, 4, 3, 2, 1].map((n) => rated.filter((r) => r.rating === n).length)
    return { count: rated.length, avg: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0, dist }
  }, [rows])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const count = (k) => (k === 'all' ? rows.length : k === 'new' ? rows.filter((r) => r.status === 'new').length : rows.filter((r) => r.kind === k).length)
  const shown = rows.filter((r) => filter === 'all' || (filter === 'new' ? r.status === 'new' : r.kind === filter))
  const lastPage = Math.max(1, Math.ceil(shown.length / pageSize))
  const current = Math.min(page, lastPage)
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize)
  const top = Math.max(1, ...stats.dist)
  const toggle = (r) => act.run(async () => { await api.adminSetFeedbackStatus(r.id, r.status === 'new' ? 'done' : 'new'); await reload() })
  const del = async (r) => {
    if (!(await confirm({ title: 'Delete this feedback?', message: 'It will be removed for good.', confirmLabel: 'Delete' }))) return
    act.run(async () => { await api.adminDeleteFeedback(r.id); await reload() }, 'Deleted')
  }
  return (
    <>
      <div className="card fb-sum">
        <div className="fb-avg"><b>{stats.count ? stats.avg.toFixed(1) : '–'}</b><Stars n={Math.round(stats.avg)} size={22} /><span className="sm">{stats.count} rating{stats.count === 1 ? '' : 's'}</span></div>
        <div className="fb-bars">
          {[5, 4, 3, 2, 1].map((n, i) => (
            <div className="fb-bar" key={n}><span>{n}★</span><i><em style={{ width: `${(stats.dist[i] / top) * 100}%` }} /></i><b>{stats.dist[i]}</b></div>
          ))}
        </div>
      </div>
      <div className="card chips fb-filters" role="group" aria-label="Filter feedback">
        {FILTERS.map(([k, label]) => <button key={k} className={'chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label} ({count(k)})</button>)}
      </div>
      <ErrorLine>{act.error}</ErrorLine>
      <div className="card tw">
        <table>
          <thead><tr><th>Date</th><th>From</th><th>Rating</th><th>Type</th><th>Message</th><th>Status</th><th /></tr></thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}<br /><span className="sm">{ago(r.created_at)}</span></td>
                <td><b>{r.name || 'Someone'}</b>{r.role === 'teacher' && <span className="tag muted">Teacher</span>}<br /><span className="sm">{r.email}</span></td>
                <td>{r.rating ? <Stars n={r.rating} /> : <span className="mut">–</span>}</td>
                <td><span className={'tag fb-kind ' + r.kind}>{KIND[r.kind]}</span></td>
                <td style={{ minWidth: 200, overflowWrap: 'anywhere' }}>{r.message || <span className="mut">–</span>}</td>
                <td><button className={'btn ' + (r.status === 'new' ? '' : 'ghost')} disabled={act.busy} onClick={() => toggle(r)}>{r.status === 'new' ? 'Mark done' : 'Done · reopen'}</button></td>
                <td><button className="btn ghost" disabled={act.busy} onClick={() => del(r)} aria-label="Delete this feedback"><Icon name="trash" size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {pageRows.length === 0 && <Empty>{rows.length ? 'Nothing here.' : 'No feedback yet. When students or teachers use Rate & suggest, it shows up here.'}</Empty>}
      </div>
      {shown.length > 0 && <Pagination page={current} pageSize={pageSize} total={shown.length} onPage={setPage} onPageSize={setPageSize} />}
    </>
  )
}
