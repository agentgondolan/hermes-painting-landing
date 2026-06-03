export interface IdentityEnv {
  MAGIC_LINK_SECRET?: string
  MAGIC_LINK_FROM?: string
  RESEND_API_KEY?: string
  APP_BASE_URL?: string
  ALLOWED_ORIGIN?: string
  MGEVERYDAY_API_TOKEN?: string
  MGEVERYDAY_BASE_URL?: string
  MGEVERYDAY_BRAND_ID?: string
}

export type VerifiedIdentity = {
  email: string
  previewId: string
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

const MAGIC_LINK_TTL_SECONDS = 30 * 60
const IDENTITY_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_MGEVERYDAY_BASE_URL = 'https://www.mgeveryday.sg'
const DOTTINGO_BRAND_ID = 64
const RESEND_API_URL = 'https://api.resend.com/emails'

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
    if (!previewId) return withCors(json({ error: 'preview_id is required' }, 400), request, env)

    const upstream = await requestMgeMagicLink({ email, previewId, continuePath }, env, fetcher)
    const delivery = upstream.status === 'sent' ? 'email_sent' : 'accepted'
    const magicLink = delivery === 'accepted'
      ? buildMagicLink(request, env, await createMagicToken({ email, previewId }, env), continuePath)
      : undefined

    return withCors(
      json({
        ok: true,
        delivery,
        expiresInSeconds: upstream.expiresInSeconds || MAGIC_LINK_TTL_SECONDS,
        ...(magicLink ? { magicLink } : {}),
      }),
      request,
      env,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send magic link'
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
  return upstream.status === 'sent' ? 'email_sent' : 'accepted'
}

type MgeMagicLinkRequestResult = {
  status: string
  expiresInSeconds: number
}

type MgeMagicLinkIdentity = Pick<VerifiedIdentity, 'email' | 'previewId'> & {
  expiresInSeconds: number
}

async function requestMgeMagicLink(
  identity: Pick<VerifiedIdentity, 'email' | 'previewId'> & { continuePath: string },
  env: IdentityEnv,
  fetcher: typeof fetch,
): Promise<MgeMagicLinkRequestResult> {
  const response = await fetcher(`${mgeBaseUrl(env)}/api/internal/v1/identity/magic-link/request/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireMgeToken(env)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': await idempotencyKey(identity.email, identity.previewId, identity.continuePath),
    },
    body: JSON.stringify({
      brand_id: mgeBrandId(),
      email: normalizeEmail(identity.email),
      preview_id: normalizeId(identity.previewId),
      continue_path: normalizeContinuePath(identity.continuePath),
    }),
  })
  const payload = parseJson(await response.text())
  if (!response.ok) {
    throw new Error(mgeErrorMessage(payload, 'MGE rejected the magic link request'))
  }

  const record = asRecord(payload)
  return {
    status: stringValue(record?.status) || 'accepted',
    expiresInSeconds: numberValue(record?.expires_in_seconds) || MAGIC_LINK_TTL_SECONDS,
  }
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
  const previewId = normalizeId(record?.preview_id)
  if (!email || !previewId) throw new Error('MGE magic link response is incomplete')

  return {
    email,
    previewId,
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
  const previewId = normalizeId(payload.previewId)

  if (payload.typ !== type) throw new Error('Magic link has the wrong purpose')
  if (!email || !previewId || typeof payload.exp !== 'number') throw new Error('Magic link is incomplete')
  if (payload.exp < now) throw new Error('Magic link has expired')

  return { email, previewId, exp: payload.exp }
}

async function signPayload(payload: MagicLinkPayload, env: IdentityEnv): Promise<string> {
  if (!payload.email || !payload.previewId) throw new Error('Identity payload is incomplete')
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

function mgeErrorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload)
  return stringValue(record?.error) || stringValue(record?.detail) || fallback
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

function normalizeId(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const id = String(value).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_./-]{0,127}$/.test(id)) return ''
  return id
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
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
