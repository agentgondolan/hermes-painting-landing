import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createIdentitySessionToken,
  requestMagicLink,
  verifyIdentitySessionToken,
  verifyMagicLinkRequest,
  type IdentityEnv,
} from '../lib/identity/edge.ts'

const env: IdentityEnv = {
  MAGIC_LINK_SECRET: 'test_magic_link_secret_minimum_24_chars',
  ALLOWED_ORIGIN: '*',
  APP_BASE_URL: 'https://dottingo.test',
}

test('requestMagicLink creates a preview-scoped fallback link when email is not configured', async () => {
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: 'preview_123' }),
    }),
    env,
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; magicLink: string }
  assert.equal(payload.delivery, 'email_not_configured')
  assert.match(payload.magicLink, /^https:\/\/dottingo\.test\/?\?magic_token=/)
})

test('verifyMagicLinkRequest exchanges a magic link for a checkout identity session', async () => {
  const requested = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@example.com', preview_id: 'preview_123' }),
    }),
    env,
  )
  const requestedPayload = await requested.json() as { magicLink: string }
  const token = new URL(requestedPayload.magicLink).searchParams.get('magic_token')
  assert.ok(token)

  const verified = await verifyMagicLinkRequest(
    new Request('https://dottingo.test/api/identity/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
    env,
  )

  assert.equal(verified.status, 200)
  const payload = await verified.json() as { email: string; previewId: string; identityToken: string }
  assert.equal(payload.email, 'buyer@example.com')
  assert.equal(payload.previewId, 'preview_123')

  const session = await verifyIdentitySessionToken(payload.identityToken, env)
  assert.equal(session.email, 'buyer@example.com')
  assert.equal(session.previewId, 'preview_123')
})

test('identity session tokens are preview scoped', async () => {
  const token = await createIdentitySessionToken({ email: 'buyer@example.com', previewId: 'preview_123' }, env)
  const identity = await verifyIdentitySessionToken(token, env)
  assert.equal(identity.previewId, 'preview_123')
})
