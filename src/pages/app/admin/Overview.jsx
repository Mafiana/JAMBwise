import { Link } from 'react-router-dom'
import Icon from '../../../components/Icons.jsx'
import { ErrorLine } from '../../../components/ui.jsx'
import * as api from '../../../lib/api.js'
import { buildOverview, naira } from '../../../lib/utils.js'
import { Bars, Empty, fmtDate, useLoad, TabLoader } from './shared.jsx'

const fetchAll = async () => {
  const [stats, students, payments, messages] = await Promise.all([api.adminStats(), api.adminStudents(), api.adminPayments().catch(() => []), api.adminMessages().catch(() => [])])
  return { stats, students, payments, messages }
}

export default function Overview() {
  const { data, error, loading } = useLoad(fetchAll)
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const { stats, students, payments, messages } = data
  const o = buildOverview(students, payments)
  const unread = messages.filter((m) => m.status === 'new').length
  const day = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  const labels = o.days.map(day)
  const total = Math.max(1, students.length)
  return (
    <>
      <div className="stat-grid s3">
        <div className="card st"><span className="ic"><Icon name="user" /></span><b>{stats.students}</b><span>students · {o.new7d} new this week</span></div>
        <div className="card st"><span className="ic"><Icon name="card" /></span><b>{stats.paying}</b><span>on a paid plan · {o.conversion}% of students</span></div>
        <div className="card st"><span className="ic gold"><Icon name="trophy" /></span><b>{naira(Number(stats.revenue_kobo))}</b><span>total revenue · {naira(o.revenue30d)} last 30 days</span></div>
        <div className="card st"><span className="ic"><Icon name="flame" /></span><b>{o.active7d}</b><span>active in the last 7 days</span></div>
        <div className="card st"><span className="ic"><Icon name="mock" /></span><b>{stats.mocks}</b><span>mocks taken</span></div>
        <Link to="/app/admin/messages" className="card st"><span className="ic"><Icon name="help" /></span><b>{unread}</b><span>unread messages</span></Link>
      </div>

      <div className="adm-two">
        <div className="card">
          <h3>New students, last 14 days</h3>
          <Bars values={o.signups} labels={labels} label="New students per day" />
        </div>
        <div className="card">
          <h3>Revenue, last 14 days</h3>
          <Bars values={o.revenue} labels={labels} format={naira} label="Revenue per day" />
        </div>
      </div>

      <div className="adm-two">
        <div className="card">
          <h3>Plans right now</h3>
          {['free', 'student', 'pro'].map((p) => (
            <div className="ln" key={p}>
              <span style={{ textTransform: 'capitalize', minWidth: 64 }}>{p}</span>
              <span className="meter"><i style={{ width: `${(o.planMix[p] / total) * 100}%` }} /></span>
              <b>{o.planMix[p]}</b>
            </div>
          ))}
          <p className="sm">Expired paid plans count as Free.</p>
        </div>
        <div className="card">
          <h3>Plans ending within 7 days</h3>
          {o.expiring.length === 0 && <Empty>Nobody's plan is about to end.</Empty>}
          {o.expiring.slice(0, 6).map((s) => (
            <div className="ln" key={s.id}><span>{s.full_name}<br /><span className="sm">{s.plan} · {s.email}</span></span><b>{fmtDate(s.plan_expires)}</b></div>
          ))}
          {o.expiring.length > 6 && <Link to="/app/admin/students" className="sm">and {o.expiring.length - 6} more…</Link>}
        </div>
      </div>

      {o.pending > 0 && <p className="sm">{o.pending} payment{o.pending > 1 ? 's are' : ' is'} still pending. See <Link to="/app/admin/payments">Payments</Link>.</p>}
    </>
  )
}
