// Lets an ADMIN set a new password for a student or teacher (not for another admin).
// Deploy:  supabase functions deploy admin-set-password
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, readJson, reply } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return reply(req, { error: 'Please log in first.' }, 401)
  const { data: me } = await db.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return reply(req, { error: 'Not allowed' }, 403)

  const { target, password } = await readJson(req)
  if (typeof target !== 'string' || !/^[0-9a-f-]{36}$/i.test(target)) return reply(req, { error: 'Bad request.' }, 400)
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) return reply(req, { error: 'The password must be 8 to 72 characters.' }, 400)
  const { data: t } = await db.from('profiles').select('reg_number, is_admin').eq('id', target).single()
  if (!t) return reply(req, { error: 'Account not found.' }, 404)
  if (t.is_admin && target !== user.id) return reply(req, { error: 'You cannot change another admin’s password.' }, 403)
  const { error } = await db.auth.admin.updateUserById(target, { password })
  if (error) return reply(req, { error: 'Could not change the password.' }, 500)
  await db.from('audit_log').insert({ actor: user.id, actor_email: user.email, action: 'password.reset', detail: t.reg_number })
  return reply(req, { ok: true })
})
