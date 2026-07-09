import assert from 'node:assert/strict'
import test from 'node:test'

import {
  attachIdentityPreview,
  createDevelopmentIdentitySession,
  createIdentitySessionToken,
  createIdentityProjectPreview,
  deleteIdentityPreview,
  deleteIdentityProject,
  getIdentityPreviews,
  getMagicLinkRequestStatus,
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

test('accepted MGE magic-link requests do not expose a fallback link to the browser', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: 'preview_accepted', continue_path: '/?size=40x50' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      calls.push({
        url: upstreamRequest.url,
        body: await upstreamRequest.json() as Record<string, unknown>,
      })
      return new Response(JSON.stringify({ ok: true, status: 'accepted', expires_in_seconds: 1800 }), { status: upstreamRequest.url.endsWith('/magic-link/request/') ? 202 : 200 })
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; magicLink?: string }
  assert.equal(payload.delivery, 'accepted')
  assert.equal(payload.magicLink, undefined)
  assert.deepEqual(calls.map((call) => call.url), [
    'https://mge.test/api/internal/v1/identity/magic-link/request/',
    'https://mge.test/api/internal/v1/identity/magic-link/status/',
  ])
  assert.deepEqual(calls[1].body, {
    brand_id: 64,
    email: 'buyer@example.com',
    preview_id: 'preview_accepted',
  })
})

test('requestMagicLink checks internal email status before reporting confirmed delivery', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []

  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: 'preview_status', continue_path: '/?size=40x50' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      calls.push({
        url: upstreamRequest.url,
        body: await upstreamRequest.json() as Record<string, unknown>,
      })

      if (upstreamRequest.url.endsWith('/magic-link/request/')) {
        return new Response(JSON.stringify({ ok: true, status: 'accepted', request_id: 'ml_123', expires_in_seconds: 1800 }), { status: 202 })
      }

      return new Response(JSON.stringify({ ok: true, status: 'sent' }), { status: 200 })
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; emailStatus?: string; magicLink?: string }
  assert.equal(payload.delivery, 'email_sent')
  assert.equal(payload.emailStatus, 'sent')
  assert.equal(payload.magicLink, undefined)

  assert.deepEqual(calls.map((call) => call.url), [
    'https://mge.test/api/internal/v1/identity/magic-link/request/',
    'https://mge.test/api/internal/v1/identity/magic-link/status/',
  ])
  assert.deepEqual(calls[1].body, {
    brand_id: 64,
    email: 'buyer@example.com',
    preview_id: 'preview_status',
    request_id: 'ml_123',
  })
})

test('requestMagicLink keeps delivery unconfirmed when internal email status is not sent yet', async () => {
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: 'preview_status_pending', continue_path: '/?size=40x50' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      if (upstreamRequest.url.endsWith('/magic-link/request/')) {
        return new Response(JSON.stringify({ ok: true, status: 'accepted', request_id: 'ml_queued', expires_in_seconds: 1800 }), { status: 202 })
      }
      return new Response(JSON.stringify({ ok: true, status: 'queued' }), { status: 200 })
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; emailStatus?: string; magicLink?: string }
  assert.equal(payload.delivery, 'accepted')
  assert.equal(payload.emailStatus, 'queued')
  assert.equal(payload.magicLink, undefined)
})

test('requestMagicLink returns request_id immediately so the browser can poll final delivery status', async () => {
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: 'preview_phase0', continue_path: '/?size=40x50' }),
    }),
    env,
    async () => new Response(JSON.stringify({ ok: true, status: 'queued', request_id: 'ml_phase0', expires_in_seconds: 1800 }), { status: 202 }),
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; emailStatus?: string; requestId?: string; magicLink?: string }
  assert.equal(payload.delivery, 'accepted')
  assert.equal(payload.emailStatus, 'queued')
  assert.equal(payload.requestId, 'ml_phase0')
  assert.equal(payload.magicLink, undefined)
})

test('requestMagicLink proxies previewless returning-account login without preview_id', async () => {
  let upstreamBody: Record<string, unknown> | null = null
  let upstreamIdempotencyKey = ''
  const response = await requestMagicLink(
    new Request('https://dottingo.test/api/identity/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Buyer@Example.com', continue_path: '/?account=login' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      upstreamIdempotencyKey = upstreamRequest.headers.get('Idempotency-Key') || ''
      return new Response(JSON.stringify({ ok: true, status: 'sent' }), { status: 202 })
    },
  )

  assert.equal(response.status, 200)
  assert.ok(upstreamIdempotencyKey.startsWith('magic-link-'))
  assert.deepEqual(upstreamBody, {
    brand_id: 64,
    email: 'buyer@example.com',
    continue_path: '/?account=login',
  })
})

test('createDevelopmentIdentitySession uses MGE testing session only on localhost', async () => {
  let upstreamUrl = ''
  let upstreamBody: Record<string, unknown> | null = null
  const response = await createDevelopmentIdentitySession(
    new Request('http://127.0.0.1:3206/api/identity/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'matejgondolan@gmail.com' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamUrl = upstreamRequest.url
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      return new Response(JSON.stringify({
        ok: true,
        email: 'matejgondolan@gmail.com',
        preview_id: null,
        identity_token: 'opaque-dev-identity-token',
      }), { status: 200 })
    },
  )

  assert.equal(response.status, 200)
  assert.equal(upstreamUrl, 'https://mge.test/api/internal/v1/identity/testing/session/')
  assert.deepEqual(upstreamBody, {
    brand_id: 64,
    email: 'matejgondolan@gmail.com',
  })
  const payload = await response.json() as { email: string; previewId: string | null; identityToken: string; mgeIdentityToken: string }
  assert.equal(payload.email, 'matejgondolan@gmail.com')
  assert.equal(payload.previewId, null)
  assert.equal(payload.mgeIdentityToken, 'opaque-dev-identity-token')

  const session = await verifyIdentitySessionToken(payload.identityToken, env)
  assert.equal(session.email, 'matejgondolan@gmail.com')
  assert.equal(session.previewId, null)
})

test('createDevelopmentIdentitySession rejects production hosts', async () => {
  const response = await createDevelopmentIdentitySession(
    new Request('https://dottingo.sg/api/identity/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'matejgondolan@gmail.com' }),
    }),
    env,
    async () => {
      throw new Error('should not call MGE from production host')
    },
  )

  assert.equal(response.status, 403)
})

test('getMagicLinkRequestStatus proxies request_id to MGE internal request status endpoint', async () => {
  let upstreamRequestUrl = ''
  let upstreamAuthorization = ''

  const response = await getMagicLinkRequestStatus(
    new Request('https://dottingo.test/api/identity/magic-link/requests/ml_phase0', {
      method: 'GET',
    }),
    env,
    'ml_phase0',
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamRequestUrl = upstreamRequest.url
      upstreamAuthorization = upstreamRequest.headers.get('Authorization') || ''
      return new Response(JSON.stringify({ ok: true, status: 'sent' }), { status: 200 })
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; emailStatus?: string; terminal?: boolean; requestId?: string }
  assert.equal(payload.delivery, 'email_sent')
  assert.equal(payload.emailStatus, 'sent')
  assert.equal(payload.terminal, true)
  assert.equal(payload.requestId, 'ml_phase0')
  assert.equal(upstreamRequestUrl, 'https://mge.test/api/internal/v1/identity/magic-link/requests/ml_phase0/')
  assert.equal(upstreamAuthorization, 'Bearer test_mge_token')
})

test('getMagicLinkRequestStatus keeps queued request non-terminal', async () => {
  const response = await getMagicLinkRequestStatus(
    new Request('https://dottingo.test/api/identity/magic-link/requests/ml_queued', { method: 'GET' }),
    env,
    'ml_queued',
    async () => new Response(JSON.stringify({ ok: true, status: 'queued' }), { status: 200 }),
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { delivery: string; emailStatus?: string; terminal?: boolean; requestId?: string }
  assert.equal(payload.delivery, 'accepted')
  assert.equal(payload.emailStatus, 'queued')
  assert.equal(payload.terminal, false)
  assert.equal(payload.requestId, 'ml_queued')
})

test('MGE email-sent status aliases are normalized as confirmed email delivery', async () => {
  for (const status of ['sent', 'email_sent', 'delivered', 'succeeded']) {
    const response = await requestMagicLink(
      new Request('https://dottingo.test/api/identity/request-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'Buyer@Example.com', preview_id: `preview_${status}`, continue_path: '/?size=40x50' }),
      }),
      env,
      async () => new Response(JSON.stringify({ ok: true, status, expires_in_seconds: 1800 }), { status: 202 }),
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as { delivery: string; magicLink?: string }
    assert.equal(payload.delivery, 'email_sent')
    assert.equal(payload.magicLink, undefined)
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

test('verifyMagicLinkRequest accepts previewless MGE account login sessions', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: true,
      email: 'buyer@example.com',
      preview_id: null,
      identity_token: 'opaque-mge-identity-token',
      expires_in_seconds: 1800,
    }))) as typeof fetch

    const verified = await verifyMagicLinkRequest(
      new Request('https://dottingo.test/api/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'mge-previewless-token' }),
      }),
      env,
    )

    assert.equal(verified.status, 200)
    const payload = await verified.json() as { email: string; previewId: string | null; identityToken: string; mgeIdentityToken: string | null }
    assert.equal(payload.email, 'buyer@example.com')
    assert.equal(payload.previewId, null)
    assert.equal(payload.mgeIdentityToken, 'opaque-mge-identity-token')

    const session = await verifyIdentitySessionToken(payload.identityToken, env)
    assert.equal(session.email, 'buyer@example.com')
    assert.equal(session.previewId, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('identity session tokens preserve preview scope when present', async () => {
  const token = await createIdentitySessionToken({ email: 'buyer@example.com', previewId: 'preview_123' }, env)
  const identity = await verifyIdentitySessionToken(token, env)
  assert.equal(identity.previewId, 'preview_123')
})

test('getIdentityPreviews proxies the real MGE preview library and normalizes source images', async () => {
  let upstreamUrl = ''
  let upstreamApiKey = ''
  let upstreamIdentityToken = ''

  const response = await getIdentityPreviews(
    new Request('https://dottingo.test/api/identity/previews', {
      method: 'GET',
      headers: { 'X-MGE-Identity-Token': 'identity-token-123' },
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamUrl = upstreamRequest.url
      upstreamApiKey = upstreamRequest.headers.get('X-API-Key') || ''
      upstreamIdentityToken = upstreamRequest.headers.get('X-MGE-Identity-Token') || ''
      return new Response(JSON.stringify({
        previews: [
          {
            preview_id: '11111111-1111-1111-1111-111111111111',
            selected_size: '40X60',
            image_url: 'https://cdn.test/preview.png',
            source_image: {
              url: 'https://cdn.test/source.png?sig=abc',
              expires_in_seconds: 600,
            },
          },
        ],
      }), { status: 200 })
    },
  )

  assert.equal(response.status, 200)
  assert.equal(upstreamUrl, 'https://mge.test/api/internal/v1/identity/previews/?brand_id=64')
  assert.equal(upstreamApiKey, 'test_mge_token')
  assert.equal(upstreamIdentityToken, 'identity-token-123')
  const payload = await response.json() as { previews: Array<{ selectedSize: string; imageUrl: string; sourceImageUrl: string; sourceThumbnailUrl: string }> }
  assert.equal(payload.previews[0].selectedSize, '40x60')
  assert.equal(payload.previews[0].imageUrl.startsWith('/api/mge/image?url='), true)
  assert.equal(payload.previews[0].sourceImageUrl.startsWith('/api/mge/image?url='), true)
  assert.equal(payload.previews[0].sourceThumbnailUrl.includes('width=160'), true)
  assert.equal(payload.previews[0].sourceThumbnailUrl.includes('height=160'), true)
})

test('identity previews normalize nested product option images for restored account variants', async () => {
  const response = await getIdentityPreviews(
    new Request('https://dottingo.test/api/identity/previews', {
      method: 'GET',
      headers: { 'X-MGE-Identity-Token': 'identity-token-123' },
    }),
    env,
    async () => new Response(JSON.stringify({
      projects: [{
        source_group_id: 'source_group_123',
        source_image_url: 'https://mge.test/source.jpg',
        previews: [{
          preview_id: 'preview_nested_4060',
          selected_size: '40X60',
          products: [{
            product: 'DOT',
            options: [{
              preview_option_id: 'option_nested',
              label: 'BLACK / drama',
              orderable: true,
              preview_url: 'https://mge.test/generated-4060.jpg',
            }],
          }],
        }],
      }],
    })),
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { projects: Array<{ previews: Array<{ imageUrl: string | null; options: Array<{ imageUrl: string | null }> }> }> }
  const preview = payload.projects[0].previews[0]
  assert.equal(preview.imageUrl, null)
  assert.equal(preview.options[0].imageUrl, '/api/mge/image?url=https%3A%2F%2Fmge.test%2Fgenerated-4060.jpg')
})

test('attachIdentityPreview attaches an existing preview to the verified MGE identity', async () => {
  let upstreamUrl = ''
  let upstreamApiKey = ''
  let upstreamIdentityToken = ''
  let upstreamBody: Record<string, unknown> | null = null

  const response = await attachIdentityPreview(
    new Request('https://dottingo.test/api/identity/attach-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MGE-Identity-Token': 'identity-token-123',
      },
      body: JSON.stringify({ preview_id: 'preview_attach_123' }),
    }),
    env,
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamUrl = upstreamRequest.url
      upstreamApiKey = upstreamRequest.headers.get('X-API-Key') || ''
      upstreamIdentityToken = upstreamRequest.headers.get('X-MGE-Identity-Token') || ''
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      return new Response(JSON.stringify({ preview_id: 'preview_attach_123', selected_size: '40X50' }), { status: 201 })
    },
  )

  assert.equal(response.status, 200)
  assert.equal(upstreamUrl, 'https://mge.test/api/internal/v1/identity/previews/')
  assert.equal(upstreamApiKey, 'test_mge_token')
  assert.equal(upstreamIdentityToken, 'identity-token-123')
  assert.deepEqual(upstreamBody, {
    brand_id: 64,
    preview_id: 'preview_attach_123',
  })
  const payload = await response.json() as { preview: { previewId: string; selectedSize: string } }
  assert.equal(payload.preview.previewId, 'preview_attach_123')
  assert.equal(payload.preview.selectedSize, '40x50')
})

test('createIdentityProjectPreview generates a new size variant from a saved source group', async () => {
  let upstreamUrl = ''
  let upstreamBody: Record<string, unknown> | null = null

  const response = await createIdentityProjectPreview(
    new Request('https://dottingo.test/api/identity/projects/source_group_123/previews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MGE-Identity-Token': 'identity-token-123',
      },
      body: JSON.stringify({
        preferred_size: '40x60',
        preferred_orientation: 'horizontal',
        auto_crop: false,
        product_params: {
          crop: {
            offset_x: 10,
            offset_y: 20,
            crop_width: 300,
            crop_height: 400,
          },
        },
      }),
    }),
    env,
    'source_group_123',
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamUrl = upstreamRequest.url
      assert.equal(upstreamRequest.headers.get('X-MGE-Identity-Token'), 'identity-token-123')
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      return new Response(JSON.stringify({
        preview_id: 'preview_variant_4060',
        selected_size: '40X60',
        variant_key: 'source_group_123:40X60',
        variant_rank: 1,
        is_current_variant: true,
        superseded_by_preview_id: null,
      }), { status: 201 })
    },
  )

  assert.equal(response.status, 200)
  assert.equal(upstreamUrl, 'https://mge.test/api/internal/v1/identity/projects/source_group_123/previews/')
  assert.deepEqual(upstreamBody, {
    brand_id: 64,
    product: 'DOT',
    preferred_size: '40X60',
    preferred_orientation: 'horizontal',
    auto_crop: false,
    product_params: {
      crop: {
        offset_x: 10,
        offset_y: 20,
        crop_width: 300,
        crop_height: 400,
      },
    },
  })
  const payload = await response.json() as { preview: { previewId: string; selectedSize: string; variantKey: string; isCurrentVariant: boolean; isCurrent: boolean } }
  assert.equal(payload.preview.previewId, 'preview_variant_4060')
  assert.equal(payload.preview.selectedSize, '40x60')
  assert.equal(payload.preview.variantKey, 'source_group_123:40X60')
  assert.equal(payload.preview.isCurrentVariant, true)
  assert.equal(payload.preview.isCurrent, true)
})

test('identity project variant requests require identity token, source group, and preferred size', async () => {
  const missingToken = await createIdentityProjectPreview(
    new Request('https://dottingo.test/api/identity/projects/source_group_123/previews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_size: '40x60' }),
    }),
    env,
    'source_group_123',
    async () => new Response('{}'),
  )
  assert.equal(missingToken.status, 401)

  const missingSource = await createIdentityProjectPreview(
    new Request('https://dottingo.test/api/identity/projects//previews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MGE-Identity-Token': 'identity-token-123' },
      body: JSON.stringify({ preferred_size: '40x60' }),
    }),
    env,
    '',
    async () => new Response('{}'),
  )
  assert.equal(missingSource.status, 400)

  const missingSize = await createIdentityProjectPreview(
    new Request('https://dottingo.test/api/identity/projects/source_group_123/previews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MGE-Identity-Token': 'identity-token-123' },
      body: JSON.stringify({}),
    }),
    env,
    'source_group_123',
    async () => new Response('{}'),
  )
  assert.equal(missingSize.status, 400)
})

test('deleteIdentityPreview removes one preview from verified MGE identity history', async () => {
  let upstreamUrl = ''
  let upstreamIdentityToken = ''
  let upstreamBody: Record<string, unknown> | null = null

  const response = await deleteIdentityPreview(
    new Request('https://dottingo.test/api/identity/previews/preview_delete_123', {
      method: 'DELETE',
      headers: { 'X-MGE-Identity-Token': 'identity-token-123' },
    }),
    env,
    'preview_delete_123',
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamUrl = upstreamRequest.url
      upstreamIdentityToken = upstreamRequest.headers.get('X-MGE-Identity-Token') || ''
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      return new Response(null, { status: 204 })
    },
  )

  assert.equal(response.status, 200)
  assert.equal(upstreamUrl, 'https://mge.test/api/internal/v1/identity/previews/preview_delete_123/')
  assert.equal(upstreamIdentityToken, 'identity-token-123')
  assert.deepEqual(upstreamBody, { brand_id: 64 })
  const payload = await response.json() as { previewId: string }
  assert.equal(payload.previewId, 'preview_delete_123')
})

test('deleteIdentityProject removes one source project from verified MGE identity history', async () => {
  let upstreamUrl = ''
  let upstreamIdentityToken = ''
  let upstreamBody: Record<string, unknown> | null = null

  const response = await deleteIdentityProject(
    new Request('https://dottingo.test/api/identity/projects/source_group_123', {
      method: 'DELETE',
      headers: { 'X-MGE-Identity-Token': 'identity-token-123' },
    }),
    env,
    'source_group_123',
    async (request, init) => {
      const upstreamRequest = request instanceof Request ? request : new Request(request, init)
      upstreamUrl = upstreamRequest.url
      upstreamIdentityToken = upstreamRequest.headers.get('X-MGE-Identity-Token') || ''
      upstreamBody = await upstreamRequest.json() as Record<string, unknown>
      return new Response(null, { status: 204 })
    },
  )

  assert.equal(response.status, 200)
  assert.equal(upstreamUrl, 'https://mge.test/api/internal/v1/identity/projects/source_group_123/')
  assert.equal(upstreamIdentityToken, 'identity-token-123')
  assert.deepEqual(upstreamBody, { brand_id: 64 })
  const payload = await response.json() as { sourceGroupId: string }
  assert.equal(payload.sourceGroupId, 'source_group_123')
})
