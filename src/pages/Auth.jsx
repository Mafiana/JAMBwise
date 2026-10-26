import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorLine, Logo } from '../components/ui.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import ResetHelp from '../components/ResetHelp.jsx'
import { useAction } from '../hooks.js'
import { demoMode } from '../lib/supabase.js'
import { DEMO_ADMIN, DEMO_STUDENT, DEMO_TEACHER } from '../lib/demo/accounts.js'

const MIN_PASSWORD = 8

/** The multi-colour Google "G", as Google's sign-in branding asks. */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z" />
      <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
    </svg>
  )
}

export default function Auth() {
  const { mode = 'login' } = useParams()
  const { session, recovering, signIn, signUp, signInWithGoogle, sendReset, setPassword } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { busy, error, setError, run } = useAction()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [notice, setNotice] = useState('')
  const [sentAt, setSentAt] = useState(null) // when a reset link was last requested (starts the 2-minute wait)
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
        setSentAt(Date.now())
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
              <button type="button" className="btn ghost sm" onClick={() => { setDest('/app/admin'); run(() => signIn(DEMO_TEACHER.email, DEMO_TEACHER.password)) }}>Teacher</button>
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
            <PasswordInput id="pw" value={f.password} onChange={set('password')} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </>
        )}
        <ErrorLine>{error}</ErrorLine>
        {notice && <p className="notice" role="status">{notice}</p>}
        {mode === 'forgot' && <ResetHelp startedAt={sentAt} />}
        <button className="btn w" disabled={busy}>{busy ? 'Please wait…' : (mode === 'forgot' && sentAt ? 'Send the link again' : button[mode]) || button.login}</button>
        {(mode === 'login' || mode === 'signup') && (
          <>
            <div className="or-line"><span>or</span></div>
            <button type="button" className="btn ghost w gbtn" disabled={busy} onClick={() => run(signInWithGoogle)}>
              <GoogleG /> {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
            </button>
          </>
        )}
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
