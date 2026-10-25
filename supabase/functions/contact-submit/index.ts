// Receives contact-form messages from visitors who are not signed in. Checks the CAPTCHA, then saves the message.
// Deploy:  supabase functions deploy contact-submit
// Optional secrets:  CAPTCHA_SECRET (any long random text)   TURNSTILE_SECRET (to use Cloudflare Turnstile)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleSubmit } from '../_shared/contact.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

Deno.serve((req) =>
  handleSubmit(req, {
    secret: Deno.env.get('CAPTCHA_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    turnstileSecret: Deno.env.get('TURNSTILE_SECRET') || undefined,
    insert: async (row) => (await db.from('messages').insert(row)).error,
  }),
)
