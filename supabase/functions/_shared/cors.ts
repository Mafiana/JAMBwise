// Shared helpers for all Edge Functions.
// ALLOWED_ORIGINS is a comma-separated list, e.g. "https://jambwise.netlify.app,http://localhost:5173".
// (SITE_URL is accepted as a fallback.) Only these origins get CORS access.

export function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? Deno.env.get('SITE_URL') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

export function corsHeaders(req: Request): Record<string, string> {
  const list = allowedOrigins()
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : (list[0] ?? ''),
    // x-client-info and apikey are sent by supabase-js on every call
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function reply(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json()
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}
