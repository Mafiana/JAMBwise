// Lets an ADMIN delete a student's account and data (payment records are kept for accounting).
// Deploy:  supabase functions deploy admin-delete-user
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, readJson, reply } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return reply(req, { error: 'Please log in first.' }, 401)

  // the caller must be an admin (checked with the service role, never trusting anything the client sends)
  const { data: me } = await db.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!me?.is_admin) return reply(req, { error: 'Not allowed' }, 403)

  const { target } = await readJson(req)
  if (typeof target !== 'string' || !/^[0-9a-f-]{36}$/i.test(target)) return reply(req, { error: 'Bad request.' }, 400)
  if (target === user.id) return reply(req, { error: 'You cannot delete your own account here.' }, 400)

  const { data: t } = await db.from('profiles').select('reg_number').eq('id', target).single()
  const { error } = await db.auth.admin.deleteUser(target)
  if (error) return reply(req, { error: 'Could not delete the account.' }, 500)
  await db.from('audit_log').insert({ actor: user.id, actor_email: user.email, action: 'student.delete', detail: t?.reg_number ?? target })
  return reply(req, { ok: true })
})
