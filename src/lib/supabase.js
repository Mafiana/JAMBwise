// Picks the backend at start-up:
//   .env filled in  -> the real Supabase project
//   .env empty      -> demo mode: a built-in, browser-only stand-in so you can try every screen
//                      (including /app/admin) before Supabase and Paystack are set up.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when .env has real Supabase values. */
export const configured = Boolean(url && key && !String(url).includes('YOUR_REF') && !String(key).startsWith('your-'))

// Live bindings: they are filled in by initBackend() before the app first renders.
export let supabase = null
export let demoMode = false

export async function initBackend() {
  if (configured) {
    const { createClient } = await import('@supabase/supabase-js')
    supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  } else {
    supabase = (await import('./demo/client.js')).demoClient
    demoMode = true
  }
}
