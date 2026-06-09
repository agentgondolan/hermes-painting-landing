const IDENTITY_STORAGE_KEY = 'dottingo_verified_identity_v1'

export type StoredIdentity = {
  email: string
  previewId: string
  identityToken: string
  mgeIdentityToken?: string | null
  expiresAt: number
}

type MagicLinkResponse = {
  ok?: boolean
  delivery?: 'email_sent' | 'accepted'
  emailStatus?: string
  requestId?: string
  error?: string
}

type MagicLinkStatusResponse = MagicLinkResponse & {
  terminal?: boolean
}

type VerifyResponse = {
  ok?: boolean
  email?: string
  previewId?: string
  identityToken?: string
  mgeIdentityToken?: string | null
  expiresInSeconds?: number
  error?: string
}

export type IdentityPreviewRow = {
  previewId: string
  status?: string | null
  selectedSize?: string | null
  imageUrl?: string | null
  sourceImageUrl?: string | null
  options: Array<{
    previewOptionId: string | number
    label: string | null
    description: string | null
    orderable: boolean
    imageUrl: string | null
    mockupUrl: string | null
    [key: string]: unknown
  }>
}

export async function verifyMagicToken(token: string): Promise<StoredIdentity> {
  const response = await fetch('/api/identity/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const payload = await response.json().catch(() => null) as VerifyResponse | null

  if (!response.ok || !payload?.identityToken || !payload.email || !payload.previewId) {
    throw new Error(payload?.error || 'Magic link verification failed')
  }

  const identity: StoredIdentity = {
    email: payload.email,
    previewId: payload.previewId,
    identityToken: payload.identityToken,
    mgeIdentityToken: payload.mgeIdentityToken ?? null,
    expiresAt: Date.now() + (payload.expiresInSeconds ?? 0) * 1000,
  }
  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  return identity
}

export function buildVerifiedDesignReturnPath(identity: Pick<StoredIdentity, 'previewId'>): string {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('preview_id', identity.previewId)
  const sizeId = readRestoredPreviewSizeId(identity.previewId)
  if (sizeId) url.searchParams.set('size_id', sizeId)
  url.searchParams.set('identity_verified', '1')
  return `${url.pathname}${url.search}`
}

function readRestoredPreviewSizeId(previewId: string): string | null {
  try {
    const raw = window.localStorage.getItem('dottingo.checkout.restore.v1')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { preview?: { selectedSize?: { id?: unknown }; dotPreviews?: Record<string, { previewId?: unknown }> } }
    const sizeId = parsed.preview?.selectedSize?.id
    if (typeof sizeId !== 'string') return null
    const restoredPreviewId = parsed.preview?.dotPreviews?.[sizeId]?.previewId
    return restoredPreviewId === previewId ? sizeId : null
  } catch {
    return null
  }
}

export function readVerifiedIdentity(previewId?: string | null): StoredIdentity | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY)
  if (!raw) return null

  try {
    const identity = JSON.parse(raw) as StoredIdentity
    if (!identity.email || !identity.previewId || !identity.identityToken || identity.expiresAt <= Date.now()) {
      clearVerifiedIdentity()
      return null
    }
    if (previewId && identity.previewId !== previewId) return null
    return identity
  } catch {
    clearVerifiedIdentity()
    return null
  }
}

export function clearVerifiedIdentity() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(IDENTITY_STORAGE_KEY)
}

export async function requestDesignMagicLink(email: string, previewId: string, sizeId?: string | null): Promise<MagicLinkResponse> {
  const url = new URL(window.location.href)
  url.searchParams.delete('magic_token')
  if (sizeId) url.searchParams.set('size_id', sizeId)
  const continuePath = `${url.pathname}${url.search}${url.hash}` || '/'

  const response = await fetch('/api/identity/request-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      preview_id: previewId,
      continue_path: continuePath,
    }),
  })
  const payload = await response.json().catch(() => null) as MagicLinkResponse | null
  if (!response.ok) throw new Error(payload?.error || 'Could not send magic link')
  return payload ?? { ok: true }
}

export async function pollMagicLinkRequestStatus(requestId: string): Promise<MagicLinkStatusResponse> {
  const response = await fetch(`/api/identity/magic-link/requests/${encodeURIComponent(requestId)}`, {
    method: 'GET',
  })
  const payload = await response.json().catch(() => null) as MagicLinkStatusResponse | null
  if (!response.ok) throw new Error(payload?.error || 'Could not check magic link status')
  return payload ?? { ok: true, terminal: false }
}

export async function fetchVerifiedIdentityPreviews(identity: StoredIdentity): Promise<IdentityPreviewRow[]> {
  if (!identity.mgeIdentityToken) return []

  const response = await fetch('/api/identity/previews', {
    method: 'GET',
    headers: { 'X-MGE-Identity-Token': identity.mgeIdentityToken },
  })
  const payload = await response.json().catch(() => null) as { previews?: IdentityPreviewRow[]; error?: string } | null
  if (!response.ok) throw new Error(payload?.error || 'Could not load verified previews')
  return payload?.previews ?? []
}

export async function consumeMagicTokenFromUrl(): Promise<StoredIdentity | null> {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const token = url.searchParams.get('magic_token') ?? url.searchParams.get('token')
  if (!token) return null

  url.searchParams.delete('magic_token')
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)

  return verifyMagicToken(token)
}

export function consumeVerifiedIdentityNoticeFromUrl(): StoredIdentity | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  if (url.searchParams.get('identity_verified') !== '1') return null

  const previewId = url.searchParams.get('preview_id')
  const identity = readVerifiedIdentity(previewId)
  url.searchParams.delete('identity_verified')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  return identity
}
