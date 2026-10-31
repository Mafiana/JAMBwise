import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { pinTimeLeft } from '../lib/utils.js'
import Icon from './Icons.jsx'

const pad = (n) => String(n).padStart(2, '0')

/** A live countdown shown at the top of the profile (full size) and the dashboard (`compact`) when a PIN has less than 3 days left. Nothing is shown otherwise. */
export default function PinCountdown({ compact = false }) {
  const { user, profile } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const active = Boolean(pinTimeLeft(user, profile, new Date()))
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [active])
  const t = pinTimeLeft(user, profile, now)
  if (!t) return null
  const urgent = t.ms < 864e5   // under one day: stronger colours
  const ends = new Date(profile.plan_expires).toLocaleString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
  const words = t.d > 0 ? `${t.d} day${t.d === 1 ? '' : 's'} and ${t.h} hour${t.h === 1 ? '' : 's'}` : `${t.h} hour${t.h === 1 ? '' : 's'} and ${t.m} minute${t.m === 1 ? '' : 's'}`
  if (compact) {
    return (
      <section className={'pin-cd sm-cd' + (urgent ? ' urgent' : '')} aria-label={`Your access PIN ends in ${words}`}>
        <span className="pin-cd-ic"><Icon name="clock" size={18} /></span>
        <div className="sm-cd-txt">
          <b>{urgent ? 'PIN ends very soon' : 'PIN running out'}</b>
          <span className="sm-cd-time" role="timer" aria-hidden="true">
            {t.d > 0 && <><em>{pad(t.d)}</em>d </>}<em>{pad(t.h)}</em>h <em>{pad(t.m)}</em>m <em>{pad(t.s)}</em>s
          </span>
        </div>
        <Link className="btn" to="/contact">Contact Admin</Link>
      </section>
    )
  }
  return (
    <section className={'pin-cd' + (urgent ? ' urgent' : '')} aria-label={`Your access PIN ends in ${words}`}>
      <div className="pin-cd-head">
        <span className="pin-cd-ic"><Icon name="clock" size={22} /></span>
        <div>
          <b>{urgent ? 'Your access PIN ends very soon' : 'Your access PIN is running out'}</b>
          <p>It ends on {ends}. Ask the Admin or your Tutor for a new PIN so you do not lose access.</p>
        </div>
      </div>
      <div className="pin-cd-time" role="timer" aria-hidden="true">
        {[['Days', t.d], ['Hours', t.h], ['Minutes', t.m], ['Seconds', t.s]].map(([label, n]) => (
          <div key={label} className="pin-cd-box"><strong>{pad(n)}</strong><span>{label}</span></div>
        ))}
      </div>
      <div className="pin-cd-bar" aria-hidden="true"><i style={{ width: Math.max(2, Math.round(t.left * 100)) + '%' }} /></div>
      <div className="pin-cd-foot">
        <Link className="btn" to="/contact">Contact Admin</Link>
        <span className="sm">or ask your Tutor</span>
      </div>
    </section>
  )
}
