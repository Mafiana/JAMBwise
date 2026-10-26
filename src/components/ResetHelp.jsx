import { useEffect, useRef, useState } from 'react'
import Icon from './Icons.jsx'
import { ADMIN_WHATSAPP, RESET_WAIT_SECONDS, RESET_WHATSAPP_TEXT } from '../lib/constants.js'

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const whatsapp = ADMIN_WHATSAPP + '?text=' + encodeURIComponent(RESET_WHATSAPP_TEXT)

/**
 * Shown after a reset link was requested. Counts down 2 minutes; if the person is still on the page when it reaches zero
 * (so presumably no link arrived), a dialog offers to contact the admin on WhatsApp with "I'd like to reset my password".
 * `startedAt` is the time (ms) the link was requested; ask for another link and the count starts again.
 */
export default function ResetHelp({ startedAt }) {
  const [left, setLeft] = useState(RESET_WAIT_SECONDS)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const closeRef = useRef(null)
  useEffect(() => {
    setOpen(false); setCopied(false)
    if (!startedAt) return undefined
    const tick = () => {
      const s = Math.max(0, RESET_WAIT_SECONDS - Math.floor((Date.now() - startedAt) / 1000))
      setLeft(s)
      if (s === 0) { setOpen(true); clearInterval(t) }
    }
    const t = setInterval(tick, 1000)
    tick()
    return () => clearInterval(t)
  }, [startedAt])
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', key)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [open])
  if (!startedAt) return null
  return (
    <>
      {left > 0 ? (
        <p className="sm reset-wait" role="timer" aria-live="off">Waiting for your link… help is offered in <b>{clock(left)}</b> if it does not arrive.</p>
      ) : (
        <p className="sm reset-wait">No link yet? <button type="button" className="linkish" onClick={() => setOpen(true)}>Contact admin</button></p>
      )}
      {open && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="rh-t" aria-describedby="rh-m">
            <span className="modal-ic"><Icon name="chat" size={24} /></span>
            <h3 id="rh-t">Contact admin</h3>
            <p id="rh-m" className="mut">Your reset link has not arrived after 2 minutes. Message the admin on WhatsApp and we will reset your password for you.</p>
            <p className="sm">Message: <b>{RESET_WHATSAPP_TEXT}</b></p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" ref={closeRef} onClick={() => setOpen(false)}>Keep waiting</button>
              <a className="btn" href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => { try { navigator.clipboard.writeText(RESET_WHATSAPP_TEXT); setCopied(true) } catch { /* the message is shown above to copy by hand */ } }}>Contact admin</a>
            </div>
            {copied && <p className="sm ok" role="status">The message was copied. Paste it in WhatsApp if it does not appear by itself.</p>}
          </div>
        </div>
      )}
    </>
  )
}
