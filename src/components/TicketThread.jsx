import { useCallback, useEffect, useState } from 'react'
import { ErrorLine } from './ui.jsx'
import Icon from './Icons.jsx'
import * as api from '../lib/api.js'
import { useAction } from '../hooks.js'

const when = (d) => new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** The conversation on one ticket. Used by students (Customer Support) and admins (Support tickets). */
export default function TicketThread({ ticket, staff = false, onChange }) {
  const [replies, setReplies] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [text, setText] = useState('')
  const { busy, error, setError, run } = useAction()
  const canReply = Boolean(ticket.user_id)   // a guest (not signed in) can only be answered by email

  const load = useCallback(async () => {
    try { setReplies(await api.ticketReplies(ticket.id)); setLoadError('') } catch (e) { setLoadError(e.message) }
  }, [ticket.id])
  useEffect(() => { load() }, [load])

  const send = () => {
    if (!text.trim()) return setError('Write your reply first.')
    return run(async () => { await api.replyTicket(ticket.id, text.trim()); setText(''); await load(); onChange?.() })
  }
  const resolve = () => run(async () => { await api.closeTicket(ticket.id); await load(); onChange?.() })

  return (
    <div className="thread">
      <div className={'bubble ' + (staff ? 'them' : 'me')}><b>{staff ? ticket.name : 'You'}</b><span className="when">{when(ticket.created_at)}</span><p>{ticket.body}</p></div>
      {replies === null && !loadError && <p className="sm">Loading conversation…</p>}
      {replies?.map((r) => (
        <div key={r.id} className={'bubble ' + (r.is_staff === staff ? 'me' : 'them')}>
          <b>{r.is_staff ? 'JAMBwise support' : staff ? ticket.name : 'You'}</b><span className="when">{when(r.created_at)}</span><p>{r.body}</p>
        </div>
      ))}
      <ErrorLine>{loadError || error}</ErrorLine>
      {canReply ? (
        <div className="thread-reply">
          <label htmlFor={`tr-${ticket.id}`} className="sm">{ticket.status === 'resolved' ? 'This ticket is resolved. Replying will reopen it.' : staff ? 'Reply to the student' : 'Add a reply'}</label>
          <textarea id={`tr-${ticket.id}`} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button className="btn" disabled={busy} onClick={send}><Icon name="send" size={16} /> {busy ? 'Sending…' : 'Send reply'}</button>
            {ticket.status !== 'resolved' && <button className="btn ghost" disabled={busy} onClick={resolve}>{staff ? 'Mark resolved' : 'Mark as resolved'}</button>}
          </div>
        </div>
      ) : (
        <p className="sm">This person was not signed in, so replies go by email: <a href={`mailto:${ticket.email}?subject=${encodeURIComponent('Re: ' + (ticket.subject || 'your JAMBwise message'))}`}>{ticket.email}</a></p>
      )}
    </div>
  )
}
