import { useId } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/Icons.jsx'
import { ErrorLine } from '../../../components/ui.jsx'
import * as api from '../../../lib/api.js'
import { buildOverview, naira } from '../../../lib/utils.js'
import { fmtDate, useLoad, TabLoader } from './shared.jsx'

const fetchAll = async () => {
  const [stats, students, payments, messages] = await Promise.all([api.adminStats(), api.adminStudents(), api.adminPayments().catch(() => []), api.adminMessages().catch(() => [])])
  return { stats, students, payments, messages }
}

/** This week against the week before it (the 14 days are split in two). */
export function growth(values) {
  const a = values.slice(0, 7).reduce((n, v) => n + v, 0)
  const b = values.slice(7).reduce((n, v) => n + v, 0)
  if (a === 0) return b > 0 ? 100 : 0
  return Math.round(((b - a) / a) * 100)
}

/** A round number to end the y-axis on (2, 5, 10, 20, 50, 100…). */
function niceMax(v) {
  if (v <= 2) return 2
  const p = 10 ** Math.floor(Math.log10(v))
  const m = [1, 2, 5, 10].find((x) => x * p >= v)
  return m * p
}
const short = (v) => (v >= 1e6 ? +(v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(v))

/** Bars or a line, with a y-axis, light grid lines and a hover title on every point. */
function Chart({ values, labels, kind, tone, fmt = String, yFmt = short, label }) {
  const id = useId().replace(/:/g, '')
  const W = 560, H = 120, L = 40, R = 8, T = 10, B = 6
  const top = niceMax(Math.max(...values, 0))
  const ticks = [0, top / 2, top]
  const x = (i) => L + ((i + 0.5) * (W - L - R)) / values.length
  const y = (v) => T + (1 - v / top) * (H - T - B)
  const bw = Math.min(24, ((W - L - R) / values.length) * 0.55)
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg className={'ov-chart ' + tone} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="ov-gl" /><text x={L - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="ov-ytick">{yFmt(t)}</text></g>
      ))}
      {kind === 'bars'
        ? values.map((v, i) => <rect key={i} x={x(i) - bw / 2} width={bw} y={y(v) - (v ? 0 : 2)} height={Math.max(v ? 3 : 2, H - B - y(v))} rx="5" className={'ov-bar' + (v ? '' : ' zero')}><title>{`${labels[i]}: ${fmt(v)}`}</title></rect>)
        : (
          <>
            <polygon points={`${x(0)},${y(0)} ${line} ${x(values.length - 1)},${y(0)}`} fill={`url(#${id})`} />
            <polyline points={line} className="ov-line" />
            {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" className="ov-dot"><title>{`${labels[i]}: ${fmt(v)}`}</title></circle>)}
          </>
        )}
    </svg>
  )
}

function Chip({ pct }) {
  return <span className={'ov-chip' + (pct < 0 ? ' down' : '')}><span aria-hidden="true">{pct < 0 ? '↓' : '↑'}</span> {pct > 0 ? '+' : ''}{pct}%</span>
}

/** A friendly picture for "nothing to show": a calendar with a clock. */
function CalendarArt() {
  return (
    <svg className="ov-art" viewBox="0 0 160 110" aria-hidden="true">
      <ellipse cx="80" cy="58" rx="70" ry="42" className="ov-cloud" />
      <rect x="45" y="22" width="56" height="52" rx="8" className="ov-cal" />
      <path d="M45 38h56" className="ov-cal-l" /><path d="M58 17v10M88 17v10" className="ov-cal-l" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={r + '' + c} x={54 + c * 14} y={45 + r * 10} width="9" height="6" rx="2" className="ov-cell" />))}
      <circle cx="108" cy="72" r="20" className="ov-clock" /><path d="M108 61v11h9" className="ov-hands" />
    </svg>
  )
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
  const sum = (a) => a.reduce((n, v) => n + v, 0)
  const newStudents = sum(o.signups)
  const revenue = sum(o.revenue)
  const planRows = [['free', 'Free', 'green'], ['student', 'Student', 'blue'], ['pro', 'Pro', 'violet']]
  return (
    <div className="ov">
      <p className="mut ov-sub">Track your platform performance at a glance.</p>

      <div className="stat-grid s3">
        <div className="card st"><span className="ic"><Icon name="user" /></span><b>{stats.students}</b><span>students · {o.new7d} new this week</span></div>
        <div className="card st"><span className="ic"><Icon name="card" /></span><b>{stats.paying}</b><span>on a paid plan · {o.conversion}% of students</span></div>
        <div className="card st"><span className="ic gold"><Icon name="trophy" /></span><b>{naira(Number(stats.revenue_kobo))}</b><span>total revenue · {naira(o.revenue30d)} last 30 days</span></div>
        <div className="card st"><span className="ic"><Icon name="flame" /></span><b>{o.active7d}</b><span>active in the last 7 days</span></div>
        <div className="card st"><span className="ic"><Icon name="mock" /></span><b>{stats.mocks}</b><span>mocks taken</span></div>
        <Link to="/app/admin/messages" className="card st"><span className="ic"><Icon name="help" /></span><b>{unread}</b><span>unread messages</span></Link>
      </div>

      <div className="ov-grid">
        <section className="card ov-card">
          <header className="ov-head">
            <span className="ov-ic indigo"><Icon name="users" size={20} /></span>
            <div className="ov-t"><h3>New students, last 14 days</h3><div className="ov-big"><b>{newStudents}</b><Chip pct={growth(o.signups)} /></div></div>
            <Link to="/app/admin/students" className="ov-btn indigo">View Details <Icon name="arrow" size={16} /></Link>
          </header>
          <Chart values={o.signups} labels={labels} kind="bars" tone="indigo" label="New students per day" />
        </section>

        <section className="card ov-card">
          <header className="ov-head">
            <span className="ov-ic green"><Icon name="wallet" size={20} /></span>
            <div className="ov-t"><h3>Revenue, last 14 days</h3><div className="ov-big"><b>{naira(revenue)}</b><Chip pct={growth(o.revenue)} /></div></div>
            <Link to="/app/admin/payments" className="ov-btn green">View Details <Icon name="arrow" size={16} /></Link>
          </header>
          <Chart values={o.revenue} labels={labels} kind="line" tone="green" fmt={naira} yFmt={(v) => short(v / 100)} label="Revenue per day" />
        </section>

        <section className="card ov-card ov-plans">
          <header className="ov-dark"><span className="ov-ic dark"><Icon name="layers" size={20} /></span><h3>Plans right now</h3></header>
          <div className="ov-body">
            {planRows.map(([p, name, c]) => (
              <div className="ov-plan" key={p}>
                <b>{name}</b>
                <span className="ov-meter"><i className={c} style={{ width: `${(o.planMix[p] / total) * 100}%` }} /></span>
                <b className="ov-n">{o.planMix[p]}</b>
                <span className={'ov-ppl ' + c}><Icon name="users" size={18} /></span>
              </div>
            ))}
            <p className="ov-note"><Icon name="info" size={20} /> Expired paid plans count as Free.</p>
          </div>
        </section>

        <section className="card ov-card">
          <header className="ov-head">
            <span className="ov-ic violet"><Icon name="clock" size={20} /></span>
            <div className="ov-t"><h3>Plans ending within 7 days</h3></div>
            <Link to="/app/admin/students" className="ov-btn violet">View All <Icon name="arrow" size={16} /></Link>
          </header>
          {o.expiring.length === 0 ? (
            <div className="ov-empty"><CalendarArt /><b>Nobody's plan is about to end.</b><span>You're all caught up! 🎉</span></div>
          ) : (
            <div className="ov-list">
              {o.expiring.slice(0, 5).map((s) => (
                <div className="ov-row" key={s.id}><span><b>{s.full_name}</b><span className="sm">{s.plan} · {s.email}</span></span><span className="ov-when">{fmtDate(s.plan_expires)}</span></div>
              ))}
              {o.expiring.length > 5 && <Link to="/app/admin/students" className="sm">and {o.expiring.length - 5} more…</Link>}
            </div>
          )}
        </section>
      </div>

      {o.pending > 0 && <p className="sm">{o.pending} payment{o.pending > 1 ? 's are' : ' is'} still pending. See <Link to="/app/admin/payments">Payments</Link>.</p>}
    </div>
  )
}
