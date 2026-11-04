import Icon from './Icons.jsx'

const REASON = { practice: 'Practice answers', mock_retake: 'CBT Mock retake' }
const when = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })

/** The student's XP: balance, a bar towards the price of one more CBT Mock, today's earnings and the latest changes. */
export default function XpCard({ xp, compact = false }) {
  if (!xp) return null
  const pct = Math.min(100, Math.round((xp.balance / xp.cost) * 100))
  const need = Math.max(0, xp.cost - xp.balance)
  const left = Math.max(0, xp.free - xp.sittings)
  return (
    <section className="card xp-card" aria-label="Your XP">
      <div className="xp-top">
        <span className="xp-ic" aria-hidden="true"><Icon name="trophy" size={22} /></span>
        <div>
          <b className="xp-n">{xp.balance.toLocaleString('en-NG')} XP</b>
          <span className="sm">{xp.earned.toLocaleString('en-NG')} XP earned in total</span>
        </div>
      </div>
      <div className="pg-bar xp-bar" role="img" aria-label={`${pct} percent of the ${xp.cost} XP for one more CBT mock`}><i style={{ width: pct + '%' }} /></div>
      <p className="sm" style={{ margin: '6px 0 0' }}>
        {left > 0
          ? `You have ${left} free CBT mock${left === 1 ? '' : 's'} left. After that, each extra CBT mock costs ${xp.cost.toLocaleString('en-NG')} XP.`
          : xp.paid_retakes > 0
            ? 'Your next CBT mock is paid for. Go to CBT Mock to write it.'
            : need > 0
              ? `${need.toLocaleString('en-NG')} more XP to write the CBT mock again (${xp.cost.toLocaleString('en-NG')} XP).`
              : `You have enough XP to write the CBT mock again. Open CBT Mock to use ${xp.cost.toLocaleString('en-NG')} XP.`}
      </p>
      <p className="sm" style={{ margin: '4px 0 0' }}>Earn 1 XP for every practice question you answer correctly, up to {xp.daily_cap} XP a day. Today: <b>{xp.today}</b> / {xp.daily_cap} XP.</p>
      {!compact && xp.recent?.length > 0 && (
        <ul className="xp-list">
          {xp.recent.slice(0, 6).map((r, i) => (
            <li key={i}><span>{REASON[r.reason] || r.reason} <span className="sm">· {when(r.created_at)}</span></span><b className={r.delta < 0 ? 'neg' : 'pos'}>{r.delta > 0 ? '+' : ''}{r.delta} XP</b></li>
          ))}
        </ul>
      )}
    </section>
  )
}
