// Gives a signed-in parent the read-only report for their student, or ends their session.
// Deploy:  supabase functions deploy parent-report
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, readJson, reply } from '../_shared/cors.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return reply(req, { error: 'Method not allowed' }, 405)
  const j = await readJson(req)
  const token = typeof j.token === 'string' ? j.token : ''
  if (!/^[0-9a-f]{64}$/.test(token)) return reply(req, { error: 'Your session has ended. Please sign in again.', ended: true }, 401)
  if (j.end) {
    await db.rpc('parent_end', { p_token: token })
    return reply(req, { ok: true })
  }
  const { data, error } = await db.rpc('parent_report', { p_token: token })
  if (error) return reply(req, { error: 'The report is not available right now. Please try again.' }, 500)
  if (!data) return reply(req, { error: 'Your session has ended. Please sign in again.', ended: true }, 401)
  return reply(req, { report: data })
})
