import { useMemo, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import * as api from '../../../lib/api.js'
import { downloadText } from '../../../lib/download.js'
import { naira, toCsv } from '../../../lib/utils.js'
import { Empty, fmtDateTime, useLoad, TabLoader } from './shared.jsx'

const fetchBoth = async () => {
  const [payments, students] = await Promise.all([api.adminPayments(), api.adminStudents()])
  return { payments, who: Object.fromEntries(students.map((s) => [s.id, s])) }
}

export default function Payments() {
  const { data, error, loading } = useLoad(fetchBoth)
  const [status, setStatus] = useState('all')
  const rows = useMemo(() => (data?.payments || []).filter((p) => status === 'all' || p.status === status), [data, status])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const name = (p) => data.who[p.user_id]?.full_name || (p.user_id ? 'Unknown' : 'Deleted account')
  const paid = data.payments.filter((p) => p.status === 'paid')
  return (
    <>
      <div className="stat-grid">
        <div className="card st"><b>{naira(paid.reduce((n, p) => n + p.amount_kobo, 0))}</b><span>received from {paid.length} payments</span></div>
        <div className="card st"><b>{data.payments.filter((p) => p.status === 'pending').length}</b><span>pending</span></div>
        <div className="card st"><b>{data.payments.filter((p) => p.status === 'failed').length}</b><span>failed</span></div>
      </div>
      <div className="adm-filters">
        <select aria-label="Filter payments" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option>
        </select>
        <button className="btn ghost" onClick={() => downloadText('jambwise-payments.csv', toCsv(rows, [
          { label: 'Reference', value: (p) => p.reference }, { label: 'Student', value: name }, { label: 'Email', value: (p) => data.who[p.user_id]?.email },
          { label: 'Plan', value: (p) => p.plan }, { label: 'Amount (NGN)', value: (p) => p.amount_kobo / 100 }, { label: 'Status', value: (p) => p.status },
          { label: 'Date', value: (p) => p.paid_at || p.created_at },
        ]))}>Export CSV</button>
      </div>
      <div className="card tw">
        <table>
          <thead><tr><th>Reference</th><th>Student</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.reference}>
                <td className="mono">{p.reference}</td><td>{name(p)}<br /><span className="sm">{data.who[p.user_id]?.email}</span></td>
                <td>{p.plan}</td><td>{naira(p.amount_kobo)}</td><td><span className={'tag ' + (p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : '')}>{p.status}</span></td>
                <td>{fmtDateTime(p.paid_at || p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No payments yet.</Empty>}
      </div>
      <p className="sm">Payments are recorded by the Paystack webhook, so this list cannot be edited here. If a student says they paid but is still on Free, find their reference in your Paystack dashboard, then use Students → Manage → Apply plan.</p>
    </>
  )
}
