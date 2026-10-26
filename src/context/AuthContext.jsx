import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import * as api from '../lib/api.js'
import { normalizePin, planLevel, effectivePlan } from '../lib/utils.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [booting, setBooting] = useState(true) // waiting for the saved session
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [recovering, setRecovering] = useState(false) // arrived from a password-reset email
  const [institution, setInstitution] = useState(null) // the school this person belongs to, if any

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Keep this callback synchronous: calling Supabase from inside it can deadlock.
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') { setProfile(null); setRecovering(false) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const uid = session?.user?.id
  const loadProfile = useCallback(async () => {
    if (!uid) return null
    setProfileLoading(true)
    setProfileError('')
    try {
      const p = await api.getProfile(uid)
      setProfile(p)
      return p
    } catch (e) {
      setProfileError(e.message)
      return null
    } finally {
      setProfileLoading(false)
    }
  }, [uid])

  useEffect(() => {
    if (uid) loadProfile()
    else setProfile(null)
  }, [uid, loadProfile])

  // record the sign-in in the activity log (the server skips repeats within 30 minutes; this tab asks once per sign-in)
  const profileId = profile?.id
  useEffect(() => {
    if (!profileId) return
    const key = 'jw_logged:' + profileId
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1') } catch { /* private mode: it may ask again, the server de-duplicates */ }
    Promise.resolve(supabase.rpc('log_sign_in')).catch(() => {})   // never block anything on the log
  }, [profileId])

  // presence: tell the server once a minute that this person is here (only while the tab is visible), for Admin > Online
  useEffect(() => {
    if (!profileId) return undefined
    const beat = () => { if (document.visibilityState === 'visible') api.touchPresence() }
    beat()
    const t = setInterval(beat, 60000)
    document.addEventListener('visibilitychange', beat)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat) }
  }, [profileId])

  // the institution (school) this person was assigned to, for the panel heading and the sidebar
  const instId = profile?.institution_id || null
  useEffect(() => {
    let alive = true
    if (!instId) { setInstitution(null); return undefined }
    api.getInstitution({ id: instId }).then(({ inst }) => { if (alive) setInstitution(inst) }).catch(() => {})
    return () => { alive = false }
  }, [instId])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    booting,
    profileLoading,
    profileError,
    recovering,
    institution,
    plan: effectivePlan(profile),
    level: planLevel(profile),
    isAdmin: Boolean(profile?.is_admin),
    isTeacher: Boolean(profile?.is_teacher && !profile?.is_admin),
    isStaff: Boolean(profile?.is_admin || profile?.is_teacher),
    refreshProfile: loadProfile,
    async saveProfile(patch) {
      const p = await api.updateProfile(uid, patch)
      setProfile(p)
      return p
    },
    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin + '/app/dashboard' },
      })
      if (error) throw new Error(error.message)
      // With "Confirm email" switched on in Supabase there is no session until the link is clicked.
      return { needsConfirm: !data.session }
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
      // a teacher signing in rings the admins' bell (the server ignores anyone who is not a teacher)
      try { await supabase.rpc('teacher_signed_in') } catch { /* never block a login on a notification */ }
    },
    /** Google sign-in. On a real project this leaves the page for Google and comes back signed in; the new-user trigger makes the profile. */
    async signInWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/app/dashboard', queryParams: { prompt: 'select_account' } },
      })
      if (error) throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message) ? 'Google sign-in is not switched on yet. Please use your email and password.' : error.message)
    },
    async signInWithPin(raw) {
      const pin = normalizePin(raw)
      if (!pin) throw new Error('Enter the 8 letters and numbers of your PIN.')
      const { email } = await api.activatePin(pin)
      const { error } = await supabase.auth.signInWithPassword({ email, password: pin })
      if (error) throw new Error('This PIN has been used and its password was changed. Log in with your email (shown in Settings) and your new password, or ask your tutor for help.')
    },
    async sendReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/reset' })
      if (error) throw new Error(error.message)
    },
    async setPassword(password) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
      setRecovering(false)
    },
    async signOut() {
      try { if (uid) sessionStorage.removeItem('jw_logged:' + uid) } catch { /* ignore */ }
      api.clearLocalStudentData()
      await supabase.auth.signOut()
    },
  }), [session, profile, booting, profileLoading, profileError, recovering, institution, uid, loadProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
