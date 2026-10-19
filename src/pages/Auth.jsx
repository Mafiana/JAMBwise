import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorLine, Logo } from '../components/ui.jsx'
import { useAction } from '../hooks.js'
import { demoMode } from '../lib/supabase.js'
import { DEMO_ADMIN, DEMO_STUDENT } from '../lib/demo/accounts.js'

const MIN_PASSWORD = 8

export default function Auth() {
  const { mode = 'login' } = useParams()
  const { session, recovering, signIn, signUp, sendReset, setPassword } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { busy, error, setError, run } = useAction()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [notice, setNotice] = useState('')
  const [dest, setDest] = useState('') // where to go after a one-click demo login
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // Signed in already (and not in the middle of resetting a password): go to the app.
  if (session && !recovering && mode !== 'reset') return <Navigate to={dest || loc.state?.from || '/app/dashboard'} replace />

  const email = f.email.trim().toLowerCase()
  const submit = (e) => {
    e.preventDefault()
    setNotice('')
    run(async () => {
      if (mode === 'forgot') {
        if (!email.includes('@')) throw new Error('Enter a valid email address.')
        await sendReset(email)
        setNotice('If that email has an account, a reset link is on its way. Check your inbox and spam folder.')
        return
      }
      if (mode === 'reset') {
        if (f.password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`)
        await setPassword(f.password)
        nav('/app/dashboard')
        return
      }
      if (!email.includes('@')) throw new Error('Enter a valid email address.')
      if (mode === 'signup') {
        if (!f.name.trim()) throw new Error('Enter your full name.')
        if (f.password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters for your password.`)
        const { needsConfirm } = await signUp(f.name.trim(), email, f.password)
        if (needsConfirm) setNotice('Account created. We sent a confirmation link to your email. Open it, then log in.')
        else nav('/app/profile')
        return
      }
      await signIn(email, f.password)
      nav(loc.state?.from || '/app/dashboard')
    })
  }

  const titles = { login: 'Log in', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' }
  const button = { login: 'Log in', signup: 'Sign up free', forgot: 'Send reset link', reset: 'Save new password' }
  return (
    <div className="auth-page">
      <form className="card auth" onSubmit={submit} noValidate>
        <Logo />
        <h2>{titles[mode] || titles.login}</h2>
        {demoMode && mode === 'login' && (
          <div className="demo-box">
            <b>Demo mode.</b> Log in with one click:
            <div className="row">
              <button type="button" className="btn sm" onClick={() => { setDest('/app/admin'); run(() => signIn(DEMO_ADMIN.email, DEMO_ADMIN.password)) }}>Admin</button>
              <button type="button" className="btn ghost sm" onClick={() => { setDest('/app/dashboard'); run(() => signIn(DEMO_STUDENT.email, DEMO_STUDENT.password)) }}>Student</button>
            </div>
          </div>
        )}
        {mode === 'signup' && (
          <>
            <label htmlFor="nm" className="sm">Full name</label>
            <input id="nm" value={f.name} onChange={set('name')} placeholder="Full name" autoComplete="name" />
          </>
        )}
        {mode !== 'reset' && (
          <>
            <label htmlFor="em" className="sm">Email</label>
            <input id="em" type="email" value={f.email} onChange={set('email')} placeholder="Email" autoComplete="email" />
          </>
        )}
        {mode !== 'forgot' && (
          <>
            <label htmlFor="pw" className="sm">{mode === 'reset' ? 'New password' : 'Password'}</label>
            <input id="pw" type="password" value={f.password} onChange={set('password')} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </>
        )}
        <ErrorLine>{error}</ErrorLine>
        {notice && <p className="notice" role="status">{notice}</p>}
        <button className="btn w" disabled={busy}>{busy ? 'Please wait…' : button[mode] || button.login}</button>
        {mode === 'login' && (
          <p className="mut">New here? <Link to="/auth/signup" onClick={() => setError('')}>Sign up</Link> &nbsp; <Link to="/auth/forgot" onClick={() => setError('')}>Forgot password?</Link></p>
        )}
        {mode === 'signup' && <p className="mut">Have an account? <Link to="/auth/login" onClick={() => setError('')}>Log in</Link></p>}
        {mode === 'forgot' && <p className="mut"><Link to="/auth/login" onClick={() => setError('')}>Back to log in</Link></p>}
        {mode === 'signup' && <p className="sm">By signing up you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>}
      </form>
    </div>
  )
}
