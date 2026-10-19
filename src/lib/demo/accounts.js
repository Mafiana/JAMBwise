// Small, shared bits of demo mode. Kept separate from client.js so the big demo backend
// (and its question bank) is only downloaded when demo mode is actually running.
export const DEMO_ADMIN = { email: 'admin@demo.com', password: 'demo1234' }
export const DEMO_STUDENT = { email: 'student@demo.com', password: 'demo1234' }
export const DEMO_PIN = 'DEMO-2345'
export const DB_KEY = 'jw_demo_db'
export const SESSION_KEY = 'jw_demo_session'

/** Forget everything the demo saved. The next page load starts again from the sample data. */
export function resetDemo() {
  try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}
