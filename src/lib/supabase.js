// Picks the backend at start-up:
//   .env filled in  -> the real Supabase project
//   .env empty      -> demo mode: a built-in, browser-only stand-in so you can try every screen
//                      (including /app/admin) before Supabase and Paystack are set up.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when .env has real Supabase values. */
export const configured = Boolean(url && key && !String(url).includes('YOUR_REF') && !String(key).startsWith('your-'))

/** A real (production) build that was given no Supabase settings must not quietly fall back to the demo (it shows public demo logins). Set VITE_ALLOW_DEMO=1 to allow a public demo on purpose. */
export const setupMissing = !configured && Boolean(import.meta.env.PROD) && import.meta.env.VITE_ALLOW_DEMO !== '1'

// Live bindings: they are filled in by initBackend() before the app first renders.
export let supabase = null
export let demoMode = false

export async function initBackend() {
  if (setupMissing) return   // main.jsx shows a "not set up" page instead
  if (configured) {
    const { createClient } = await import('@supabase/supabase-js')
    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  } else {
    supabase = (await import('./demo/client.js')).demoClient
    demoMode = true
  }
}
