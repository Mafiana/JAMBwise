// The logic behind the public contact form. A visitor who is not signed in cannot write to the database
// directly (the database refuses), so their message arrives here, passes a CAPTCHA, and is saved with the service role.
// Kept free of Deno-only code so it can be tested; index.ts supplies the real database and settings.
import { corsHeaders, readJson, reply } from './cors.ts'
import { checkChallenge, makeChallenge } from './captcha.ts'

export type ContactDeps = {
  secret: string                     // signs the built-in CAPTCHA
  turnstileSecret?: string           // set this to use Cloudflare Turnstile instead of the built-in CAPTCHA
  insert: (row: Record<string, unknown>) => Promise<{ message?: string } | null>   // returns an error or null
  fetch?: typeof fetch
  now?: () => number
}

const TOPICS = ['general', 'payment', 'pin', 'bug', 'other']
const EMAIL = /^[^@\s]+@[^@\s]+$/

export async function hashIp(ip: string, salt: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + ip))
  return Array.from(new Uint8Array(d)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function clientIp(req: Request): string {
  return (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim()
}

export async function turnstileOk(secret: string, token: string, ip: string, f: typeof fetch): Promise<boolean> {
  if (!token) return false
  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)
  try {
    const r = await f('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    return Boolean((await r.json()).success)
  } catch {
    return false
  }
}

export async function handleChallenge(req: Request, deps: Pick<ContactDeps, 'secret' | 'now'>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)
  return reply(req, await makeChallenge(deps.secret, (deps.now ?? Date.now)()))
}

export async function handleSubmit(req: Request, deps: ContactDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)
  const j = await readJson(req)
  const s = (k: string) => (typeof j[k] === 'string' ? (j[k] as string) : '')

  if (s('website')) return reply(req, { ok: true })   // the hidden trap field: only bots fill it in, so pretend it worked

  const name = s('name').trim()
  const email = s('email').trim()
  const topic = s('topic') || 'general'
  const subject = s('subject').trim()
  const body = s('body').trim()
  if (!name || name.length > 100) return reply(req, { error: 'Please enter your name.' }, 400)
  if (!EMAIL.test(email) || email.length > 200) return reply(req, { error: 'Please enter a valid email address so we can reply.' }, 400)
  if (!TOPICS.includes(topic)) return reply(req, { error: 'Please choose what your message is about.' }, 400)
  if (subject.length > 120) return reply(req, { error: 'The subject is too long.' }, 400)
  if (body.length < 5 || body.length > 2000) return reply(req, { error: 'Your message must be between 5 and 2000 characters.' }, 400)
  if ((body.match(/https?:\/\//gi) || []).length > 2) return reply(req, { error: 'Please remove the extra links from your message.' }, 400)

  const ip = clientIp(req)
  const f = deps.fetch ?? fetch
  if (deps.turnstileSecret) {
    if (!(await turnstileOk(deps.turnstileSecret, s('captchaToken'), ip, f)))
      return reply(req, { error: 'Please complete the check and try again.', captcha: true }, 400)
  } else {
    const r = await checkChallenge(deps.secret, j.captchaToken, j.captchaAnswer, (deps.now ?? Date.now)())
    if (r === 'wrong') return reply(req, { error: 'That answer is not right. Try the new question.', captcha: true }, 400)
    if (r === 'expired') return reply(req, { error: 'That check has expired. Try the new question.', captcha: true }, 400)
    if (r === 'too_fast') return reply(req, { error: 'That was quick! Take a moment and try again.', captcha: true }, 400)
  }

  const row: Record<string, unknown> = { name, email, topic, body, user_id: null, abuse_key: ip ? await hashIp(ip, deps.secret) : null }
  if (subject) row.subject = subject
  const err = await deps.insert(row)
  if (err) {
    const m = String(err.message || '')
    if (m.startsWith('rate_limited:')) return reply(req, { error: m.slice('rate_limited:'.length).trim() }, 429)
    console.error('contact-submit insert failed:', m, (err as { code?: string }).code ?? '')   // shows in Supabase > Edge Functions > contact-submit > Logs
    return reply(req, { error: 'Your message could not be sent. Please try again in a few minutes.' }, 500)
  }
  return reply(req, { ok: true })
}
