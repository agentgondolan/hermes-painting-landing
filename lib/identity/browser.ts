const IDENTITY_STORAGE_KEY = 'dottingo_verified_identity_v1'

type StoredIdentity = {
  email: string
  previewId: string
  identityToken: string
  expiresAt: number
}

type MagicLinkResponse = {
  ok?: boolean
  delivery?: 'email_sent' | 'accepted'
  error?: string
}

type VerifyResponse = {
  ok?: boolean
  email?: string
  previewId?: string
  identityToken?: string
  expiresInSeconds?: number
  error?: string
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
    expiresAt: Date.now() + (payload.expiresInSeconds ?? 0) * 1000,
  }
  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  return identity
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

export async function requestDesignMagicLink(email: string, previewId: string): Promise<MagicLinkResponse> {
  const url = new URL(window.location.href)
  url.searchParams.delete('magic_token')
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
