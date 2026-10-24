import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorLine } from '../../../components/ui.jsx'
import Icon from '../../../components/Icons.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import { useAction } from '../../../hooks.js'
import * as api from '../../../lib/api.js'
import { fmtDateTime } from './shared.jsx'

/** One admin ↔ teacher conversation. `markLink` is the notification link that this chat answers, so opening it clears the bell. */
export default function StaffChat({ teacherId, markLink, onSent }) {
  const { user } = useAuth()
  const [msgs, setMsgs] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [text, setText] = useState('')
  const { busy, error, run } = useAction()
  const box = useRef(null)

  const load = useCallback(async () => {
    try { setMsgs(await api.staffChatThread(teacherId)); setLoadErr('') } catch (e) { setLoadErr(e.message) }
  }, [teacherId])
  useEffect(() => {
    setMsgs(null)
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 5000)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => {   // reading the chat clears its bell notification
    api.markNotificationsRead({ link: markLink }).then(() => window.dispatchEvent(new Event('jw-notify')), () => {})
  }, [markLink, msgs?.length])
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [msgs?.length])

  const send = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    run(async () => { await api.staffChatSend(teacherId, text); setText(''); await load(); onSent?.() })
  }
  return (
    <div className="chat">
      <div className="chat-box" ref={box} role="log" aria-label="Messages">
        {msgs === null && !loadErr && <p className="sm">Loading…</p>}
        {msgs?.length === 0 && <p className="sm chat-empty">No messages yet. Say hello below.</p>}
        {msgs?.map((m) => {
          const mine = m.sender_id === user.id
          return (
            <div key={m.id} className={'bub' + (mine ? ' me' : '')}>
              <span className="bub-who">{mine ? 'You' : m.sender_name}</span>
              <p>{m.body}</p>
              <span className="bub-t">{fmtDateTime(m.created_at)}</span>
            </div>
          )
        })}
      </div>
      <ErrorLine>{loadErr || error}</ErrorLine>
      <form className="chat-form" onSubmit={send}>
        <textarea aria-label="Write a message" rows={2} maxLength={2000} placeholder="Write a message…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e) }} />
        <button className="btn" disabled={busy || !text.trim()}><Icon name="send" size={16} /> Send</button>
      </form>
    </div>
  )
}
