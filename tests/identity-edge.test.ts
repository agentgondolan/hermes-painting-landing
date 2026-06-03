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
  MGEVERYDAY_API_TOKEN: 'test_mge_token',
  MGEVERYDAY_BASE_URL: 'https://mge.test',
  MGEVERYDAY_BRAND_ID: '116',
}

test('requestMagicLink proxies preview ownership to the MGE internal magic-link API when email is sent upstream', async () => {
  let upstreamRequestUrl = ''
  let upstreamAuthorization = ''
  let upstreamIdempotencyKey = ''
  let upstreamBody: Record<string, unknown> | null = null
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: '11111111-1111-1111-1111-111111111111', continue_path: '/checkout?step=identity' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamRequestUrl = upstreamRequest.url
      upstreamAuthorization = upstreamRequest.headers.get('Authorization') || ''
      upstreamIdempotencyKey = upstreamRequest.headers.get('Idempotency-Key') || ''
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      return new Response(JSON.stringify({ ok: true, status: 'sent', expires_in_seconds: 1800 }), { status: 202 })
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; expiresInSeconds: number; magicLink?: string }
  assert.equal(payload.delivery, 'email_sent')
  assert.equal(payload.expiresInSeconds, 1800)
  assert.equal(payload.magicLink, undefined)

  assert.ok(upstreamRequestUrl)
  assert.equal(upstreamRequestUrl, 'https://mge.test/api/internal/v1/identity/magic-link/request/')
  assert.equal(upstreamAuthorization, 'Bearer test_mge_token')
  assert.ok(upstreamIdempotencyKey.startsWith('magic-link-'))
  assert.deepEqual(upstreamBody, {
    brand_id: 64,
    email: 'buyer@example.com',
    preview_id: '11111111-1111-1111-1111-111111111111',
    continue_path: '/checkout?step=identity',
  })
})

test('repeated magic-link requests generate fresh upstream idempotency keys', async () => {
  const idempotencyKeys: string[] = []

  const sendRequest = () => requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: '11111111-1111-1111-1111-111111111111', continue_path: '/checkout?step=identity' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      idempotencyKeys.push(upstreamRequest.headers.get('Idempotency-Key') || '')
      return new Response(JSON.stringify({ ok: true, status: 'sent', expires_in_seconds: 1800 }), { status: 202 })
    },
  )

  await sendRequest()
  await sendRequest()

  assert.equal(idempotencyKeys.length, 2)
  assert.ok(idempotencyKeys[0].startsWith('magic-link-'))
  assert.ok(idempotencyKeys[1].startsWith('magic-link-'))
  assert.notEqual(idempotencyKeys[0], idempotencyKeys[1])
})

test('accepted MGE magic-link requests return and verify a local fallback link', async () => {
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: 'preview_accepted', continue_path: '/?size=40x50' }),
    }),
    env,
    async () => new Response(JSON.stringify({ ok: true, status: 'accepted', expires_in_seconds: 1800 }), { status: 202 }),
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; magicLink?: string }
  assert.equal(payload.delivery, 'accepted')
  assert.ok(payload.magicLink)

  const magicToken = new URL(payload.magicLink).searchParams.get('magic_token')
  assert.ok(magicToken)

  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ detail: 'Unknown MGE token' }), { status: 400 })) as typeof fetch
    const verified = await verifyMagicLinkRequest(
      new Request('https://dottingo.test/api/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: magicToken }),
      }),
      env,
    )

    assert.equal(verified.status, 200)
    const verifiedPayload = await verified.json() as { email: string; previewId: string; identityToken: string }
    assert.equal(verifiedPayload.email, 'buyer@example.com')
    assert.equal(verifiedPayload.previewId, 'preview_accepted')
    const session = await verifyIdentitySessionToken(verifiedPayload.identityToken, env)
    assert.equal(session.email, 'buyer@example.com')
    assert.equal(session.previewId, 'preview_accepted')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('verifyMagicLinkRequest consumes the MGE token and creates a preview-scoped checkout identity session', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof request === 'string' || request instanceof URL ? request.toString() : request.url
      assert.equal(url, 'https://mge.test/api/internal/v1/identity/magic-link/verify/')
      assert.equal(init?.method, 'POST')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test_mge_token')
      assert.deepEqual(JSON.parse(String(init?.body)), { brand_id: 64, token: 'mge-token-123' })
      return new Response(JSON.stringify({
        ok: true,
        email: 'buyer@example.com',
        preview_id: '11111111-1111-1111-1111-111111111111',
        identity_token: 'opaque-mge-identity-token',
        continue_path: '/checkout',
        expires_in_seconds: 1800,
      }))
    }) as typeof fetch

    const verified = await verifyMagicLinkRequest(
      new Request('https://dottingo.test/api/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'mge-token-123' }),
      }),
      env,
    )

    assert.equal(verified.status, 200)
    const payload = await verified.json() as { email: string; previewId: string; identityToken: string }
    assert.equal(payload.email, 'buyer@example.com')
    assert.equal(payload.previewId, '11111111-1111-1111-1111-111111111111')

    const session = await verifyIdentitySessionToken(payload.identityToken, env)
    assert.equal(session.email, 'buyer@example.com')
    assert.equal(session.previewId, '11111111-1111-1111-1111-111111111111')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('identity session tokens are preview scoped', async () => {
  const token = await createIdentitySessionToken({ email: 'buyer@example.com', previewId: 'preview_123' }, env)
  const identity = await verifyIdentitySessionToken(token, env)
  assert.equal(identity.previewId, 'preview_123')
})
