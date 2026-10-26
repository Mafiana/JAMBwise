import Icon from '../../components/Icons.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useExam } from '../../context/ExamContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { ErrorLine, Loader } from '../../components/ui.jsx'
import * as api from '../../lib/api.js'
import { useAction } from '../../hooks.js'
import { useLoad } from './admin/shared.jsx'
import InstallApp from '../../components/InstallApp.jsx'
import { useConfirm } from '../../components/Confirm.jsx'

function Password() {
  const { setPassword } = useAuth()
  const { busy, error, run } = useAction()
  const [pw, setPw] = useState('')
  const [done, setDone] = useState(false)
  return (
    <div className="card">
      <h3>Change password</h3>
      <label htmlFor="np">New password (at least 8 characters)</label>
      <PasswordInput id="np" value={pw} onChange={(e) => { setPw(e.target.value); setDone(false) }} autoComplete="new-password" />
      <ErrorLine>{error}</ErrorLine>
      <button className="btn" disabled={busy} onClick={() => run(async () => {
        if (pw.length < 8) throw new Error('Use at least 8 characters.')
        await setPassword(pw)
        setPw('')
        setDone(true)
      }, 'Password changed')}>{done ? 'Password changed ✓' : 'Change password'}</button>
    </div>
  )
}

function Danger() {
  const { user, signOut, isTeacher } = useAuth()
  const { refreshAttempts } = useExam()
  const nav = useNavigate()
  const reset = useAction()
  const del = useAction()
  const confirm = useConfirm()
  const [text, setText] = useState('')
  return (
    <div className="card">
      <h3>Danger zone</h3>
      <p className="mut">{isTeacher ? 'Deleting removes your teacher account for good.' : 'Reset clears your practice history (a submitted CBT mock stays on record). Deleting removes your account and results for good.'}</p>
      <ErrorLine>{reset.error}</ErrorLine>
      {!isTeacher && <button className="btn ghost" disabled={reset.busy} onClick={async () => {
        if (await confirm({ title: 'Reset your progress?', message: 'Your practice history and scores will be cleared. A submitted CBT mock stays on record. This cannot be undone.', confirmLabel: 'Reset progress' })) {
          reset.run(async () => { await api.deleteMyAttempts(user.id); refreshAttempts() })
        }
      }}>Reset progress</button>}
      <label htmlFor="dl">{!isTeacher && <br />}Type DELETE to delete your account</label>
      <input id="dl" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <ErrorLine>{del.error}</ErrorLine>
      <button className="btn" style={{ background: 'var(--bad)', color: '#fff' }} disabled={del.busy} onClick={() => del.run(async () => {
        if (text.trim() !== 'DELETE') throw new Error('Type DELETE to confirm.')
        if (!(await confirm({ title: 'Delete your account?', message: 'Your account, practice history and any CBT mock or ExamHall result will be removed for good. This cannot be undone.', confirmLabel: 'Delete account' }))) return
        await api.deleteAccount()
        await signOut()
        nav('/')
      })}>{del.busy ? 'Deleting…' : 'Delete account'}</button>
    </div>
  )
}


const fmt = (d) => (d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/** A small copy icon: puts the text on the clipboard and says "Copied" for a moment. */
function CopyBtn({ text, label }) {
  const [ok, setOk] = useState(false)
  const go = async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600) } catch { /* the text is on screen to copy by hand */ }
  }
  return <button type="button" className="copyb" onClick={go} aria-label={'Copy ' + label} title={'Copy ' + label}>{ok ? <span className="sm">Copied</span> : <Icon name="copy" size={16} />}</button>
}

/** The student's own parent code: make it, share it, renew it, switch it off, and see who looked. */
function ParentAccess() {
  const fetchIt = useCallback(() => api.myParentAccess(), [])
  const { data, error, loading, reload } = useLoad(fetchIt)
  const { busy, error: actError, run } = useAction()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const [copied, setCopied] = useState(false)
  const has = Boolean(data?.code)
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Student ID: ${profile.reg_number}\nParent code: ${data.code}\nGo to ${location.origin}/#parents`); setCopied(true) } catch { /* the code is on screen to copy by hand */ }
  }
  return (
    <div className="card" id="parent">
      <h3>Parent access</h3>
      <p className="mut">Let a parent or guardian see how you are doing. Share your Student ID and this code with them. They sign in on the JAMBwise home page and can only look: they cannot change anything or see your messages. The code lasts 7 days.</p>
      {loading ? <Loader size="sm" label="Loading…" /> : error ? <ErrorLine>{error}</ErrorLine> : (
        <>
          {has ? (
            <div className="pcode">
              <div><span className="sm">Student ID</span><span className="pcode-v"><b>{profile.reg_number}</b><CopyBtn text={profile.reg_number} label="Student ID" /></span></div>
              <div><span className="sm">Parent code</span><span className="pcode-v"><b className="pcode-c">{data.code}</b><CopyBtn text={data.code} label="parent code" /></span></div>
              <div><span className="sm">Valid until</span><b>{fmt(data.expires_at)}</b></div>
            </div>
          ) : <p className="sm">{data?.expired ? 'Your parent code has expired.' : 'Parent access is switched off.'}</p>}
          <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={() => run(async () => { await api.parentCodeCreate(); setCopied(false); await reload() })}>{has ? 'Make a new code' : 'Make a parent code'}</button>
            {has && <button className="btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy details'}</button>}
            {has && <button className="btn danger" disabled={busy} onClick={async () => (await confirm({ title: 'Switch off parent access?', message: 'Your parent code stops working straight away and anyone looking right now is signed out. You can make a new code later.', confirmLabel: 'Switch off' })) && run(async () => { await api.parentCodeRevoke(); await reload() })}>Switch off</button>}
          </div>
          <ErrorLine>{actError}</ErrorLine>
          {has && <p className="sm">A new code replaces the old one and signs out anyone using it.</p>}
          <h4>Who has looked</h4>
          {data.views.length === 0 ? <p className="sm" style={{ margin: 0 }}>No one yet. You will also see a message on your bell each time.</p> : (
            <ul className="pviews">{data.views.map((v, i) => <li key={i}><b>{v.parent_name}</b> <span className="sm">({v.relationship}) · {fmt(v.created_at)} · {v.device}</span></li>)}</ul>
          )}
        </>
      )}
    </div>
  )
}

export default function Settings() {
  const { user, profile, plan, isStaff, isTeacher } = useAuth()
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
        {isTeacher
          ? <div className="ln"><span>Role</span><b>Teacher</b></div>
          : <><div className="ln"><span>Plan</span><b>{plan}</b></div>
            <div className="ln"><span>JAMBwise number</span><b>{profile.reg_number}</b></div></>}
        <div className="ln"><span>Joined</span><b>{new Date(profile.created_at).toLocaleDateString('en-NG')}</b></div>
        {isPin && <p className="notice">You joined with an Access PIN, which is your password for now. Set your own password below to keep your account private.</p>}
        <p><Link to="/app/profile">Edit profile</Link>{!isTeacher && <> &nbsp; <Link to="/app/billing">Change plan</Link></>}</p>
      </div>
      {!isStaff && <ParentAccess />}
      <Password />
      <div className="card">
        <h3>Privacy and help</h3>
        <p><Link to="/privacy">Privacy policy</Link> &nbsp; <Link to="/terms">Terms and conditions</Link>{!isTeacher && <> &nbsp; <Link to="/app/help">Customer Support</Link></>}</p>
      </div>
      <Danger />
    </>
  )
}
