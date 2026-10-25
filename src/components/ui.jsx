import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext.jsx'
import { naira } from '../lib/utils.js'
import Icon from './Icons.jsx'

export function Logo() {
  return (
    <Link className="logo" to="/" aria-label="JAMBwise home">
      <i aria-hidden="true">J</i>
      <span>JAMB<b>wise</b></span>
    </Link>
  )
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme()
  return (
    <button type="button" className="tgl" onClick={toggle} aria-label="Switch light or dark mode">
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  )
}

export function Avatar({ profile }) {
  if (profile?.avatar) return <img className="av" src={profile.avatar} alt="" />
  return <span className="av">{(profile?.full_name?.[0] || '?').toUpperCase()}</span>
}

/** Passport-style photo, like the one on the real CBT exam screen. Shows a silhouette when there is no photo. */
export function Portrait({ profile }) {
  if (profile?.avatar) return <img className="portrait" src={profile.avatar} alt={`Photo of ${profile.full_name || 'student'}`} />
  return (
    <span className="portrait none" role="img" aria-label="No photo yet">
      <svg viewBox="0 0 24 30" width="60%" aria-hidden="true"><circle cx="12" cy="9" r="5" fill="currentColor" /><path d="M2 30c0-7 4-11 10-11s10 4 10 11z" fill="currentColor" /></svg>
    </span>
  )
}

/** The branded loader. size: 'lg' fills the page, 'md' fits inside a page, 'sm' sits in a line next to other content. */
export function Loader({ label = 'Loading…', size = 'md' }) {
  return (
    <div className={'aload' + (size === 'md' ? ' inline' : size === 'sm' ? ' mini' : '')} role="status" aria-live="polite">
      <div className="aload-orb">
        <span className="aload-ring" />
        <span className="aload-ring r2" />
        <span className="aload-core"><b className="aload-j" aria-hidden="true">J</b></span>
      </div>
      {size === 'sm' ? <span className="aload-t">{label}</span> : <b>{label}</b>}
    </div>
  )
}

/** Full-page loader used while the app or a page opens. */
export function Spinner({ label = 'Loading…' }) {
  return <Loader label={label} size="lg" />
}

export function ErrorLine({ children }) {
  return (
    <p className="err" role="alert">
      {children}
    </p>
  )
}

export function Lock({ title, plan }) {
  return (
    <div className="card c">
      <span className="ic" style={{ marginBottom: 8 }}><Icon name="lock" /></span>
      <h2>{title}</h2>
      <p className="mut">Available on the {plan} plan and above.</p>
      <Link className="btn" to="/app/billing">See plans</Link>
    </div>
  )
}

export function PlanCard({ plan, current, hot, children }) {
  return (
    <div className={`card plan ${current ? 'cur' : ''} ${hot ? 'hot' : ''}`}>
      {hot && <span className="ribbon">Most popular</span>}
      <h3>{plan.name}</h3>
      <h2>
        {plan.kobo ? naira(plan.kobo) : '₦0'}
        <small>{plan.kobo ? 'per 30 days' : 'forever'}</small>
      </h2>
      <ul>
        {plan.features.map((f) => (
          <li key={f}><Icon name="check" />{f}</li>
        ))}
      </ul>
      {children}
    </div>
  )
}
