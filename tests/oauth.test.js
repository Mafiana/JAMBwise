import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAuthError, friendlyAuthError } from '../src/lib/oauthError.js'

test('no error in the address means nothing to show', () => {
  assert.equal(parseAuthError('', ''), null)
  assert.equal(parseAuthError('#access_token=abc&type=recovery', '?ref=friend'), null)
})

test('reads the reason from the hash (implicit flow) and from the query string (PKCE flow)', () => {
  assert.match(parseAuthError('#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user', ''), /could not create your account/)
  assert.match(parseAuthError('', '?error=access_denied&error_description=User+denied+access'), /cancelled/)
})

test('a provider that is switched off, and an expired email link, get plain advice', () => {
  assert.match(friendlyAuthError('Unsupported provider: provider is not enabled'), /not switched on/)
  assert.match(parseAuthError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', ''), /expired/)
})

test('an unknown reason is still shown, shortened', () => {
  const msg = friendlyAuthError('x'.repeat(500))
  assert.ok(msg.startsWith('Sign-in did not work: '))
  assert.ok(msg.length < 260)
})
