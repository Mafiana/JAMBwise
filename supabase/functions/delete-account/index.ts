// Lets a signed-in student delete their own account and data. Payment records are kept for accounting.
// Deploy:  supabase functions deploy delete-account
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

  const { confirm } = await readJson(req)
  if (confirm !== 'DELETE') return reply(req, { error: 'Type DELETE to confirm.' }, 400)

  const { error } = await db.auth.admin.deleteUser(user.id)
  if (error) return reply(req, { error: 'Could not delete the account.' }, 500)
  return reply(req, { ok: true })
})
