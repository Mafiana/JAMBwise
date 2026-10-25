// Gives the contact form a CAPTCHA question to show. Deploy:  supabase functions deploy contact-challenge
// (Not needed if you use Cloudflare Turnstile; see README.)
import { handleChallenge } from '../_shared/contact.ts'

Deno.serve((req) =>
  handleChallenge(req, { secret: Deno.env.get('CAPTCHA_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! }),
)
