import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorLine, Logo, Spinner } from '../components/ui.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { useAction } from '../hooks.js'
import { supabase } from '../lib/supabase.js'
import * as api from '../lib/api.js'

/** yoursite/admin: the Admin's own login. Teachers sign in from the home page (For institutions) and students from the normal login; anyone else is refused here. */
export default function AdminLogin() {
  const { session, profile, profileLoading, isAdmin, signIn, signOut } = useAuth()
  const { busy, error, run } = useAction()
  const [f, setF] = useState({ email: '', password: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  if (session && isAdmin) return <Navigate to="/app/admin" replace />
  if (session && (!profile || profileLoading)) return <Spinner />
  if (session && profile) {   // signed in as someone who is not the Admin: no access
    return (
      <div className="auth-page">
        <div className="card auth c">
          <Logo />
          <h2>Access denied</h2>
          <ErrorLine>This page is for the Admin only.</ErrorLine>
          <button className="btn w" onClick={signOut}>Log out</button>
          <p className="mut"><Link to="/">Back to the home page</Link></p>
        </div>
      </div>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const email = f.email.trim().toLowerCase()
      if (!email.includes('@')) throw new Error('Enter your email address.')
      if (!f.password) throw new Error('Enter your password.')
      await signIn(email, f.password)
      const { data } = await supabase.auth.getSession()
      const me = data.session ? await api.getProfile(data.session.user.id) : null
      if (!me?.is_admin) {   // right password, wrong door: sign them straight back out
        await signOut()
        throw new Error('This page is for the Admin only. Teachers log in from the home page, under "For institutions".')
      }
    })
  }
  return (
    <div className="auth-page">
      <form className="card auth" onSubmit={submit} noValidate>
        <Logo />
        <h2>Admin login</h2>
        <label htmlFor="ae" className="sm">Email</label>
        <input id="ae" type="email" value={f.email} onChange={set('email')} placeholder="Email" autoComplete="username" autoFocus />
        <label htmlFor="ap" className="sm">Password</label>
        <PasswordInput id="ap" value={f.password} onChange={set('password')} placeholder="Password" autoComplete="current-password" />
        <ErrorLine>{error}</ErrorLine>
        <button className="btn w" disabled={busy}>{busy ? 'Please wait…' : 'Log in'}</button>
        <p className="mut"><Link to="/auth/forgot">Forgot password?</Link></p>
      </form>
    </div>
  )
}
