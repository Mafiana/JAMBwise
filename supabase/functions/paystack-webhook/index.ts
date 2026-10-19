// Paystack calls this after a payment. Deploy with:  supabase functions deploy paystack-webhook --no-verify-jwt
// 1. checks Paystack's signature  2. asks Paystack to confirm the payment  3. compares amount and currency
// 4. grants 30 days inside one database transaction, so a repeated webhook can never grant twice.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

// constant-time string comparison
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY')!
  const body = await req.text()

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  if (!same(sig, req.headers.get('x-paystack-signature') ?? '')) return new Response('bad signature', { status: 401 })

  let ev: { event?: string; data?: { reference?: string } }
  try { ev = JSON.parse(body) } catch { return new Response('bad json', { status: 400 }) }
  if (ev.event !== 'charge.success' || !ev.data?.reference) return new Response('ignored')
  const ref = ev.data.reference

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: pay } = await db.from('payments').select('status').eq('reference', ref).maybeSingle()
  if (!pay || pay.status !== 'pending') return new Response('ok') // unknown or already handled

  const v = await (await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), {
    headers: { Authorization: 'Bearer ' + secret },
  })).json().catch(() => ({}))
  if (v?.data?.status !== 'success' || v.data.currency !== 'NGN') return new Response('not successful', { status: 400 })

  // fulfil_payment re-checks the amount against what we stored and flips pending to paid exactly once.
  const { error } = await db.rpc('fulfil_payment', { p_ref: ref, p_amount: v.data.amount })
  if (error) return new Response('error', { status: 500 }) // Paystack will retry
  return new Response('ok')
})
