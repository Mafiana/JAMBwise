import { useEffect, useMemo, useState } from 'react'
import { ErrorLine, Loader } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import { useAction } from '../../../hooks.js'
import * as api from '../../../lib/api.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import { Empty, fmtDateTime, Pagination, TabLoader, useLoad } from './shared.jsx'

const OUTCOME = { ok: 'Signed in', bad_code: 'Wrong ID or code', expired: 'Code expired', off: 'Access switched off', locked: 'Locked out' }
const chip = (o) => 'tag' + (o === 'ok' ? ' ok' : o === 'locked' ? ' bad' : o === 'bad_code' ? ' bad' : ' muted')
const day = (d) => new Date(d).toLocaleDateString('en-CA')

/** Admin: every parent sign-in and failed try, with search, filters, pages, and a button to switch a student's parent access off. */
export default function ParentAccess() {
  const { data, error, loading, reload } = useLoad(api.adminParentLog)
  const confirm = useConfirm()
  const act = useAction()
  const [refreshing, setRefreshing] = useState(false)
  const [at, setAt] = useState(() => new Date())   // when the list was last loaded
  /** Reloads the log from the server, with a loader showing for at least a moment so the click is seen to work. */
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await Promise.all([reload(), new Promise((r) => setTimeout(r, 600))]); setAt(new Date()) } finally { setRefreshing(false) }
  }
  const [q, setQ] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [oldest, setOldest] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [q, outcome, from, to, oldest, pageSize])

  const stats = useMemo(() => {
    const rows = data || []
    const dayAgo = Date.now() - 864e5
    const today = day(new Date())
    return {
      today: rows.filter((r) => r.outcome === 'ok' && day(r.created_at) === today).length,
      parents: new Set(rows.filter((r) => r.outcome === 'ok' && new Date(r.created_at) > dayAgo).map((r) => r.student_id)).size,
      failed: rows.filter((r) => r.outcome !== 'ok' && new Date(r.created_at) > dayAgo).length,
      active: new Set(rows.filter((r) => r.active).map((r) => r.student_id)).size,
    }
  }, [data])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = (data || []).filter((r) => (outcome === 'all' || r.outcome === outcome) && (!from || day(r.created_at) >= from) && (!to || day(r.created_at) <= to) &&
      (!needle || [r.parent_name, r.student_name, r.reg_number, r.device, r.relationship].some((v) => String(v || '').toLowerCase().includes(needle))))
    return oldest ? rows.slice().reverse() : rows
  }, [data, q, outcome, from, to, oldest])

  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const lastPage = Math.max(1, Math.ceil(matches.length / pageSize))
  const current = Math.min(page, lastPage)
  const shown = matches.slice((current - 1) * pageSize, current * pageSize)
  const filtered = q || outcome !== 'all' || from || to
  const clear = () => { setQ(''); setOutcome('all'); setFrom(''); setTo('') }
  const exportCsv = () => downloadText('jambwise-parent-access.csv', toCsv(matches, [
    { label: 'When', value: (r) => r.created_at }, { label: 'Parent', value: (r) => r.parent_name }, { label: 'Relationship', value: (r) => r.relationship },
    { label: 'Student', value: (r) => r.student_name }, { label: 'Student ID', value: (r) => r.reg_number }, { label: 'Result', value: (r) => OUTCOME[r.outcome] || r.outcome }, { label: 'Device', value: (r) => r.device },
  ]))
  const revoke = async (r) => {
    if (await confirm({ title: 'Switch off parent access?', message: `${r.student_name || 'This student'}'s parent code will stop working and any parent who is signed in is signed out. The student can make a new code in Settings.`, confirmLabel: 'Switch off' }))
      act.run(async () => { await api.adminParentRevoke(r.student_id); await reload() })
  }

  return (
    <>
      <div className="stat-grid s4">
        <div className="card st"><b>{stats.today}</b><span>parent sign-ins today</span></div>
        <div className="card st"><b>{stats.parents}</b><span>students viewed, last 24 h</span></div>
        <div className="card st"><b>{stats.failed}</b><span>failed or blocked tries, 24 h</span></div>
        <div className="card st"><b>{stats.active}</b><span>students with an active code</span></div>
      </div>
      <div className="act-filters">
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search parent access" placeholder="Search parent, student, ID or device" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <select aria-label="Filter by result" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="all">All results</option>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="act-filters">
        <label>From <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <select aria-label="Order" value={oldest ? 'old' : 'new'} onChange={(e) => setOldest(e.target.value === 'old')}>
          <option value="new">Newest first</option><option value="old">Oldest first</option>
        </select>
        {filtered && <button className="btn ghost" onClick={clear}>Clear filters</button>}
        <button className="btn ghost" onClick={refresh} disabled={refreshing} aria-busy={refreshing}><Icon name="refresh" size={16} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn ghost" onClick={exportCsv} disabled={!matches.length}>Export CSV</button>
      </div>
      {refreshing && <Loader size="sm" label="Refreshing the list…" />}
      <p className="sm">Updated {at.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}. {matches.length} of {data.length} entries. Parents sign in on the home page with a student's ID and the code that student made.</p>
      <ErrorLine>{act.error}</ErrorLine>
      <div className="card tw">
        <table>
          <thead><tr><th>When</th><th>Parent</th><th>Student</th><th>Result</th><th>Device</th><th /></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td>{fmtDateTime(r.created_at)}</td>
              <td>{r.parent_name || '–'}<br /><span className="sm">{r.relationship}</span></td>
              <td>{r.student_name || <span className="sm">unknown ID</span>}<br /><span className="sm">{r.reg_number}</span></td>
              <td><span className={chip(r.outcome)}>{OUTCOME[r.outcome] || r.outcome}</span></td>
              <td className="sm">{r.device}</td>
              <td className="acts">{r.active && r.student_id && <button className="btn danger" onClick={() => revoke(r)} disabled={act.busy}>Switch off</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {matches.length === 0 && <Empty>{data.length ? 'No entries match these filters.' : 'No parent has tried to sign in yet.'}</Empty>}
        {matches.length > 0 && <Pagination page={current} pageSize={pageSize} total={matches.length} onPage={setPage} onPageSize={setPageSize} sizes={[10, 20, 50, 100]} />}
      </div>
    </>
  )
}
