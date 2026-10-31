import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../lib/api.js'
import Icon from './Icons.jsx'
import { playChime } from '../lib/utils.js'

const ago = (d) => {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'
  if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago'
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

/** The bell: unread count, a list of recent notifications (results released, new chat messages), tap one to go there. */
export default function NotificationBell() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 60, left: 12 })
  const btn = useRef(null)
  const panel = useRef(null)
  const navigate = useNavigate()
  const unread = items.filter((n) => !n.read_at).length

  const top = useRef(null)   // the newest notification id we have already seen; null until the first load
  const load = useCallback(async () => {
    try {
      const rows = await api.getNotifications()
      const newest = rows.reduce((m, n) => Math.max(m, Number(n.id) || 0), 0)
      // a new unread notification arrived while the app is open: play the sound (never on the first load)
      if (top.current != null && rows.some((n) => !n.read_at && (Number(n.id) || 0) > top.current)) playChime()
      top.current = Math.max(top.current ?? 0, newest)
      setItems(rows)
    } catch { /* offline or not ready: keep what we have */ }
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 10000)
    const again = () => load()
    window.addEventListener('focus', again)
    window.addEventListener('jw-notify', again)
    return () => { clearInterval(t); window.removeEventListener('focus', again); window.removeEventListener('jw-notify', again) }
  }, [load])

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!panel.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect()
      const w = Math.min(340, window.innerWidth - 24)
      setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) })
      load()
    }
    setOpen(!open)
  }
  const markAll = async () => {
    setItems((l) => l.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    try { await api.markNotificationsRead() } catch { load() }
  }
  const go = async (n) => {
    setOpen(false)
    if (!n.read_at) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      try { await api.markNotificationsRead({ id: n.id }) } catch { /* shown as read until the next refresh */ }
    }
    if (n.link) navigate(n.link)
  }

  return (
    <>
      <button ref={btn} type="button" className="tgl bell" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-n" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div ref={panel} className="bell-pop" role="dialog" aria-label="Notifications" style={{ top: pos.top, left: pos.left }}>
          <div className="bell-head">
            <b>Notifications</b>
            {unread > 0 && <button type="button" className="linkish" onClick={markAll}>Mark all as read</button>}
          </div>
          {items.length === 0 ? <p className="sm bell-empty">Nothing yet. You will be told here when results are released or someone messages you.</p> : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={'bell-item' + (n.read_at ? '' : ' new')} onClick={() => go(n)}>
                    <span className="bell-ic" aria-hidden="true"><Icon name={n.kind === 'chat' ? 'chat' : n.kind === 'parent' ? 'eye' : n.kind === 'teacher' ? 'users' : n.kind === 'question' ? 'flag' : n.kind === 'review' ? 'check' : n.kind === 'announce' ? 'announce' : n.kind === 'feedback' ? 'star' : n.kind === 'ticket' ? 'inbox' : n.kind === 'mail' ? 'mail' : 'trophy'} size={16} /></span>
                    <span className="bell-tx"><b>{n.title}</b>{n.body && <span>{n.body}</span>}<em>{ago(n.created_at)}</em></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
