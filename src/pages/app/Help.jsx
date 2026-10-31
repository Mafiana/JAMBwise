import { useCallback, useEffect, useState } from 'react'
import Icon from '../../components/Icons.jsx'
import Modal from '../../components/Modal.jsx'
import TicketThread from '../../components/TicketThread.jsx'
import { ErrorLine } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import * as api from '../../lib/api.js'
import { useAction } from '../../hooks.js'
import { TICKET_STATUS, ticketNo } from '../../lib/utils.js'

const TOPICS = [['general', 'General question'], ['pin', 'Access PIN problem'], ['payment', 'Payment or plan'], ['bug', 'Something is broken'], ['other', 'Other']]
const chip = (s) => 'tag' + (s === 'answered' ? ' ok' : s === 'resolved' ? ' muted' : '')

export default function Help() {
  const { profile, user } = useAuth()
  const [tickets, setTickets] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [open, setOpen] = useState(null)
  const [f, setF] = useState({ topic: 'general', subject: '', body: '' })
  const [made, setMade] = useState('')
  const { busy, error, setError, run } = useAction()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const load = useCallback(async () => {
    try { setTickets(await api.myTickets()); setLoadError('') } catch (e) { setLoadError(e.message) }
  }, [])
  useEffect(() => { load() }, [load])
  // a reply from a teacher or admin shows up without the student having to reload the page
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    const back = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', back)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back) }
  }, [load])

  const submit = (e) => {
    e.preventDefault()
    setMade('')
    if (f.subject.trim().length < 3) return setError('Give your ticket a short subject.')
    if (f.body.trim().length < 5) return setError('Please describe the problem in a few words.')
    return run(async () => {
      await api.sendMessage({ name: profile.full_name || 'Student', email: profile.email || user?.email || '', topic: f.topic, subject: f.subject, body: f.body, user_id: user.id })
      setF({ topic: 'general', subject: '', body: '' })
      setMade('Ticket sent. We will reply here, and you can follow the conversation below.')
      await load()
    })
  }

  const unanswered = tickets?.filter((t) => t.status === 'answered').length || 0
  return (
    <>
      <h1>Customer Support</h1>
      <p className="mut">Open a ticket and we will reply right here.</p>

      <div className="card">
        <h3><Icon name="plus" size={18} /> Open a new ticket</h3>
        <form onSubmit={submit} noValidate>
          <div className="adm-form">
            <div><label htmlFor="tt">Topic</label><select id="tt" value={f.topic} onChange={set('topic')}>{TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label htmlFor="ts">Subject</label><input id="ts" value={f.subject} onChange={set('subject')} maxLength={120} placeholder="Short summary" /></div>
          </div>
          <label htmlFor="tb">What happened?</label>
          <textarea id="tb" rows={4} maxLength={2000} value={f.body} onChange={set('body')} placeholder="Tell us what you tried and what you saw. For payments, include your Paystack reference." />
          <ErrorLine>{error}</ErrorLine>
          <button className="btn" disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Sending…' : 'Submit ticket'}</button>
        </form>
      </div>

      <h3>Your tickets {unanswered > 0 && <span className="tag ok">{unanswered} new repl{unanswered > 1 ? 'ies' : 'y'}</span>}</h3>
      <ErrorLine>{loadError}</ErrorLine>
      {tickets && tickets.length === 0 && <div className="card"><p className="sm" style={{ margin: 0 }}>You have not opened any tickets yet.</p></div>}
      {tickets?.map((t) => (
        <div className={'card ticket' + (open === t.id ? ' open' : '')} key={t.id}>
          <button className="ticket-head" aria-expanded={open === t.id} onClick={() => setOpen(open === t.id ? null : t.id)}>
            <span className="ticket-id">{ticketNo(t.id)}</span>
            <span className="ticket-sub">{t.subject || t.body.slice(0, 60)}</span>
            <span className={chip(t.status)}>{TICKET_STATUS[t.status]}</span>
            <span className="ticket-date">{new Date(t.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
          </button>
          {open === t.id && <TicketThread ticket={t} onChange={load} />}
        </div>
      ))}
      {made && !error && (
        <Modal title="Ticket sent" onClose={() => setMade('')}>
          <p>{made}</p>
          <div className="modal-actions"><button className="btn" onClick={() => setMade('')}><Icon name="check" size={16} /> OK</button></div>
        </Modal>
      )}
    </>
  )
}
