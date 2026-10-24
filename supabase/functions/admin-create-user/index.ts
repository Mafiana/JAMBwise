// Lets an ADMIN create a student or teacher account (with a password they choose or generate).
// Deploy:  supabase functions deploy admin-create-user
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, readJson, reply } from '../_shared/cors.ts'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return reply(req, { error: 'Please log in first.' }, 401)
  const { data: me } = await db.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return reply(req, { error: 'Not allowed' }, 403)

  const b = await readJson(req)
  const email = String(b.email ?? '').trim().toLowerCase()
  const password = String(b.password ?? '')
  const name = String(b.name ?? '').trim().slice(0, 100)
  const role = b.role === 'teacher' ? 'teacher' : 'student'
  const plan = ['free', 'student', 'pro'].includes(b.plan) ? b.plan : 'free'
  const days = Math.max(1, Math.min(Number(b.days) || 30, 3650))
  if (!name) return reply(req, { error: 'Enter a full name.' }, 400)
  if (!EMAIL.test(email) || email.length > 200 || email.endsWith('@pin.jambwise.ng')) return reply(req, { error: 'Enter a valid email address.' }, 400)
  if (password.length < 8 || password.length > 72) return reply(req, { error: 'The password must be 8 to 72 characters.' }, 400)

  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })
  if (error || !created?.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? '')
    return reply(req, { error: taken ? 'An account with this email already exists.' : 'Could not create the account.' }, taken ? 409 : 500)
  }
  // the profile row is made by a database trigger; now fill in the rest
  const patch: Record<string, unknown> = { full_name: name, course: String(b.course ?? '').slice(0, 100) || null, school: String(b.school ?? '').slice(0, 100) || null }
  if (role === 'teacher') patch.is_teacher = true
  else if (plan !== 'free') { patch.plan = plan; patch.plan_expires = new Date(Date.now() + days * 864e5).toISOString() }
  await db.from('profiles').update(patch).eq('id', created.user.id)
  const { data: p } = await db.from('profiles').select('reg_number').eq('id', created.user.id).single()
  await db.from('audit_log').insert({ actor: user.id, actor_email: user.email, action: role + '.create', detail: p?.reg_number ?? email })
  return reply(req, { ok: true, id: created.user.id, reg_number: p?.reg_number ?? null })
})
