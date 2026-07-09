export interface IdentityEnv {
  MAGIC_LINK_SECRET?: string
  MAGIC_LINK_FROM?: string
  RESEND_API_KEY?: string
  APP_BASE_URL?: string
  ALLOWED_ORIGIN?: string
  MGEVERYDAY_API_TOKEN?: string
  MGEVERYDAY_BASE_URL?: string
  MGEVERYDAY_BRAND_ID?: string
  DOT_DEV_IDENTITY_LOGIN_EMAILS?: string
  DOT_DEV_IDENTITY_LOGIN_TOKEN?: string
}

export type VerifiedIdentity = {
  email: string
  previewId: string | null
  exp: number
}

type MagicLinkPayload = VerifiedIdentity & {
  typ: 'magic_link' | 'identity_session'
  iat: number
  nonce: string
}

type SendMagicLinkRequest = {
  email?: unknown
  preview_id?: unknown
  previewId?: unknown
  continue_path?: unknown
}

type DevIdentityLoginRequest = {
  email?: unknown
  preview_id?: unknown
  previewId?: unknown
}

type AttachIdentityPreviewRequest = {
  preview_id?: unknown
  previewId?: unknown
}

type CreateIdentityProjectPreviewRequest = {
  preferred_size?: unknown
  preferredSize?: unknown
  product?: unknown
  preferred_orientation?: unknown
  preferredOrientation?: unknown
  auto_crop?: unknown
  autoCrop?: unknown
  product_params?: unknown
  productParams?: unknown
  preview_options?: unknown
  previewOptions?: unknown
}

type MagicLinkRequestIdentity = {
  email: string
  previewId: string | null
  continuePath: string
}

const MAGIC_LINK_TTL_SECONDS = 30 * 60
const IDENTITY_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_MGEVERYDAY_BASE_URL = 'https://www.mgeveryday.sg'
const DOTTINGO_BRAND_ID = 64
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_DEV_IDENTITY_LOGIN_EMAIL = 'matejgondolan@gmail.com'

export async function requestMagicLink(
  request: Request,
  env: IdentityEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  try {
    const body = (await request.json().catch(() => null)) as SendMagicLinkRequest | null
    const email = normalizeEmail(body?.email)
    const previewId = normalizeId(body?.preview_id ?? body?.previewId)
    const continuePath = normalizeContinuePath(body?.continue_path)

    if (!email) return withCors(json({ error: 'A valid email is required' }, 400), request, env)

    const upstream = await requestMgeMagicLink({ email, previewId, continuePath }, env, fetcher)
    const emailStatus = normalizeMagicLinkDelivery(upstream.status) === 'email_sent'
      ? upstream.status
      : await checkMgeMagicLinkStatus({ email, previewId, requestId: upstream.requestId }, upstream.status, env, fetcher)
    const delivery = normalizeMagicLinkDelivery(emailStatus)

    return withCors(
      json({
        ok: true,
        delivery,
        emailStatus,
        requestId: upstream.requestId,
        expiresInSeconds: upstream.expiresInSeconds || MAGIC_LINK_TTL_SECONDS,
      }),
      request,
      env,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send magic link'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function getMagicLinkRequestStatus(
  request: Request,
  env: IdentityEnv,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'GET') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  const normalizedRequestId = normalizeId(requestId)
  if (!normalizedRequestId) return withCors(json({ error: 'request_id is required' }, 400), request, env)

  try {
    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/magic-link/requests/${normalizedRequestId}/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
      },
    })
    const payload = parseJson(await response.text())
    if (!response.ok) return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the magic link status request') }, response.status), request, env)

    const emailStatus = magicLinkStatusFromPayload(payload, 'accepted')
    const delivery = normalizeMagicLinkDelivery(emailStatus)

    return withCors(
      json({
        ok: true,
        delivery,
        emailStatus,
        terminal: delivery === 'email_sent' || isTerminalMagicLinkFailure(emailStatus),
        requestId: normalizedRequestId,
      }),
      request,
      env,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not check magic link status'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function getIdentityPreviews(
  request: Request,
  env: IdentityEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'GET') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  const identityToken = request.headers.get('X-MGE-Identity-Token')?.trim()
  if (!identityToken) return withCors(json({ error: 'X-MGE-Identity-Token is required' }, 401), request, env)

  try {
    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/previews/?brand_id=${mgeBrandId()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
        'X-API-Key': requireMgeToken(env),
        'X-MGE-Identity-Token': identityToken,
      },
    })
    const payload = parseJson(await response.text())
    if (!response.ok) {
      return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the identity preview request') }, response.status), request, env)
    }

    return withCors(json({ ok: true, ...normalizeIdentityPreviewLibrary(payload) }), request, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load identity previews'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function createDevelopmentIdentitySession(
  request: Request,
  env: IdentityEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, 405), request, env)
  if (!isLocalDevelopmentRequest(request) && !isAuthorizedDevelopmentIdentityBypass(request, env)) {
    return withCors(json({ error: 'Development identity login is only available on localhost or with the configured test token' }, 403), request, env)
  }

  try {
    const body = (await request.json().catch(() => null)) as DevIdentityLoginRequest | null
    const email = normalizeEmail(body?.email)
    const previewId = normalizeId(body?.preview_id ?? body?.previewId) || null
    if (!email) return withCors(json({ error: 'A valid email is required' }, 400), request, env)
    if (!isAllowedDevelopmentIdentityEmail(email, env)) {
      return withCors(json({ error: 'This email is not enabled for development login' }, 403), request, env)
    }

    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/testing/session/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_id: mgeBrandId(),
        email,
        ...(previewId ? { preview_id: previewId } : {}),
      }),
    })
    const payload = parseJson(await response.text())
    if (!response.ok) {
      return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the development identity session request') }, response.status), request, env)
    }

    const record = asRecord(payload)
    const verifiedEmail = normalizeEmail(record?.email) || email
    const verifiedPreviewId = normalizeId(record?.preview_id) || previewId
    const mgeIdentityToken = stringValue(record?.identity_token) || stringValue(record?.token)
    if (!mgeIdentityToken) {
      return withCors(json({ error: 'MGE development identity response is missing identity_token' }, 502), request, env)
    }

    const identityToken = await createIdentitySessionToken(
      { email: verifiedEmail, previewId: verifiedPreviewId },
      env,
    )

    return withCors(
      json({
        ok: true,
        email: verifiedEmail,
        previewId: verifiedPreviewId,
        identityToken,
        mgeIdentityToken,
        expiresInSeconds: IDENTITY_SESSION_TTL_SECONDS,
      }),
      request,
      env,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create development identity session'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function attachIdentityPreview(
  request: Request,
  env: IdentityEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  const identityToken = request.headers.get('X-MGE-Identity-Token')?.trim()
  if (!identityToken) return withCors(json({ error: 'X-MGE-Identity-Token is required' }, 401), request, env)

  try {
    const body = (await request.json().catch(() => null)) as AttachIdentityPreviewRequest | null
    const previewId = normalizeId(body?.preview_id ?? body?.previewId)
    if (!previewId) return withCors(json({ error: 'preview_id is required' }, 400), request, env)

    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/previews/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
        'X-API-Key': requireMgeToken(env),
        'X-MGE-Identity-Token': identityToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brand_id: mgeBrandId(),
        preview_id: previewId,
      }),
    })
    const payload = parseJson(await response.text())
    if (!response.ok) {
      return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the identity preview attach request') }, response.status), request, env)
    }

    return withCors(json({ ok: true, preview: normalizeIdentityPreviewRow(payload) ?? payload }), request, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save identity preview'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function createIdentityProjectPreview(
  request: Request,
  env: IdentityEnv,
  sourceGroupId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  const identityToken = request.headers.get('X-MGE-Identity-Token')?.trim()
  if (!identityToken) return withCors(json({ error: 'X-MGE-Identity-Token is required' }, 401), request, env)

  const normalizedSourceGroupId = normalizeId(sourceGroupId)
  if (!normalizedSourceGroupId) return withCors(json({ error: 'source_group_id is required' }, 400), request, env)

  try {
    const body = (await request.json().catch(() => null)) as CreateIdentityProjectPreviewRequest | null
    const preferredSize = normalizePreferredSize(body?.preferred_size ?? body?.preferredSize)
    const product = normalizeProduct(body?.product) || 'DOT'
    const preferredOrientation = normalizePreferredOrientation(body?.preferred_orientation ?? body?.preferredOrientation)
    const autoCrop = normalizeOptionalBoolean(body?.auto_crop ?? body?.autoCrop)
    const productParams = normalizePlainObject(body?.product_params ?? body?.productParams)
    const previewOptions = normalizePlainObject(body?.preview_options ?? body?.previewOptions)
    if (!preferredSize) return withCors(json({ error: 'preferred_size is required' }, 400), request, env)

    const requestBody: Record<string, unknown> = {
      brand_id: mgeBrandId(),
      product,
      preferred_size: preferredSize,
    }
    if (preferredOrientation) requestBody.preferred_orientation = preferredOrientation
    if (autoCrop !== null) requestBody.auto_crop = autoCrop
    if (productParams) requestBody.product_params = productParams
    if (previewOptions) requestBody.preview_options = previewOptions

    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/projects/${encodeURIComponent(normalizedSourceGroupId)}/previews/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
        'X-API-Key': requireMgeToken(env),
        'X-MGE-Identity-Token': identityToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    const payload = parseJson(await response.text())
    if (!response.ok) {
      return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the project preview request') }, response.status), request, env)
    }

    return withCors(json({ ok: true, preview: normalizeIdentityPreviewRow(payload) ?? payload }), request, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate project preview'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function deleteIdentityPreview(
  request: Request,
  env: IdentityEnv,
  previewId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'DELETE') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  const identityToken = request.headers.get('X-MGE-Identity-Token')?.trim()
  if (!identityToken) return withCors(json({ error: 'X-MGE-Identity-Token is required' }, 401), request, env)

  const normalizedPreviewId = normalizeId(previewId)
  if (!normalizedPreviewId) return withCors(json({ error: 'preview_id is required' }, 400), request, env)

  try {
    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/previews/${encodeURIComponent(normalizedPreviewId)}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
        'X-API-Key': requireMgeToken(env),
        'X-MGE-Identity-Token': identityToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brand_id: mgeBrandId() }),
    })
    const payload = parseJson(await response.text())
    if (!response.ok) {
      return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the identity preview delete request') }, response.status), request, env)
    }

    return withCors(json({ ok: true, previewId: normalizedPreviewId }), request, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete identity preview'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function deleteIdentityProject(
  request: Request,
  env: IdentityEnv,
  sourceGroupId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'DELETE') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  const identityToken = request.headers.get('X-MGE-Identity-Token')?.trim()
  if (!identityToken) return withCors(json({ error: 'X-MGE-Identity-Token is required' }, 401), request, env)

  const normalizedSourceGroupId = normalizeId(sourceGroupId)
  if (!normalizedSourceGroupId) return withCors(json({ error: 'source_group_id is required' }, 400), request, env)

  try {
    const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/projects/${encodeURIComponent(normalizedSourceGroupId)}/`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${requireMgeToken(env)}`,
        'X-API-Key': requireMgeToken(env),
        'X-MGE-Identity-Token': identityToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brand_id: mgeBrandId() }),
    })
    const payload = parseJson(await response.text())
    if (!response.ok) {
      return withCors(json({ error: mgeErrorMessage(payload, 'MGE rejected the identity project delete request') }, response.status), request, env)
    }

    return withCors(json({ ok: true, sourceGroupId: normalizedSourceGroupId }), request, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete identity project'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function verifyMagicLinkRequest(request: Request, env: IdentityEnv): Promise<Response> {
  if (request.method === 'OPTIONS') return corsResponse(request, env)
  if (request.method !== 'POST') return withCors(json({ error: 'Method not allowed' }, 405), request, env)

  try {
    const body = await request.json().catch(() => null) as { token?: unknown } | null
    const token = typeof body?.token === 'string' ? body.token : ''
    let identity: Pick<VerifiedIdentity, 'email' | 'previewId'>

    try {
      identity = await verifyMgeMagicLink(token, env)
    } catch (mgeError) {
      try {
        identity = await verifyMagicToken(token, env, 'magic_link')
      } catch {
        throw mgeError
      }
    }

    const identityToken = await createIdentitySessionToken(
      { email: identity.email, previewId: identity.previewId },
      env,
    )

    return withCors(
      json({
        ok: true,
        email: identity.email,
        previewId: identity.previewId,
        identityToken,
        mgeIdentityToken: 'identityToken' in identity ? identity.identityToken ?? null : null,
        expiresInSeconds: IDENTITY_SESSION_TTL_SECONDS,
      }),
      request,
      env,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Magic link verification failed'
    return withCors(json({ error: message }, 400), request, env)
  }
}

export async function createMagicToken(
  identity: Pick<VerifiedIdentity, 'email' | 'previewId'>,
  env: IdentityEnv,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  return signPayload({
    typ: 'magic_link',
    email: normalizeEmail(identity.email),
    previewId: normalizeId(identity.previewId),
    iat: now,
    exp: now + MAGIC_LINK_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  }, env)
}

export async function createIdentitySessionToken(
  identity: Pick<VerifiedIdentity, 'email' | 'previewId'>,
  env: IdentityEnv,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  return signPayload({
    typ: 'identity_session',
    email: normalizeEmail(identity.email),
    previewId: normalizeId(identity.previewId),
    iat: now,
    exp: now + IDENTITY_SESSION_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  }, env)
}

export async function verifyIdentitySessionToken(token: string, env: IdentityEnv): Promise<VerifiedIdentity> {
  return verifyMagicToken(token, env, 'identity_session')
}

export async function sendContinuationMagicLink(
  request: Request,
  env: IdentityEnv,
  identity: Pick<VerifiedIdentity, 'email' | 'previewId'>,
  fetcher: typeof fetch = fetch,
): Promise<'email_sent' | 'accepted'> {
  const continuePath = normalizeContinuePath(new URL(request.url).pathname || '/')
  const upstream = await requestMgeMagicLink({
    email: identity.email,
    previewId: identity.previewId,
    continuePath,
  }, env, fetcher)
  return normalizeMagicLinkDelivery(upstream.status)
}

type MgeMagicLinkRequestResult = {
  status: string
  requestId?: string
  expiresInSeconds: number
}

type MgeMagicLinkIdentity = Pick<VerifiedIdentity, 'email' | 'previewId'> & {
  expiresInSeconds: number
  identityToken?: string | null
}

function normalizeMagicLinkDelivery(status: string): 'email_sent' | 'accepted' {
  return ['sent', 'email_sent', 'delivered', 'succeeded'].includes(status.toLowerCase()) ? 'email_sent' : 'accepted'
}

function isTerminalMagicLinkFailure(status: string): boolean {
  return ['failed', 'bounced', 'rejected', 'cancelled', 'canceled', 'expired'].includes(status.toLowerCase())
}

function magicLinkStatusFromPayload(payload: unknown, fallbackStatus: string): string {
  const record = asRecord(payload)
  return stringValue(record?.status)
    || stringValue(record?.email_status)
    || stringValue(record?.delivery)
    || stringValue(record?.mail_status)
    || fallbackStatus
    || 'accepted'
}

async function requestMgeMagicLink(
  identity: MagicLinkRequestIdentity,
  env: IdentityEnv,
  fetcher: typeof fetch,
): Promise<MgeMagicLinkRequestResult> {
  const previewId = normalizeId(identity.previewId)
  const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/magic-link/request/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireMgeToken(env)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': await idempotencyKey(identity.email, previewId, identity.continuePath),
    },
    body: JSON.stringify({
      brand_id: mgeBrandId(),
      email: normalizeEmail(identity.email),
      continue_path: normalizeContinuePath(identity.continuePath),
      ...(previewId ? { preview_id: previewId } : {}),
    }),
  })
  const payload = parseJson(await response.text())
  if (!response.ok) {
    throw new Error(mgeErrorMessage(payload, 'MGE rejected the magic link request'))
  }

  const record = asRecord(payload)
  return {
    status: stringValue(record?.status) || 'accepted',
    requestId: stringValue(record?.request_id) || stringValue(record?.id),
    expiresInSeconds: numberValue(record?.expires_in_seconds) || MAGIC_LINK_TTL_SECONDS,
  }
}

async function checkMgeMagicLinkStatus(
  identity: Pick<VerifiedIdentity, 'email' | 'previewId'> & { requestId?: string },
  fallbackStatus: string,
  env: IdentityEnv,
  fetcher: typeof fetch,
): Promise<string> {
  const previewId = normalizeId(identity.previewId)
  const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/magic-link/status/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireMgeToken(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand_id: mgeBrandId(),
      email: normalizeEmail(identity.email),
      ...(previewId ? { preview_id: previewId } : {}),
      ...(identity.requestId ? { request_id: normalizeId(identity.requestId) } : {}),
    }),
  })
  const payload = parseJson(await response.text())
  if (!response.ok) return fallbackStatus || 'accepted'
  return magicLinkStatusFromPayload(payload, fallbackStatus)
}

async function verifyMgeMagicLink(token: string, env: IdentityEnv): Promise<MgeMagicLinkIdentity> {
  if (!token) throw new Error('Magic link token is required')
  const response = await fetch(`${mgeBaseUrl(env)}/api/internal/v1/identity/magic-link/verify/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireMgeToken(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand_id: mgeBrandId(),
      token,
    }),
  })
  const payload = parseJson(await response.text())
  if (!response.ok) {
    throw new Error(mgeErrorMessage(payload, 'Magic link verification failed'))
  }

  const record = asRecord(payload)
  const email = normalizeEmail(record?.email)
  const previewId = normalizeId(record?.preview_id) || null
  if (!email) throw new Error('MGE magic link response is incomplete')

  return {
    email,
    previewId,
    identityToken: stringValue(record?.identity_token) || stringValue(record?.token) || null,
    expiresInSeconds: numberValue(record?.expires_in_seconds) || IDENTITY_SESSION_TTL_SECONDS,
  }
}

async function idempotencyKey(email: string, previewId: string, continuePath: string): Promise<string> {
  const retryNonce = crypto.randomUUID()
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${normalizeEmail(email)}:${normalizeId(previewId)}:${normalizeContinuePath(continuePath)}:${retryNonce}`),
  )
  return `magic-link-${bytesToHex(new Uint8Array(digest)).slice(0, 32)}`
}

async function verifyMagicToken(token: string, env: IdentityEnv, type: MagicLinkPayload['typ']): Promise<VerifiedIdentity> {
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart || token.split('.').length !== 2) {
    throw new Error('Invalid magic link token')
  }

  const expected = await hmacSha256Base64Url(payloadPart, requireSecret(env))
  if (!timingSafeEqual(signaturePart, expected)) {
    throw new Error('Invalid magic link signature')
  }

  const payload = JSON.parse(base64UrlDecodeText(payloadPart)) as Partial<MagicLinkPayload>
  const now = Math.floor(Date.now() / 1000)
  const email = normalizeEmail(payload.email)
  const previewId = normalizeId(payload.previewId) || null

  if (payload.typ !== type) throw new Error('Magic link has the wrong purpose')
  if (!email || typeof payload.exp !== 'number') throw new Error('Magic link is incomplete')
  if (payload.exp < now) throw new Error('Magic link has expired')

  return { email, previewId, exp: payload.exp }
}

async function signPayload(payload: MagicLinkPayload, env: IdentityEnv): Promise<string> {
  if (!payload.email) throw new Error('Identity payload is incomplete')
  const payloadPart = base64UrlEncode(JSON.stringify(payload))
  const signature = await hmacSha256Base64Url(payloadPart, requireSecret(env))
  return `${payloadPart}.${signature}`
}

async function sendMagicLinkEmail(
  email: string,
  magicLink: string,
  env: IdentityEnv,
  fetcher: typeof fetch,
): Promise<'email_sent' | 'email_not_configured'> {
  if (!env.RESEND_API_KEY || !env.MAGIC_LINK_FROM) {
    return 'email_not_configured'
  }

  const response = await fetcher(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAGIC_LINK_FROM,
      to: email,
      subject: 'Your Dottingo design magic link',
      html: `<p>Open this secure link to save and continue your Dottingo design:</p><p><a href="${escapeHtml(magicLink)}">Continue your design</a></p><p>This link expires in 30 minutes.</p>`,
      text: `Open this secure link to save and continue your Dottingo design: ${magicLink}\n\nThis link expires in 30 minutes.`,
    }),
  })

  if (!response.ok) {
    throw new Error('Email provider rejected the magic link request')
  }

  return 'email_sent'
}

function buildMagicLink(request: Request, env: IdentityEnv, token: string, continuePath: string): string {
  const origin = (env.APP_BASE_URL || requestOrigin(request)).replace(/\/+$/, '')
  const url = new URL(continuePath || '/', origin)
  url.searchParams.set('magic_token', token)
  return url.toString()
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

function mgeBaseUrl(env: IdentityEnv): string {
  return (env.MGEVERYDAY_BASE_URL || DEFAULT_MGEVERYDAY_BASE_URL).replace(/\/+$/, '')
}

function mgeBrandId(): number {
  return DOTTINGO_BRAND_ID
}

function requireMgeToken(env: IdentityEnv): string {
  if (!env.MGEVERYDAY_API_TOKEN) throw new Error('MGEVERYDAY_API_TOKEN is not configured')
  return env.MGEVERYDAY_API_TOKEN
}

function parseJson(value: string): unknown {
  if (!value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(stringValue(value), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const normalized = stringValue(value).toLowerCase()
  return ['true', '1', 'yes', 'y'].includes(normalized)
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  const normalized = stringValue(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return null
}

function normalizePlainObject(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  return record ? record : null
}

function mgeErrorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload)
  const directMessage = stringValue(record?.error) || stringValue(record?.detail)
  if (directMessage) return directMessage
  if (record) {
    for (const [field, value] of Object.entries(record)) {
      const messages = Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [stringValue(value)].filter(Boolean)
      if (messages.length) return `${field}: ${messages.join(', ')}`
    }
  }
  return fallback
}

function normalizeIdentityPreviewLibrary(payload: unknown): { previews: Array<Record<string, unknown>>; projects: Array<Record<string, unknown>> } {
  const root = asRecord(payload)
  const previews = normalizeIdentityPreviewRows(payload)
  const projectValues = root && Array.isArray(root.projects) ? root.projects : []
  const projects = projectValues
    .map((project) => normalizeIdentityProject(project, previews))
    .filter((project): project is Record<string, unknown> => Boolean(project))
  return { previews, projects }
}

function normalizeIdentityProject(value: unknown, fallbackPreviews: Array<Record<string, unknown>>): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const rawPreviews = Array.isArray(record.previews)
    ? record.previews
    : Array.isArray(record.preview_variants)
      ? record.preview_variants
      : []
  const previews = rawPreviews.map(normalizeIdentityPreviewRow).filter((row): row is Record<string, unknown> => Boolean(row))
  const projectId = normalizeId(record.project_id ?? record.projectId ?? record.id) || null
  const sourceImageRecord = asRecord(record.source_image ?? record.sourceImage)
  const rawSourceImageUrl = stringValue(sourceImageRecord?.url) || stringValue(record.source_image_url) || stringValue(record.sourceImageUrl)
  const sourceImageUrl = proxiedImageUrl(rawSourceImageUrl)
  const sourceThumbnailUrl = proxiedImageUrl(rawSourceImageUrl, { width: 160, height: 160, fit: 'cover' })
  const sourceGroupId = stringValue(record.source_group_id) || stringValue(record.sourceGroupId) || projectId
  return {
    ...record,
    projectId,
    sourceGroupId: sourceGroupId || null,
    sourceImageUrl,
    sourceThumbnailUrl,
    sourceAvailable: booleanValue(record.source_available ?? record.sourceAvailable ?? Boolean(sourceImageUrl)),
    previews: previews.length ? previews : fallbackPreviews.filter((preview) => {
      const previewSourceGroupId = stringValue(preview.sourceGroupId) || stringValue(preview.projectId)
      return Boolean(sourceGroupId && previewSourceGroupId === sourceGroupId)
    }),
  }
}

function normalizeIdentityPreviewRows(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload)
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.previews)
      ? root.previews
      : Array.isArray(root?.results)
        ? root.results
        : Array.isArray(root?.data)
          ? root.data
          : []

  return rows.map(normalizeIdentityPreviewRow).filter((row): row is Record<string, unknown> => Boolean(row))
}

function normalizeIdentityPreviewRow(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const previewId = normalizeId(record.preview_id ?? record.previewId ?? record.id)
  if (!previewId) return null
  const sourceImageRecord = asRecord(record.source_image ?? record.sourceImage)
  const rawSourceImageUrl = stringValue(sourceImageRecord?.url) || stringValue(record.source_image_url) || stringValue(record.sourceImageUrl)
  const sourceImageUrl = proxiedImageUrl(rawSourceImageUrl)
  const sourceThumbnailUrl = proxiedImageUrl(rawSourceImageUrl, { width: 160, height: 160, fit: 'cover' })
  const optionsValue = extractIdentityPreviewOptions(record)

  return {
    ...record,
    previewId,
    status: stringValue(record.status) || null,
    selectedSize: (stringValue(record.size_id) || stringValue(record.selected_size) || stringValue(record.selectedSize) || stringValue(record.size) || null)?.toLowerCase?.() ?? null,
    preferredSize: (stringValue(record.preferred_size) || stringValue(record.preferredSize) || null)?.toLowerCase?.() ?? null,
    variantKey: stringValue(record.variant_key) || stringValue(record.variantKey) || null,
    variantRank: numberValue(record.variant_rank ?? record.variantRank) || null,
    isCurrentVariant: booleanValue(record.is_current_variant ?? record.isCurrentVariant),
    supersededByPreviewId: normalizeId(record.superseded_by_preview_id ?? record.supersededByPreviewId) || null,
    isCurrent: booleanValue(record.is_current_variant ?? record.isCurrentVariant ?? record.is_current ?? record.isCurrent),
    imageUrl: proxiedImageUrl(stringValue(record.image_url) || stringValue(record.imageUrl) || stringValue(record.preview_url) || stringValue(record.previewUrl)),
    sourceImageUrl,
    sourceThumbnailUrl,
    sourceGroupId: stringValue(record.source_group_id) || stringValue(record.sourceGroupId) || stringValue(record.project_id) || stringValue(record.projectId) || null,
    orientation: normalizeOrientation(stringValue(record.orientation) || stringValue(record.frame_orientation) || stringValue(record.frameOrientation) || stringValue(record.product_orientation) || stringValue(record.productOrientation)),
    fixedSize: booleanValue(record.fixed_size ?? record.fixedSize),
    sizeChangeMode: stringValue(record.size_change_mode) || stringValue(record.sizeChangeMode) || null,
    sourceAvailable: booleanValue(record.source_available ?? record.sourceAvailable ?? Boolean(sourceImageUrl)),
    refreshAvailable: booleanValue(record.refresh_available ?? record.refreshAvailable),
    refreshUnavailableReason: stringValue(record.refresh_unavailable_reason) || stringValue(record.refreshUnavailableReason) || null,
    purchaseOptionsAvailable: record.purchase_options_available === undefined && record.purchaseOptionsAvailable === undefined
      ? null
      : booleanValue(record.purchase_options_available ?? record.purchaseOptionsAvailable),
    purchaseOptionsUnavailableReason: stringValue(record.purchase_options_unavailable_reason) || stringValue(record.purchaseOptionsUnavailableReason) || null,
    options: optionsValue.map(normalizeIdentityPreviewOption).filter((option): option is Record<string, unknown> => Boolean(option)),
  }
}

function extractIdentityPreviewOptions(record: Record<string, unknown>): unknown[] {
  const direct = Array.isArray(record.options)
    ? record.options
    : Array.isArray(record.preview_options)
      ? record.preview_options
      : []
  const products = Array.isArray(record.products) ? record.products : []
  const nested = products.flatMap((product) => {
    const productRecord = asRecord(product)
    return Array.isArray(productRecord?.options) ? productRecord.options : []
  })
  return [...direct, ...nested]
}

function normalizeIdentityPreviewOption(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const imageUrl = stringValue(record.image_url) || stringValue(record.imageUrl) || stringValue(record.preview_url) || stringValue(record.previewUrl)
  return {
    previewOptionId: stringValue(record.preview_option_id) || stringValue(record.previewOptionId) || stringValue(record.id),
    label: stringValue(record.label) || stringValue(record.name) || null,
    description: stringValue(record.description) || null,
    orderable: Boolean(record.orderable),
    imageUrl: proxiedImageUrl(imageUrl),
    mockupUrl: proxiedImageUrl(stringValue(record.mockup_url) || stringValue(record.mockupUrl)),
  }
}

function proxiedImageUrl(imageUrl: string, resize?: { width: number; height: number; fit: 'cover' | 'contain' }): string | null {
  if (!imageUrl) return null
  try {
    const parsed = new URL(imageUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return imageUrl
    const proxy = new URL('/api/mge/image', 'https://dottingo.local')
    proxy.searchParams.set('url', parsed.toString())
    if (resize) {
      proxy.searchParams.set('width', String(resize.width))
      proxy.searchParams.set('height', String(resize.height))
      proxy.searchParams.set('fit', resize.fit)
    }
    return `${proxy.pathname}${proxy.search}`
  } catch {
    return imageUrl
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizeContinuePath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  const trimmed = value.trim()
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return '/'
  return trimmed.slice(0, 200)
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return email.slice(0, 254)
}

function isLocalDevelopmentRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname.toLowerCase()
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

function isAuthorizedDevelopmentIdentityBypass(request: Request, env: IdentityEnv): boolean {
  const configuredToken = stringValue(env.DOT_DEV_IDENTITY_LOGIN_TOKEN)
  if (!configuredToken || configuredToken.length < 24) return false
  const suppliedToken = stringValue(request.headers.get('X-Dottingo-Dev-Login-Token'))
  return suppliedToken.length === configuredToken.length && timingSafeEqual(suppliedToken, configuredToken)
}

function isAllowedDevelopmentIdentityEmail(email: string, env: IdentityEnv): boolean {
  const allowed = (env.DOT_DEV_IDENTITY_LOGIN_EMAILS || DEFAULT_DEV_IDENTITY_LOGIN_EMAIL)
    .split(',')
    .map((value) => normalizeEmail(value))
    .filter(Boolean)
  return allowed.includes(normalizeEmail(email))
}

function normalizeId(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const id = String(value).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_./-]{0,127}$/.test(id)) return ''
  return id
}

function normalizePreferredSize(value: unknown): string {
  const normalized = stringValue(value).toUpperCase().replace(/\s+/g, '').replace(/×/g, 'X')
  return /^[0-9]{2}X[0-9]{2}$/.test(normalized) ? normalized : ''
}

function normalizeProduct(value: unknown): string {
  const normalized = stringValue(value).toUpperCase()
  return /^[A-Z0-9_-]{2,24}$/.test(normalized) ? normalized : ''
}

function normalizePreferredOrientation(value: unknown): string {
  const normalized = stringValue(value).trim().toLowerCase()
  if (!normalized) return ''
  if (['horizontal', 'landscape', 'h'].includes(normalized)) return 'horizontal'
  if (['vertical', 'portrait', 'v'].includes(normalized)) return 'vertical'
  return normalized === 'auto' ? 'auto' : ''
}

function normalizeOrientation(value: string): 'horizontal' | 'vertical' | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (['horizontal', 'landscape', 'h'].includes(normalized)) return 'horizontal'
  if (['vertical', 'portrait', 'v'].includes(normalized)) return 'vertical'
  return null
}

function requireSecret(env: IdentityEnv): string {
  if (!env.MAGIC_LINK_SECRET || env.MAGIC_LINK_SECRET.length < 24) {
    throw new Error('MAGIC_LINK_SECRET is not configured')
  }
  return env.MAGIC_LINK_SECRET
}

async function hmacSha256Base64Url(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return base64UrlEncodeBytes(new Uint8Array(signature))
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value))
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecodeText(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return mismatch === 0
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function corsResponse(request: Request, env: IdentityEnv): Response {
  return withCors(new Response(null, { status: 204 }), request, env)
}

function withCors(response: Response, request: Request, env: IdentityEnv): Response {
  const headers = new Headers(response.headers)
  const origin = request.headers.get('Origin')
  const allowedOrigin = env.ALLOWED_ORIGIN || '*'
  if (allowedOrigin === '*' || !origin || origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin === '*' ? '*' : (origin || allowedOrigin))
  }
  headers.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type,X-MGE-Identity-Token,X-Dottingo-Dev-Login-Token')
  headers.set('Cache-Control', 'no-store')
  headers.set('Vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
