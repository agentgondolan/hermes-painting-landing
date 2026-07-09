const IDENTITY_STORAGE_KEY = 'dottingo_verified_identity_v1'
const CANONICAL_IDENTITY_HOST = 'dottingo.sg'
const DEV_IDENTITY_EMAIL = 'matejgondolan@gmail.com'
export const VERIFIED_IDENTITY_CHANGED_EVENT = 'dottingo_verified_identity_changed'

export type StoredIdentity = {
  email: string
  previewId: string | null
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
  previewId?: string | null
  identityToken?: string
  mgeIdentityToken?: string | null
  expiresInSeconds?: number
  error?: string
}

export type IdentityPreviewOption = {
  previewOptionId: string | number
  label: string | null
  description: string | null
  orderable: boolean
  imageUrl: string | null
  mockupUrl: string | null
  [key: string]: unknown
}

export type IdentityPreviewRow = {
  previewId: string
  status?: string | null
  selectedSize?: string | null
  preferredSize?: string | null
  isCurrent?: boolean
  variantKey?: string | null
  variantRank?: number | null
  isCurrentVariant?: boolean
  supersededByPreviewId?: string | null
  imageUrl?: string | null
  sourceImageUrl?: string | null
  sourceGroupId?: string | null
  orientation?: 'horizontal' | 'vertical' | null
  fixedSize?: boolean
  sizeChangeMode?: string | null
  sourceAvailable?: boolean
  refreshAvailable?: boolean
  refreshUnavailableReason?: string | null
  purchaseOptionsAvailable?: boolean | null
  purchaseOptionsUnavailableReason?: string | null
  options: IdentityPreviewOption[]
  [key: string]: unknown
}

export type IdentityPreviewProject = {
  projectId: string | null
  sourceGroupId?: string | null
  sourceImageUrl?: string | null
  sourceAvailable?: boolean
  previews: IdentityPreviewRow[]
  [key: string]: unknown
}

export type IdentityPreviewLibrary = {
  previews: IdentityPreviewRow[]
  projects: IdentityPreviewProject[]
}

export type IdentityProjectVariantCrop = {
  sourceWidth: number
  sourceHeight: number
  cropWidth: number
  cropHeight: number
  offsetX: number
  offsetY: number
  zoom?: number | null
  normalized?: {
    x: number
    y: number
    width: number
    height: number
  } | null
}

export type IdentityProjectVariantOptions = {
  orientation?: 'horizontal' | 'vertical' | null
  crop?: IdentityProjectVariantCrop | null
}

export async function verifyMagicToken(token: string): Promise<StoredIdentity> {
  const response = await fetch('/api/identity/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const payload = await response.json().catch(() => null) as VerifyResponse | null

  if (!response.ok || !payload?.identityToken || !payload.email) {
    throw new Error(payload?.error || 'Magic link verification failed')
  }

  const identity: StoredIdentity = {
    email: payload.email,
    previewId: payload.previewId ?? null,
    identityToken: payload.identityToken,
    mgeIdentityToken: payload.mgeIdentityToken ?? null,
    expiresAt: Date.now() + (payload.expiresInSeconds ?? 0) * 1000,
  }
  saveVerifiedIdentity(identity)
  return identity
}

export function saveVerifiedIdentity(identity: StoredIdentity) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity))
  window.dispatchEvent(new CustomEvent(VERIFIED_IDENTITY_CHANGED_EVENT))
}

export function isDevelopmentIdentityLoginAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname.toLowerCase())
}

export async function developmentLoginVerifiedIdentity(email = DEV_IDENTITY_EMAIL, previewId: string | null = null): Promise<StoredIdentity> {
  if (!isDevelopmentIdentityLoginAvailable()) {
    throw new Error('Development login is only available on localhost')
  }

  const response = await fetch('/api/identity/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(previewId ? { preview_id: previewId } : {}),
    }),
  })
  const payload = await response.json().catch(() => null) as VerifyResponse | null

  if (!response.ok || !payload?.identityToken || !payload.email) {
    throw new Error(payload?.error || 'Development login failed')
  }

  const identity: StoredIdentity = {
    email: payload.email,
    previewId: payload.previewId ?? null,
    identityToken: payload.identityToken,
    mgeIdentityToken: payload.mgeIdentityToken ?? null,
    expiresAt: Date.now() + (payload.expiresInSeconds ?? 0) * 1000,
  }
  saveVerifiedIdentity(identity)
  return identity
}

export function buildVerifiedDesignReturnPath(identity: Pick<StoredIdentity, 'previewId'>): string {
  const url = new URL('/', window.location.origin)
  if (identity.previewId) {
    url.searchParams.set('preview_id', identity.previewId)
    const sizeId = readRestoredPreviewSizeId(identity.previewId)
    if (sizeId) url.searchParams.set('size_id', sizeId)
  }
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
    if (!identity.email || !identity.identityToken || identity.expiresAt <= Date.now()) {
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
  window.dispatchEvent(new CustomEvent(VERIFIED_IDENTITY_CHANGED_EVENT))
}

export async function requestDesignMagicLink(email: string, previewId: string | null, sizeId?: string | null): Promise<MagicLinkResponse> {
  const url = new URL(window.location.href)
  url.searchParams.delete('magic_token')
  if (previewId && sizeId) url.searchParams.set('size_id', sizeId)
  const continuePath = `${url.pathname}${url.search}${url.hash}` || '/'

  const response = await fetch('/api/identity/request-magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      ...(previewId ? { preview_id: previewId } : {}),
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

export async function fetchVerifiedIdentityPreviews(identity: StoredIdentity): Promise<IdentityPreviewLibrary> {
  if (!identity.mgeIdentityToken) return { previews: [], projects: [] }

  const response = await fetch(`/api/identity/previews?ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'X-MGE-Identity-Token': identity.mgeIdentityToken },
  })
  const payload = await response.json().catch(() => null) as { previews?: IdentityPreviewRow[]; projects?: IdentityPreviewProject[]; error?: string } | null
  if (!response.ok) throw new Error(payload?.error || 'Could not load verified previews')
  return {
    previews: payload?.previews ?? [],
    projects: payload?.projects ?? [],
  }
}

export async function attachVerifiedIdentityPreview(identity: StoredIdentity, previewId: string): Promise<IdentityPreviewRow | null> {
  if (!identity.mgeIdentityToken) throw new Error('Verified account token is missing')

  const response = await fetch('/api/identity/attach-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MGE-Identity-Token': identity.mgeIdentityToken,
    },
    body: JSON.stringify({ preview_id: previewId }),
  })
  const payload = await response.json().catch(() => null) as { preview?: IdentityPreviewRow | null; error?: string } | null
  if (!response.ok) throw new Error(payload?.error || 'Could not save preview to verified account')
  return payload?.preview ?? null
}

export async function createVerifiedIdentityProjectPreview(
  identity: StoredIdentity,
  sourceGroupId: string,
  preferredSize: string,
  options: IdentityProjectVariantOptions = {},
): Promise<IdentityPreviewRow | null> {
  if (!identity.mgeIdentityToken) throw new Error('Verified account token is missing')

  const hasCrop = Boolean(options.crop)
  const response = await fetch(`/api/identity/projects/${encodeURIComponent(sourceGroupId)}/previews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MGE-Identity-Token': identity.mgeIdentityToken,
    },
    body: JSON.stringify({
      preferred_size: preferredSize,
      product: 'DOT',
      ...(options.orientation ? { preferred_orientation: options.orientation } : {}),
      ...(hasCrop ? {
        auto_crop: false,
        product_params: {
          crop: options.crop,
          manual_crop: options.crop,
          preferred_orientation: options.orientation ?? null,
        },
        preview_options: {
          crop: options.crop,
          manual_crop: options.crop,
          preferred_orientation: options.orientation ?? null,
        },
      } : {}),
    }),
  })
  const payload = await response.json().catch(() => null) as { preview?: IdentityPreviewRow | null; error?: string } | null
  if (!response.ok) throw new Error(payload?.error || 'Could not generate saved size variant')
  return payload?.preview ?? null
}

export async function deleteVerifiedIdentityPreview(identity: StoredIdentity, previewId: string): Promise<void> {
  if (!identity.mgeIdentityToken) throw new Error('Verified account token is missing')

  const response = await fetch(`/api/identity/previews/${encodeURIComponent(previewId)}`, {
    method: 'DELETE',
    headers: { 'X-MGE-Identity-Token': identity.mgeIdentityToken },
  })
  const payload = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(payload?.error || 'Could not delete saved preview')
}

export async function deleteVerifiedIdentityProject(identity: StoredIdentity, sourceGroupId: string): Promise<void> {
  if (!identity.mgeIdentityToken) throw new Error('Verified account token is missing')

  const response = await fetch(`/api/identity/projects/${encodeURIComponent(sourceGroupId)}`, {
    method: 'DELETE',
    headers: { 'X-MGE-Identity-Token': identity.mgeIdentityToken },
  })
  const payload = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(payload?.error || 'Could not delete saved design')
}

export async function consumeMagicTokenFromUrl(): Promise<StoredIdentity | null> {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const token = url.searchParams.get('magic_token') ?? url.searchParams.get('token')
  if (!token) return null
  if (redirectMagicLinkToCanonicalOrigin(url)) return null

  url.searchParams.delete('magic_token')
  url.searchParams.delete('token')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)

  return verifyMagicToken(token)
}

export function redirectMagicLinkToCanonicalOrigin(url = typeof window !== 'undefined' ? new URL(window.location.href) : null): boolean {
  if (typeof window === 'undefined' || !url) return false
  if (!url.searchParams.get('magic_token') && !url.searchParams.get('token')) return false
  if (!shouldUseCanonicalIdentityOrigin(url)) return false

  const canonicalUrl = new URL(url.pathname + url.search + url.hash, `https://${CANONICAL_IDENTITY_HOST}`)
  window.location.replace(canonicalUrl.toString())
  return true
}

function shouldUseCanonicalIdentityOrigin(url: URL): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  if (host === CANONICAL_IDENTITY_HOST) return false
  return host === `www.${CANONICAL_IDENTITY_HOST}` || host.endsWith('.pages.dev')
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
