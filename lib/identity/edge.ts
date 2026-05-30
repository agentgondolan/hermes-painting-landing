export interface IdentityEnv {
  MAGIC_LINK_SECRET?: string
  MAGIC_LINK_FROM?: string
  RESEND_API_KEY?: string
  APP_BASE_URL?: string
  ALLOWED_ORIGIN?: string
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

    const magicToken = await createMagicToken({ email, previewId }, env)
    const magicLink = buildMagicLink(request, env, magicToken, continuePath)
    const delivery = await sendMagicLinkEmail(email, magicLink, env, fetcher)

    return withCors(
      json({
        ok: true,
        delivery,
        expiresInSeconds: MAGIC_LINK_TTL_SECONDS,
        // Local/dev fallback so the flow remains testable before email provider secrets are configured.
        magicLink: delivery === 'email_sent' ? undefined : magicLink,
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
    const identity = await verifyMagicToken(token, env, 'magic_link')
    const identityToken = await createIdentitySessionToken(identity, env)

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
): Promise<'email_sent' | 'email_not_configured'> {
  const magicToken = await createMagicToken(identity, env)
  const magicLink = buildMagicLink(request, env, magicToken, '/')
  return sendMagicLinkEmail(identity.email, magicLink, env, fetcher)
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
