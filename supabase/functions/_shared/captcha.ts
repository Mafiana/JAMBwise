// A small, self-hosted CAPTCHA: a spelled-out sum that is signed with a secret, so the server can check the answer
// later without storing anything. Used by the contact form when Cloudflare Turnstile is not configured.
// A challenge is valid for 10 minutes, and an answer sent within 3 seconds is refused (people cannot read that fast).

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const enc = new TextEncoder()
export const MAX_AGE_MS = 10 * 60 * 1000
export const MIN_AGE_MS = 3 * 1000

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))))
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const pick = (n: number): number => crypto.getRandomValues(new Uint32Array(1))[0] % n

export async function makeChallenge(secret: string, now = Date.now()): Promise<{ question: string; token: string }> {
  let a = 2 + pick(8)
  let b = 1 + pick(6)
  const kind = pick(3)
  let answer: number
  let question: string
  if (kind === 0) { answer = a + b; question = `What is ${WORDS[a]} plus ${WORDS[b]}?` }
  else if (kind === 1) { if (b > a) [a, b] = [b, a]; answer = a - b; question = `What is ${WORDS[a]} minus ${WORDS[b]}?` }
  else { a = 2 + pick(4); b = 2 + pick(3); answer = a * b; question = `What is ${WORDS[a]} times ${WORDS[b]}?` }
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(9)))
  const payload = `${now}.${nonce}`
  return { question, token: `${payload}.${await sign(secret, `${payload}.${answer}`)}` }
}

export type CheckResult = 'ok' | 'wrong' | 'expired' | 'too_fast'

export async function checkChallenge(secret: string, token: unknown, answer: unknown, now = Date.now()): Promise<CheckResult> {
  const parts = String(token ?? '').split('.')
  if (parts.length !== 3) return 'wrong'
  const [issued, nonce, sig] = parts
  const at = Number(issued)
  if (!Number.isFinite(at)) return 'wrong'
  const given = String(answer ?? '').trim()
  if (!/^-?\d{1,3}$/.test(given)) return 'wrong'
  const expected = await sign(secret, `${issued}.${nonce}.${Number(given)}`)
  if (!same(expected, sig)) return 'wrong'
  if (now - at > MAX_AGE_MS) return 'expired'
  if (now - at < MIN_AGE_MS) return 'too_fast'
  return 'ok'
}
