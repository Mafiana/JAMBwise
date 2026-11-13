// When Google sign-in (or an emailed link) fails, Supabase sends the person back to the site with the reason in the web address
// (#error=...&error_description=...). Without this, the reason is lost and the person just sees the login page again.

const KEY = 'jw_auth_error'

/** The readable reason in a web address's hash or query string, or null when there is none. Pure, so it is tested. */
export function parseAuthError(hash = '', search = '') {
  const read = (s) => new URLSearchParams(String(s).replace(/^[#?]/, ''))
  const h = read(hash)
  const q = read(search)
  const description = h.get('error_description') || q.get('error_description')
  const code = h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error')
  if (!description && !code) return null
  return friendlyAuthError(String(description || code).replace(/\+/g, ' '), code)
}

/** Turns Supabase's wording into something a student or the owner can act on. */
export function friendlyAuthError(message, code = '') {
  const m = String(message || '')
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in is not switched on yet. Please use your email and password.'
  if (/database error saving new user/i.test(m)) return 'Google sign-in could not create your account. Please sign up with your email and password, or ask for help.'
  if (/access_denied/i.test(code || '') && /otp|expired|invalid/i.test(m + ' ' + code)) return 'That link has expired or was already used. Please request a new one.'
  if (/otp_expired|expired|invalid/i.test(m + ' ' + code) && /link/i.test(m)) return 'That link has expired or was already used. Please request a new one.'
  if (/access_denied/i.test(code || '') || /denied|cancel/i.test(m)) return 'Google sign-in was cancelled. You can try again, or use your email and password.'
  if (/unable to exchange external code|exchange/i.test(m)) return 'Google sign-in could not be completed. Please try again, or use your email and password.'
  return 'Sign-in did not work: ' + m.slice(0, 200)
}

/** Call once at start-up, before the app draws: keeps the reason for the login page and cleans the web address. */
export function captureAuthError() {
  try {
    const msg = parseAuthError(window.location.hash, window.location.search)
    if (!msg) return
    sessionStorage.setItem(KEY, msg)
    window.history.replaceState(null, '', window.location.pathname)
  } catch { /* nothing to keep */ }
}

/** The kept reason (once), for the login page to show. */
export function takeAuthError() {
  try {
    const msg = sessionStorage.getItem(KEY)
    if (msg) sessionStorage.removeItem(KEY)
    return msg || ''
  } catch { return '' }
}
