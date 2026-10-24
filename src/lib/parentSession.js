// A parent's sign-in lives in this tab only (sessionStorage): closing the tab signs them out, and nothing is kept on the device afterwards.
const KEY = 'jw_parent'

export function getParentSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY))
    return s && s.token && new Date(s.expires_at) > new Date() ? s : null
  } catch { return null }
}
export function setParentSession(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: the page keeps it in memory */ } }
export function clearParentSession() { try { sessionStorage.removeItem(KEY) } catch { /* ignore */ } }
