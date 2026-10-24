// A parent signs in with the student's ID and the parent code the student made. Checks the CAPTCHA first, then asks the
// database (parent_login) to check the code, apply the try limits, log the attempt and open a 60 minute read-only session.
// Deploy:  supabase functions deploy parent-login
// Uses the same optional secrets as the contact form: CAPTCHA_SECRET, TURNSTILE_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkChallenge } from '../_shared/captcha.ts'
import { clientIp, hashIp, turnstileOk } from '../_shared/contact.ts'
import { corsHeaders, readJson, reply } from '../_shared/cors.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const SECRET = Deno.env.get('CAPTCHA_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TURNSTILE = Deno.env.get('TURNSTILE_SECRET') || undefined

/** "Chrome on Android": enough for the admin to tell visits apart, without keeping the full browser string. */
function deviceOf(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'unknown device'
  return `${browser} on ${os}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)
  const j = await readJson(req)
  const s = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : '')
  if (s('website')) return reply(req, { error: 'Those details do not match.' }, 401)   // hidden trap field: only bots fill it in

  const reg = s('reg').trim(), code = s('code').trim(), name = s('name').trim()
  if (!reg || reg.length > 30 || !code || code.length > 20) return reply(req, { error: 'Enter the student ID and the parent code.' }, 400)
  if (!name || name.length > 80) return reply(req, { error: 'Please enter your name.' }, 400)

  const ip = clientIp(req)
  if (TURNSTILE) {
    if (!(await turnstileOk(TURNSTILE, s('captchaToken'), ip, fetch))) return reply(req, { error: 'Please complete the check and try again.', captcha: true }, 400)
  } else {
    const r = await checkChallenge(SECRET, j.captchaToken, j.captchaAnswer)
    if (r === 'wrong') return reply(req, { error: 'That answer is not right. Try the new question.', captcha: true }, 400)
    if (r === 'expired') return reply(req, { error: 'That check has expired. Try the new question.', captcha: true }, 400)
    if (r === 'too_fast') return reply(req, { error: 'That was quick! Take a moment and try again.', captcha: true }, 400)
  }

  const { data, error } = await db.rpc('parent_login', {
    p_reg: reg, p_code: code, p_name: name, p_rel: s('relationship'),
    p_device: deviceOf(req.headers.get('user-agent') ?? ''), p_ip: ip ? await hashIp(ip, SECRET) : null,
  })
  if (error || !data) return reply(req, { error: 'Parent access is not available right now. Please try again later.' }, 500)
  if (data.ok) return reply(req, { ok: true, token: data.token, expires_at: data.expires_at })
  if (data.reason === 'locked') return reply(req, { error: 'Too many tries. Please wait 15 minutes and try again.', captcha: true }, 429)
  if (data.reason === 'name') return reply(req, { error: 'Please enter your name.' }, 400)
  // one message for every other reason, so nobody can tell whether a student ID exists
  return reply(req, { error: 'The student ID and code do not match, or the student has switched parent access off. Check both and try again.', captcha: true }, 401)
})
