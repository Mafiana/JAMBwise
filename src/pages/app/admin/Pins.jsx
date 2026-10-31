import { useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { downloadText } from '../../../lib/download.js'
import { toCsv } from '../../../lib/utils.js'
import CopyButton from '../../../components/CopyButton.jsx'
import { Empty, fmtDate, PLAN_IDS, useLoad, TabLoader } from './shared.jsx'

export default function Pins() {
  const { data, error: loadError, loading, reload } = useLoad(api.adminPins)
  const { busy, error, run } = useAction()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [plan, setPlan] = useState('student')
  const [days, setDays] = useState(365)
  const [count, setCount] = useState(1)
  const [fresh, setFresh] = useState([])
  const [filter, setFilter] = useState('all')
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{loadError}</ErrorLine>
  const used = (x) => Boolean(x.used_by || x.used_at)
  // unused | active | expired | used (used, but the student's account is gone or could not be read)
  const state = (x) => {
    if (!used(x)) return 'unused'
    if (!x.used_by || !x.has_status) return 'used'
    return x.expires_at && new Date(x.expires_at) <= new Date() ? 'expired' : 'active'
  }
  const shown = data.filter((x) => filter === 'all' || filter === state(x) || (filter === 'active' && state(x) === 'used'))
  const tally = (k) => data.filter((x) => state(x) === k).length
  const make = () => run(async () => {
    const n = Math.max(1, Math.min(100, Number(count) || 1))
    const d = Math.max(1, Math.min(3650, Number(days) || 365))
    const pins = n === 1 ? [await api.adminMakePin(plan, name, d)] : await api.adminMakePins(plan, d, n)
    setFresh(pins)
    setName('')
    await reload()
  })
  return (
    <>
      <div className="card">
        <h3>Make access PINs</h3>
        <div className="adm-form">
          <div><label htmlFor="pn">Student name (optional)</label><input id="pn" disabled={Number(count) > 1} value={name} onChange={(e) => setName(e.target.value)} placeholder="Single PIN only" /></div>
          <div><label htmlFor="pp">Plan</label><select id="pp" value={plan} onChange={(e) => setPlan(e.target.value)}>{PLAN_IDS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><label htmlFor="pd">Days of access</label><input id="pd" type="number" min="1" max="3650" value={days} onChange={(e) => setDays(e.target.value)} /></div>
          <div><label htmlFor="pc">How many (1-100)</label><input id="pc" type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} /></div>
        </div>
        <button className="btn" disabled={busy} onClick={make}>Generate PIN{Number(count) > 1 ? 's' : ''}</button>
        <ErrorLine>{error}</ErrorLine>
        <p className="sm">A student types the PIN into the box on the homepage and gets straight in, no email needed. Days of access count from the first time the PIN is used.</p>
        {fresh.length > 0 && (
          <div className="fresh" role="status">
            <b>New PIN{fresh.length > 1 ? 's' : ''}:</b> <span className="mono">{fresh.join('   ')}</span>{' '}
            <CopyButton text={fresh.join('\n')} label={fresh.length > 1 ? 'all new PINs' : 'the new PIN'} />
          </div>
        )}
      </div>

      <div className="adm-filters">
        <select aria-label="Filter PINs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All PINs</option><option value="unused">Unused</option><option value="active">Active</option><option value="expired">Expired</option>
        </select>
        <button className="btn" onClick={() => downloadText('jambwise-pins.csv', toCsv(shown, [
          { label: 'PIN', value: (x) => x.pin }, { label: 'Plan', value: (x) => x.plan }, { label: 'Days', value: (x) => x.days },
          { label: 'For', value: (x) => x.student_name }, { label: 'Status', value: (x) => state(x) }, { label: 'Access ends', value: (x) => x.expires_at || '' }, { label: 'Created', value: (x) => x.created_at },
        ]))}>Export CSV</button>
        <span className="sm">{tally('unused')} unused · {tally('active')} active · {tally('expired')} expired · {data.length} in all</span>
      </div>
      <div className="card tw">
        <table>
          <thead><tr><th>PIN</th><th>Plan</th><th>Days</th><th>For</th><th>Status</th><th>Access ends</th><th>Created</th><th /></tr></thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.pin}>
                <td><b className="mono">{x.pin}</b></td><td>{x.plan}</td><td>{x.days}</td><td>{x.student_name || '–'}</td>
                <td><span className={'tag pin-' + state(x)}>{{ unused: 'Unused', active: 'Active', expired: 'Expired', used: 'Used' }[state(x)]}</span>{used(x) && <div className="sm">Used {fmtDate(x.used_at)}</div>}</td>
                <td>{state(x) === 'expired' ? <b className="pin-late">{fmtDate(x.expires_at)}</b> : x.expires_at ? fmtDate(x.expires_at) : '–'}</td><td>{fmtDate(x.created_at)}</td>
                <td>
                  <CopyButton text={x.pin} label={'PIN ' + x.pin} />{' '}
                  {!used(x) && <button className="btn danger" onClick={async () => (await confirm({ title: 'Delete this PIN?', message: `${x.pin} will stop working immediately.`, confirmLabel: 'Delete PIN' })) && run(async () => { await api.adminDeletePin(x.pin); await reload() })}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No PINs here yet.</Empty>}
      </div>
    </>
  )
}
