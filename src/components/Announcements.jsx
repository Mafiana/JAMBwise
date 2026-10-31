import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icons.jsx'
import { Loader } from './ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import * as api from '../lib/api.js'

const seenKey = (uid) => `jw_ann_seen_${uid}`
const readSeen = (uid) => { try { return Number(localStorage.getItem(seenKey(uid))) || 0 } catch { return 0 } }
const writeSeen = (uid, id) => { try { localStorage.setItem(seenKey(uid), String(id)) } catch { /* private window */ } }
const when = (d) => new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const inboxPath = (isTeacher) => (isTeacher ? '/app/admin/announcements' : '/app/announcements')

/** The Announcements page for students and teachers: everything sent to everyone, and to them privately. Opening it marks them all as seen. */
export function AnnouncementInbox() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    api.myAnnouncements().then((r) => { if (!alive) return; setRows(r); if (r.length && user?.id) writeSeen(user.id, Math.max(...r.map((x) => x.id))) })
    return () => { alive = false }
  }, [user?.id])
  if (!rows) return <Loader label="Loading announcements…" />
  if (!rows.length) return <div className="card c"><span className="ic" style={{ margin: '0 auto 10px' }}><Icon name="announce" /></span><p className="mut" style={{ margin: 0 }}>No announcements yet. When there is news, you will see it here.</p></div>
  return (
    <div className="ann-list">
      {rows.map((a) => (
        <article className="card ann" key={a.id}>
          <header><h3>{a.title}</h3><span className={'tag' + (a.audience === 'all' ? '' : ' muted')}>{a.audience === 'all' ? 'For everyone' : 'Just for you'}</span></header>
          <p className="ann-body">{a.body}</p>
          <span className="sm">{when(a.created_at)}</span>
        </article>
      ))}
    </div>
  )
}

/** A bar at the top of the page for the newest announcement you have not read. Students and teachers only. */
export function AnnouncementBanner() {
  const { user, isAdmin, isTeacher } = useAuth()
  const [latest, setLatest] = useState(null)
  const [hidden, setHidden] = useState(0)
  const timer = useRef(null)
  useEffect(() => {
    if (!user?.id || isAdmin) return undefined
    let alive = true
    const load = () => api.myAnnouncements().then((r) => {
      if (!alive) return
      const newest = r[0]
      setLatest(newest && newest.id > readSeen(user.id) ? newest : null)
    })
    load()
    timer.current = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000)
    return () => { alive = false; clearInterval(timer.current) }
  }, [user?.id, isAdmin])
  if (!latest || hidden === latest.id) return null
  const dismiss = () => { writeSeen(user.id, latest.id); setHidden(latest.id) }
  return (
    <div className="ann-banner" role="status">
      <Icon name="announce" size={20} />
      <span className="ann-text"><b>{latest.title}</b> {latest.body.length > 140 ? latest.body.slice(0, 140) + '…' : latest.body}</span>
      <Link className="btn ghost" to={inboxPath(isTeacher)} onClick={dismiss}>Read</Link>
      <button type="button" className="ann-x" onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  )
}
