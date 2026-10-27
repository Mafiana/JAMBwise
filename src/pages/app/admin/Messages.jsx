import Icon from '../../../components/Icons.jsx'
import { useEffect, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import { useConfirm } from '../../../components/Confirm.jsx'
import TicketThread from '../../../components/TicketThread.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import * as api from '../../../lib/api.js'
import { useAction } from '../../../hooks.js'
import { TICKET_STATUS, isMail, ticketNo } from '../../../lib/utils.js'
import { Empty, fmtDateTime, TabLoader, useLoad } from './shared.jsx'

export const TOPIC = { general: 'General', payment: 'Payment', pin: 'Access PIN', bug: 'Bug', question: 'Question report', suspended: 'Suspended account', other: 'Other' }
const chip = (s) => 'tag' + (s === 'new' ? ' bad' : s === 'answered' ? ' ok' : s === 'resolved' ? ' muted' : '')

export default function Messages({ mail = false }) {
  const { isAdmin } = useAuth()   // teachers answer tickets; only admins delete them
  const { data, error, loading, reload } = useLoad(api.adminMessages)
  const act = useAction()
  const confirm = useConfirm()
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  // new messages and replies appear by themselves (quietly, every 10 seconds while the tab is open)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 10000)
    return () => clearInterval(t)
  }, [reload])
  if (loading) return <TabLoader />
  if (!data) return <ErrorLine>{error}</ErrorLine>
  const needle = q.trim().toLowerCase()
  const shown = data.filter((m) =>
    isMail(m) === mail &&
    (filter === 'open' ? m.status === 'new' || m.status === 'read' : filter === 'reports' ? m.topic === 'question' : filter === 'all' || m.status === filter) &&
    (!needle || [m.name, m.email, m.subject, m.body, ticketNo(m.id)].some((v) => String(v || '').toLowerCase().includes(needle))))
  const mine = data.filter((m) => isMail(m) === mail)
  const count = (s) => mine.filter((m) => m.status === s).length
  const setStatus = (m, status) => act.run(async () => { await api.adminSetMessageStatus(m.id, status); await reload() })
  return (
    <>
      <div className="stat-grid">
        <div className="card st"><b>{count('new')}</b><span>{mail ? 'new messages' : 'new tickets'}</span></div>
        <div className="card st"><b>{count('read')}</b><span>seen, no reply yet</span></div>
        <div className="card st"><b>{count('answered')}</b><span>answered, waiting on student</span></div>
        <div className="card st"><b>{count('resolved')}</b><span>resolved</span></div>
      </div>
      <div className="adm-filters">
        <select aria-label="Filter tickets" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Needs attention</option>{!mail && <option value="reports">Question reports</option>}<option value="answered">{mail ? 'Replied' : 'Answered'}</option><option value="resolved">Resolved</option><option value="all">{mail ? 'All messages' : 'All tickets'}</option>
        </select>
        <span className="srch"><Icon name="search" size={18} /><input type="search" aria-label="Search tickets" placeholder="Search name, email, subject or ticket number" value={q} onChange={(e) => setQ(e.target.value)} /></span>
      </div>
      <ErrorLine>{act.error}</ErrorLine>
      {shown.length === 0 && <div className="card"><Empty>{mail ? 'No mail yet. Messages from the Contact page, the home page and suspended accounts arrive here, and every one rings the bell.' : 'Nothing here. Tickets from the Customer Support page show up here.'}</Empty></div>}
      {shown.map((m) => (
        <div className={'card ticket msg' + (openId === m.id ? ' open' : '')} key={m.id}>
          <button className="ticket-head" aria-expanded={openId === m.id} onClick={() => { setOpenId(openId === m.id ? null : m.id); if (openId !== m.id && m.status === 'new') setStatus(m, 'read') }}>
            <span className="ticket-id">{ticketNo(m.id)}</span>
            <span className="ticket-sub"><b>{m.subject || m.body.slice(0, 60)}</b><span className="sm"> · {m.name}{m.user_id ? '' : ' (guest)'} · {TOPIC[m.topic] || m.topic}</span></span>
            <span className={chip(m.status)}>{TICKET_STATUS[m.status]}</span>
            <span className="ticket-date">{fmtDateTime(m.created_at)}</span>
          </button>
          {openId === m.id && (
            <>
              <TicketThread ticket={m} staff onChange={reload} />
              <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginTop: 4 }}>
                {mail && m.status !== 'resolved' && m.status !== 'answered' && <button className="btn" onClick={() => setStatus(m, 'answered')}>Mark as replied</button>}
                {mail && m.status !== 'resolved' && <button className="btn ghost" onClick={() => setStatus(m, 'resolved')}>Mark resolved</button>}
                {m.status === 'resolved' && <button className="btn ghost" onClick={() => setStatus(m, 'new')}>Reopen</button>}
                {isAdmin && <button className="btn danger" onClick={async () => (await confirm({ title: 'Delete this ticket?', message: `${ticketNo(m.id)} and its whole conversation will be permanently deleted.`, confirmLabel: 'Delete ticket' })) && act.run(async () => { await api.adminDeleteMessage(m.id); setOpenId(null); await reload() })}>Delete ticket</button>}
              </div>
            </>
          )}
        </div>
      ))}
    </>
  )
}
