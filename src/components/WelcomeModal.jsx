import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal.jsx'
import Icon from './Icons.jsx'
import { firstName, isNewAccount } from '../lib/utils.js'

const key = (id) => `jw_welcomed:${id}`
const seen = (id) => { try { return localStorage.getItem(key(id)) === '1' } catch { return false } }
const remember = (id) => { try { localStorage.setItem(key(id), '1') } catch { /* private window: it may show again */ } }

/** Shown once to a student whose account is new (opened with a PIN or by signing up): welcome, update your profile, ask support if stuck. */
export default function WelcomeModal({ profile }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(() => Boolean(profile?.id) && isNewAccount(profile) && !seen(profile.id))
  if (!open) return null
  const close = () => { remember(profile.id); setOpen(false) }
  const go = (to) => { close(); nav(to) }
  return (
    <Modal title="Welcome to JAMBwise" onClose={close}>
      <div className="welcome-box" role="status">
        <span className="ic"><Icon name="check" /></span>
        <h3>Hello, {firstName(profile.full_name)}!</h3>
        <p>Your account is ready. Please take a minute to <b>update your profile</b> (your name, course and school) so your results and reports carry the right details.</p>
        <p>If you need any assistance, please <b>contact Customer Support</b> and we will help you.</p>
        <div className="welcome-acts">
          <button type="button" className="btn" onClick={() => go('/app/profile')}>Update my profile</button>
          <button type="button" className="btn ghost" onClick={() => go('/app/help')}>Contact support</button>
        </div>
      </div>
    </Modal>
  )
}
