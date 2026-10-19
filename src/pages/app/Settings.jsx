import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useExam } from '../../context/ExamContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { ErrorLine } from '../../components/ui.jsx'
import * as api from '../../lib/api.js'
import { useAction } from '../../hooks.js'
import InstallApp from '../../components/InstallApp.jsx'

function Password() {
  const { setPassword } = useAuth()
  const { busy, error, run } = useAction()
  const [pw, setPw] = useState('')
  const [done, setDone] = useState(false)
  return (
    <div className="card">
      <h3>Change password</h3>
      <label htmlFor="np">New password (at least 8 characters)</label>
      <input id="np" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setDone(false) }} autoComplete="new-password" />
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={busy} onClick={() => run(async () => {
        if (pw.length < 8) throw new Error('Use at least 8 characters.')
        await setPassword(pw)
        setPw('')
        setDone(true)
      })}>{done ? 'Password changed ✓' : 'Change password'}</button>
    </div>
  )
}

function Danger() {
  const { user, signOut } = useAuth()
  const { refreshAttempts } = useExam()
  const nav = useNavigate()
  const reset = useAction()
  const del = useAction()
  const [confirmReset, setConfirmReset] = useState(false)
  const [text, setText] = useState('')
  return (
    <div className="card">
      <h3>Danger zone</h3>
      <p className="mut">Reset clears your practice history (a submitted CBT mock stays on record). Deleting removes your account and results for good.</p>
      <ErrorLine>{reset.error}</ErrorLine>
      <button className="btn ghost" disabled={reset.busy} onClick={() => {
        if (!confirmReset) return setConfirmReset(true)
        reset.run(async () => { await api.deleteMyAttempts(user.id); refreshAttempts(); setConfirmReset(false) })
      }}>{confirmReset ? 'Click again to confirm' : 'Reset progress'}</button>
      <label htmlFor="dl"><br />Type DELETE to delete your account</label>
      <input id="dl" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <ErrorLine>{del.error}</ErrorLine>
      <button className="btn" style={{ background: 'var(--bad)', color: '#fff' }} disabled={del.busy} onClick={() => del.run(async () => {
        if (text.trim() !== 'DELETE') throw new Error('Type DELETE to confirm.')
        await api.deleteAccount()
        await signOut()
        nav('/')
      })}>{del.busy ? 'Deleting…' : 'Delete account'}</button>
    </div>
  )
}

export default function Settings() {
  const { user, profile, plan } = useAuth()
  const { dark, setTheme } = useTheme()
  const isPin = user.email?.endsWith('@pin.jambwise.ng')
  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h3>Appearance</h3>
        <div className="chips">
          <button className={'chip ' + (dark ? '' : 'on')} onClick={() => setTheme('light')}>Light</button>
          <button className={'chip ' + (dark ? 'on' : '')} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <InstallApp variant="card" />
      <div className="card">
        <h3>Account</h3>
        <div className="ln"><span>Login email</span><b>{user.email}</b></div>
        <div className="ln"><span>Plan</span><b>{plan}</b></div>
        <div className="ln"><span>JAMBwise number</span><b>{profile.reg_number}</b></div>
        <div className="ln"><span>Joined</span><b>{new Date(profile.created_at).toLocaleDateString('en-NG')}</b></div>
        {isPin && <p className="notice">You joined with an Access PIN, which is your password for now. Set your own password below to keep your account private.</p>}
        <p><Link to="/app/profile">Edit profile</Link> &nbsp; <Link to="/app/billing">Change plan</Link></p>
      </div>
      <Password />
      <div className="card">
        <h3>Privacy and help</h3>
        <p><Link to="/privacy">Privacy policy</Link> &nbsp; <Link to="/terms">Terms and conditions</Link> &nbsp; <Link to="/app/help">Customer Support</Link></p>
      </div>
      <Danger />
    </>
  )
}
