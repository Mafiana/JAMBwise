import { useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { pinExpired } from '../lib/utils.js'

const seenKey = (id, until) => `jw_pin_expired:${id}:${until}`
const wasSeen = (id, until) => { try { return sessionStorage.getItem(seenKey(id, until)) === '1' } catch { return false } }
const markSeen = (id, until) => { try { sessionStorage.setItem(seenKey(id, until), '1') } catch { /* private window: it simply shows again */ } }

/** Once per sign-in: tells a PIN student their access has ended and who to contact. */
export default function PinExpired() {
  const { user, profile } = useAuth()
  const until = profile?.plan_expires
  const [open, setOpen] = useState(() => pinExpired(user, profile) && !wasSeen(profile?.id, until))
  if (!open || !pinExpired(user, profile)) return null
  const close = () => { markSeen(profile.id, until); setOpen(false) }
  return (
    <Modal title="Your access PIN has expired" onClose={close}>
      <p>The time on your PIN has ended, so your practice and mock exams are locked.</p>
      <p>To continue, please <b>contact the Admin</b> or <b>your Tutor</b> for a new PIN.</p>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={close}>I will ask my Tutor</button>
        <Link className="btn" to="/contact" onClick={markSeen.bind(null, profile.id, until)}>Contact Admin</Link>
      </div>
    </Modal>
  )
}
