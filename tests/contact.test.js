// Tests for the contact-form Edge Function logic (CAPTCHA + validation + spam limits). The functions are TypeScript,
// which needs Node 22.18 or newer; on older Node these tests are skipped instead of failing.
import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.Deno ??= { env: { get: (k) => (k === 'ALLOWED_ORIGINS' ? 'https://example.test' : undefined) } }
let cap, contact
try {
  cap = await import('../supabase/functions/_shared/captcha.ts')
  contact = await import('../supabase/functions/_shared/contact.ts')
} catch { /* old Node */ }
const t = cap ? test : test.skip

const SECRET = 'test-secret'
const NOW = 1_700_000_000_000
const post = (body, headers = {}) => new Request('https://x.test/contact-submit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const solve = (q) => {
  const W = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  const m = q.match(/is (\w+) (plus|minus|times) (\w+)\?/)
  const a = W.indexOf(m[1]); const b = W.indexOf(m[3])
  return m[2] === 'plus' ? a + b : m[2] === 'minus' ? a - b : a * b
}
const good = { name: 'Ada', email: 'ada@example.com', topic: 'pin', body: 'My PIN does not work please help' }

t('challenge: right answer passes after 3 seconds', async () => {
  const { question, token } = await cap.makeChallenge(SECRET, NOW)
  assert.equal(await cap.checkChallenge(SECRET, token, String(solve(question)), NOW + 5000), 'ok')
})
t('challenge: wrong answer, tampered token, other secret and garbage are refused', async () => {
  const { question, token } = await cap.makeChallenge(SECRET, NOW)
  const ans = solve(question)
  assert.equal(await cap.checkChallenge(SECRET, token, String(ans + 1), NOW + 5000), 'wrong')
  assert.equal(await cap.checkChallenge('other', token, String(ans), NOW + 5000), 'wrong')
  assert.equal(await cap.checkChallenge(SECRET, token.replace(String(NOW), String(NOW - 1)), String(ans), NOW + 5000), 'wrong')
  assert.equal(await cap.checkChallenge(SECRET, 'nonsense', String(ans), NOW + 5000), 'wrong')
  assert.equal(await cap.checkChallenge(SECRET, token, 'abc', NOW + 5000), 'wrong')
  assert.equal(await cap.checkChallenge(SECRET, undefined, undefined, NOW + 5000), 'wrong')
})
t('challenge: too fast and too old', async () => {
  const { question, token } = await cap.makeChallenge(SECRET, NOW)
  const ans = String(solve(question))
  assert.equal(await cap.checkChallenge(SECRET, token, ans, NOW + 500), 'too_fast')
  assert.equal(await cap.checkChallenge(SECRET, token, ans, NOW + 11 * 60 * 1000), 'expired')
})
t('challenge: questions are always answerable (never negative) over many draws', async () => {
  for (let i = 0; i < 300; i++) {
    const { question } = await cap.makeChallenge(SECRET, NOW)
    const a = solve(question)
    assert.ok(Number.isInteger(a) && a >= 0 && a <= 100, question)
  }
})

async function submit(extra = {}, { rows = [], err = null, headers = {} } = {}) {
  const { question, token } = await cap.makeChallenge(SECRET, NOW)
  const deps = { secret: SECRET, now: () => NOW + 5000, insert: async (r) => { rows.push(r); return err } }
  const res = await contact.handleSubmit(post({ ...good, captchaToken: token, captchaAnswer: String(solve(question)), ...extra }, headers), deps)
  return { res, json: await res.json(), rows }
}

t('submit: a good message is saved with no user and a hashed address', async () => {
  const { res, json, rows } = await submit({}, { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })
  assert.equal(res.status, 200); assert.deepEqual(json, { ok: true })
  assert.equal(rows.length, 1); assert.equal(rows[0].user_id, null)
  assert.match(rows[0].abuse_key, /^[0-9a-f]{32}$/); assert.ok(!JSON.stringify(rows[0]).includes('1.2.3.4'))
})
t('submit: the same address always gives the same key, different addresses differ', async () => {
  const a = (await submit({}, { headers: { 'x-forwarded-for': '1.2.3.4' } })).rows[0].abuse_key
  const b = (await submit({}, { headers: { 'x-forwarded-for': '1.2.3.4' } })).rows[0].abuse_key
  const c = (await submit({}, { headers: { 'x-forwarded-for': '5.6.7.8' } })).rows[0].abuse_key
  assert.equal(a, b); assert.notEqual(a, c)
})
t('submit: no CAPTCHA, a wrong answer and a bad token are all refused and nothing is saved', async () => {
  const rows = []
  const deps = { secret: SECRET, now: () => NOW + 5000, insert: async (r) => { rows.push(r); return null } }
  for (const extra of [{}, { captchaToken: 'x.y.z', captchaAnswer: '5' }]) {
    const res = await contact.handleSubmit(post({ ...good, ...extra }), deps)
    assert.equal(res.status, 400); assert.equal((await res.json()).captcha, true)
  }
  assert.equal(rows.length, 0)
})
t('submit: the hidden trap field pretends success but saves nothing', async () => {
  const rows = []
  const res = await contact.handleSubmit(post({ ...good, website: 'http://spam' }), { secret: SECRET, insert: async (r) => { rows.push(r); return null } })
  assert.equal(res.status, 200); assert.equal(rows.length, 0)
})
t('submit: validation messages', async () => {
  for (const [extra, re] of [[{ name: ' ' }, /name/i], [{ email: 'nope' }, /email/i], [{ topic: 'question' }, /about/i], [{ body: 'hi' }, /between 5/], [{ body: 'a'.repeat(2001) }, /between 5/], [{ subject: 'x'.repeat(121) }, /subject/i], [{ body: 'see http://a.co http://b.co http://c.co' }, /links/i]]) {
    const { res, json, rows } = await submit(extra)
    assert.equal(res.status, 400, JSON.stringify(extra)); assert.match(json.error, re); assert.equal(rows.length, 0)
  }
})
t('submit: the database rate limit becomes a friendly 429, other failures a safe 500', async () => {
  let r = await submit({}, { err: { message: 'rate_limited: Too many messages from this email address. Please try again later.' } })
  assert.equal(r.res.status, 429); assert.equal(r.json.error, 'Too many messages from this email address. Please try again later.')
  r = await submit({}, { err: { message: 'permission denied for table messages (secret detail)' } })
  assert.equal(r.res.status, 500); assert.ok(!r.json.error.includes('secret detail'))
})
t('submit: with Turnstile configured the built-in CAPTCHA is not used and Cloudflare decides', async () => {
  const calls = []
  const mk = (ok) => async (url, init) => { calls.push([url, String(init.body)]); return new Response(JSON.stringify({ success: ok })) }
  const rows = []
  const deps = (ok) => ({ secret: SECRET, turnstileSecret: 'ts-secret', fetch: mk(ok), insert: async (r) => { rows.push(r); return null } })
  let res = await contact.handleSubmit(post({ ...good, captchaToken: 'tok' }, { 'cf-connecting-ip': '9.9.9.9' }), deps(true))
  assert.equal(res.status, 200); assert.equal(rows.length, 1)
  assert.match(calls[0][0], /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/); assert.match(calls[0][1], /secret=ts-secret/); assert.match(calls[0][1], /remoteip=9\.9\.9\.9/)
  res = await contact.handleSubmit(post({ ...good, captchaToken: 'tok' }), deps(false))
  assert.equal(res.status, 400); assert.equal(rows.length, 1)
  res = await contact.handleSubmit(post({ ...good }), deps(true))   // no token at all
  assert.equal(res.status, 400)
})
t('challenge endpoint returns a question and a token', async () => {
  const res = await contact.handleChallenge(post({}), { secret: SECRET, now: () => NOW })
  const j = await res.json(); assert.match(j.question, /^What is \w+ (plus|minus|times) \w+\?$/); assert.ok(j.token.split('.').length === 3)
})
