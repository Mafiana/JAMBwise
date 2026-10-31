// Creates a student's account the first time their Access PIN is used.
// The browser then signs in with signInWithPassword({ email, password: PIN }).
// Deploy:  supabase functions deploy pin-activate
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, readJson, reply } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)

  const { pin } = await readJson(req)
  const p = String(pin ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (p.length !== 8) return reply(req, { error: 'Invalid PIN' }, 400)
  const code = p.slice(0, 4) + '-' + p.slice(4)
  const email = p.toLowerCase() + '@pin.jambwise.ng'

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: row } = await db.from('access_pins').select('pin, used_by, used_at').eq('pin', code).maybeSingle()
  if (!row) return reply(req, { error: 'Invalid PIN' }, 400)

  // Already activated: just tell the browser which login to use. The PIN is the password,
  // so knowing the email alone gives nothing away.
  if (row.used_by || row.used_at) return reply(req, { email })

  // app_metadata.pin = true is what lets this account use the reserved PIN email domain
  // (a database trigger blocks everyone else). Clients cannot set app_metadata.
  // Some Supabase versions set app_metadata only after the row is inserted, which the guard trigger would reject,
  // so the email is also reserved for a moment (the trigger accepts a fresh reservation).
  await db.from('pin_reservations').delete().eq('email', email)
  await db.from('pin_reservations').insert({ email })
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: code,
    email_confirm: true,
    app_metadata: { pin: 'true' },
  })
  await db.from('pin_reservations').delete().eq('email', email)
  if (error || !created?.user) {
    console.error('pin-activate createUser failed:', error?.code, error?.status, error?.message)
    const m = String(error?.message ?? '')
    const why = /password/i.test(m) ? ' (the Supabase password rules reject the PIN: lower "Minimum password length" to 6 in Authentication → Providers → Email)'
      : /already|exists|registered/i.test(m) ? ' (an account for this PIN already exists but is not linked: delete the user ' + email + ' in Authentication → Users, then try again)'
      : /database error|trigger|profile/i.test(m) ? ' (a database trigger failed while creating the profile: check Logs → Postgres)'
      : ''
    return reply(req, { error: 'Could not activate this PIN. Ask your tutor for help.' + why + (m ? ' [' + m + ']' : '') }, 400)
  }

  // Plan, expiry and name are applied, and the PIN is marked used, in one database transaction.
  const { error: redeemErr } = await db.rpc('redeem_pin', { p_pin: code, p_user: created.user.id })
  if (redeemErr) {
    await db.auth.admin.deleteUser(created.user.id) // roll back so the PIN is not stranded
    return reply(req, { error: 'This PIN has just been used. Ask your tutor for help.' }, 409)
  }
  return reply(req, { email })
})
