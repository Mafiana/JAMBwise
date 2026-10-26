import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { ErrorLine, Loader, Logo, ThemeToggle } from '../components/ui.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import InstLogo from '../components/InstLogo.jsx'
import { useAction } from '../hooks.js'
import { supabase } from '../lib/supabase.js'
import * as api from '../lib/api.js'

/** /institution/<school>: the login page for one institution. Its students, teachers, proprietors and officials sign in here. */
export default function Institution() {
  const { slug } = useParams()
  const { session, profile, signIn, signOut } = useAuth()
  const { busy, error, setError, run } = useAction()
  const [inst, setInst] = useState(undefined)   // undefined = loading, null = no such institution
  const [builtIn, setBuiltIn] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [f, setF] = useState({ email: '', password: '' })
  const [dest, setDest] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    let alive = true
    setInst(undefined)
    api.getInstitution({ slug })
      .then((r) => { if (alive) { setBuiltIn(r.builtIn); setInst(r.inst) } })
      .catch((e) => { if (alive) { setLoadError(e.message); setInst(null) } })
    return () => { alive = false }
  }, [slug])

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const email = f.email.trim().toLowerCase()
      if (!email.includes('@')) throw new Error('Enter a valid email address.')
      if (builtIn || !inst.id) throw new Error('Institution logins are not switched on yet. Ask the JAMBwise admin to run migrate-institutions.sql.')
      await signIn(email, f.password)
      const { data } = await supabase.auth.getSession()
      const me = await api.getProfile(data.session.user.id)
      if (me.institution_id !== inst.id) {
        await signOut()
        throw new Error(me.is_admin
          ? `Admins sign in on the main log in page. This page is for ${inst.name} students and staff.`
          : `This account is not linked to ${inst.name}. Check the institution you chose, or ask the school to have you added.`)
      }
      setDest(me.is_teacher || me.is_admin ? '/app/admin/students' : '/app/dashboard')
    })
  }

  if (inst === undefined) return <div className="auth-page"><Loader label="Loading…" /></div>
  if (!inst) {
    return (
      <div className="auth-page">
        <div className="card auth c">
          <Logo />
          <h2>Institution not found</h2>
          <ErrorLine>{loadError}</ErrorLine>
          <p className="mut">We could not find that institution. Choose yours from the list on the home page.</p>
          <Link className="btn" to="/#institutions">Back to the list</Link>
        </div>
      </div>
    )
  }

  const member = session && profile && inst.id && profile.institution_id === inst.id
  if (dest && session) return <Navigate to={dest} replace />
  if (member) return <Navigate to={profile.is_teacher || profile.is_admin ? '/app/admin/students' : '/app/dashboard'} replace />

  return (
    <div className="auth-page">
      <form className="card auth inst-login" onSubmit={submit} noValidate aria-label={`${inst.name} login`}>
        <div className="inst-top"><Logo /><ThemeToggle /></div>
        <div className="inst-head">
          <InstLogo inst={inst} size={56} />
          <div>
            <h2>{inst.name}</h2>
            <span className="sm">{inst.location}</span>
          </div>
        </div>
        {inst.note && <p className="sm inst-note">{inst.note}</p>}
        <p className="mut">Log in to see your students' results, or your own results if you are a student here.</p>
        {session && profile && (
          <p className="notice" role="status">You are signed in as <b>{profile.full_name}</b>, who is not linked to {inst.name}. <button type="button" className="linkish" onClick={signOut}>Log out</button> to use another account.</p>
        )}
        <label htmlFor="il-em" className="sm">Email</label>
        <input id="il-em" type="email" value={f.email} onChange={set('email')} placeholder="Email" autoComplete="email" />
        <label htmlFor="il-pw" className="sm">Password</label>
        <PasswordInput id="il-pw" value={f.password} onChange={set('password')} placeholder="Password" autoComplete="current-password" />
        <ErrorLine>{error}</ErrorLine>
        <button className="btn w" disabled={busy || !f.email || !f.password}>{busy ? 'Please wait…' : `Log in to ${inst.name}`}</button>
        <p className="mut"><Link to="/auth/forgot" onClick={() => setError('')}>Forgot password?</Link> &nbsp; <Link to="/#institutions">Choose a different institution</Link></p>
      </form>
    </div>
  )
}
