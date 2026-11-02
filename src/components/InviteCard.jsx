import { useEffect, useState } from 'react'
import * as api from '../lib/api.js'
import CopyButton from './CopyButton.jsx'

/** Profile page: the student's personal invite link and what it has earned. */
export default function InviteCard() {
  const [data, setData] = useState(null)
  useEffect(() => { let alive = true; api.myReferral().then((d) => alive && setData(d)).catch(() => {}); return () => { alive = false } }, [])
  if (!data) return null
  const link = `${window.location.origin}/auth/signup?ref=${data.code}`
  const text = `Practise for JAMB with me on JAMBwise: ${link}`
  const open = (data.coupons || []).filter((c) => !c.used && !c.expired)
  return (
    <div className="card invite-card">
      <h3 style={{ marginTop: 0 }}>Invite a friend, get 15% off</h3>
      <p className="mut">Share your link. When your friend makes their first payment, you get a 15% discount code for your next payment.</p>
      <div className="invite-link"><input value={link} readOnly aria-label="Your invite link" onFocus={(e) => e.target.select()} /><CopyButton text={link} label="invite link" /></div>
      <a className="btn ghost" href={'https://wa.me/?text=' + encodeURIComponent(text)} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      <p className="sm">{data.signed_up} {data.signed_up === 1 ? 'friend has' : 'friends have'} joined with your link, {data.paid} paid.</p>
      {open.length > 0 && <p className="notice" role="status">You have {open.length} discount {open.length === 1 ? 'code' : 'codes'} waiting. Use {open.length === 1 ? 'it' : 'one'} on the Plans page.</p>}
    </div>
  )
}
