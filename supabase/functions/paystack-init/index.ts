// Starts a Paystack payment. The price always comes from the plans table (less any valid discount code), never from the browser.
// Deploy:  supabase functions deploy paystack-init
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { allowedOrigins, corsHeaders, readJson, reply } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return reply(req, { error: 'Please log in first.' }, 401)

  const { data: me } = await db.from('profiles').select('suspended').eq('id', user.id).maybeSingle()
  if (!me || me.suspended) return reply(req, { error: 'This account cannot make payments.' }, 403)

  const body = await readJson(req)
  const { data: plan } = await db.from('plans').select('id, price_kobo').eq('id', String(body.plan ?? '')).maybeSingle()
  if (!plan || !plan.price_kobo) return reply(req, { error: 'Unknown plan.' }, 400)

  // an optional discount code: the database works out the price, so the browser cannot choose it
  let amount: number = plan.price_kobo
  let couponId: number | null = null
  const code = String(body.coupon ?? '').trim()
  if (code) {
    const { data: q, error: qe } = await db.rpc('coupon_quote', { p_code: code, p_plan: plan.id })
    const row = Array.isArray(q) ? q[0] : q
    if (qe || !row) return reply(req, { error: 'Could not check that code. Please try again.' }, 400)
    if (!row.valid) return reply(req, { error: row.message }, 400)
    amount = row.final_kobo
    couponId = row.coupon_id
  }

  // Where Paystack sends the student back to. Only our own allowed origins are accepted.
  const list = allowedOrigins()
  const asked = String(body.origin ?? '').replace(/\/$/, '')
  const origin = list.includes(asked) ? asked : list[0]
  if (!origin) return reply(req, { error: 'Server is missing ALLOWED_ORIGINS.' }, 500)

  const psKey = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim().replace(/^Bearer\s+/i, '')
  if (!/^sk_(test|live)_\S+$/.test(psKey)) {
    return reply(req, { error: 'Payments are not set up yet: the Paystack secret key is missing or wrong on the server. The admin must set PAYSTACK_SECRET_KEY (it starts with sk_test_ or sk_live_).' }, 500)
  }

  const reference = 'JW' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const r = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + psKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      amount,
      currency: 'NGN',
      reference,
      callback_url: origin + '/app/billing',
      metadata: { user_id: user.id, plan: plan.id, coupon: couponId },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.status) return reply(req, { error: j.message ?? 'Payment provider error.' }, 502)

  const { error } = await db.from('payments').insert({
    reference, user_id: user.id, plan: plan.id, amount_kobo: amount,
    ...(couponId ? { coupon_id: couponId, discount_kobo: plan.price_kobo - amount } : {}),   // only touches the coupon columns when a code was used
  })
  if (error) return reply(req, { error: 'Could not record the payment.' }, 500)
  return reply(req, { url: j.data.authorization_url, reference })
})
