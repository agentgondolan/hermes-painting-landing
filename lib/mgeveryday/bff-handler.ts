export interface Env {
  MGEVERYDAY_API_TOKEN?: string
  MGEVERYDAY_BASE_URL?: string
  MGEVERYDAY_BRAND_ID?: string
  ALLOWED_ORIGIN?: string
}

type JsonRecord = Record<string, unknown>

interface NormalizedPreviewOption {
  previewOptionId: string | number
  productCode: string | null
  label: string | null
  description: string | null
  orderable: boolean
  imageUrl: string | null
  mockupUrl: string | null
  orderContract: unknown
}

interface NormalizedPreview {
  previewId: string
  status: string
  imageUrl: string | null
  options: NormalizedPreviewOption[]
}

const DEFAULT_BASE_URL = 'https://www.mgeveryday.sg'
const DEFAULT_BRAND_ID = '116'
const PREVIEW_READY_STATUSES = new Set(['COMPLETED', 'PARTIAL', 'READY'])

export async function handleMgeBffRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return corsResponse(request, env)
  }

  if (url.pathname === '/health' && request.method === 'GET') {
    return withCors(json({ ok: true }), request, env)
  }

  try {
    if (url.pathname === '/api/mge/preview' && request.method === 'POST') {
      return withCors(await createPreview(request, env), request, env)
    }

    if (url.pathname === '/api/mge/image' && request.method === 'GET') {
      return withCors(await proxyPreviewImage(request), request, env)
    }

    const match = url.pathname.match(/^\/api\/mge\/preview\/([^/]+)$/)
    if (match && request.method === 'GET') {
      return withCors(await getPreview(match[1], env), request, env)
    }

    return withCors(json({ error: 'Not found' }, 404), request, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected Worker error'
    return withCors(json({ error: message }, 500), request, env)
  }
}

async function createPreview(request: Request, env: Env): Promise<Response> {
  const token = requireToken(env)
  const incoming = await request.formData()
  const image = incoming.get('image')

  if (!(image instanceof File)) {
    return json({ error: 'Missing image file field' }, 400)
  }

  if (image.size > 25 * 1024 * 1024) {
    return json({ error: 'Image is too large. MGE preview accepts up to 25 MB.' }, 413)
  }

  const preferredSize = normalizePreferredSize(incoming.get('preferredSize'))
  const clientCropped = normalizeBoolean(incoming.get('clientCropped'))
  const body = new FormData()
  body.set('brand_id', env.MGEVERYDAY_BRAND_ID || DEFAULT_BRAND_ID)
  body.set('image', image, image.name || 'upload')
  body.append('products', 'DOT')
  body.set('comparison_count', '1')
  body.set('auto_enhance', 'true')
  body.set('auto_crop', clientCropped ? 'false' : 'true')
  if (preferredSize) {
    body.set('preferred_size', preferredSize)
  }

  // Request multiple DOT preview options (variants)
  const previewOptionsPayload = JSON.stringify({
    DOT: [
      { variant: 'source' },
      { variant: 'drama' },
    ],
  })
  body.set('preview_options', previewOptionsPayload)

  const response = await fetch(`${baseUrl(env)}/api/v1/preview/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })

  return normalizeMgeResponse(response, 201)
}

async function getPreview(previewId: string, env: Env): Promise<Response> {
  const token = requireToken(env)
  const safePreviewId = decodeURIComponent(previewId)

  if (!/^[a-zA-Z0-9_-]+$/.test(safePreviewId)) {
    return json({ error: 'Invalid preview ID' }, 400)
  }

  const response = await fetch(`${baseUrl(env)}/api/v1/preview/${encodeURIComponent(safePreviewId)}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  return normalizeMgeResponse(response)
}

async function proxyPreviewImage(request: Request): Promise<Response> {
  const source = new URL(request.url).searchParams.get('url')
  if (!source) {
    return json({ error: 'Missing image url' }, 400)
  }

  let imageUrl: URL
  try {
    imageUrl = new URL(source)
  } catch {
    return json({ error: 'Invalid image url' }, 400)
  }

  if (!isPublicHttpImageUrl(imageUrl)) {
    return json({ error: 'Preview image url is not allowed' }, 400)
  }

  const upstream = await fetch(imageUrl.toString(), {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  })

  if (!upstream.ok) {
    return json({ error: 'Preview image fetch failed', status: upstream.status }, upstream.status >= 500 ? 502 : upstream.status)
  }

  const contentType = upstream.headers.get('Content-Type') || 'image/jpeg'
  if (!contentType.toLowerCase().startsWith('image/')) {
    return json({ error: 'Preview image response was not an image' }, 502)
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

async function normalizeMgeResponse(response: Response, successStatus = 200): Promise<Response> {
  const text = await response.text()
  const raw = parseJson(text)

  if (!response.ok) {
    return json(
      {
        error: 'MGEeveryday preview request failed',
        status: response.status,
        detail: summarizeMgeError(raw, text),
      },
      response.status >= 500 ? 502 : response.status,
    )
  }

  return json(normalizePreview(raw), successStatus)
}

function normalizePreview(raw: unknown): NormalizedPreview {
  const obj = asRecord(raw)
  const options = extractOptions(obj)
  const imageUrl = pickFirstString([
    ...options.map((option) => option.imageUrl),
    ...options.map((option) => option.mockupUrl),
    obj.image_url,
    obj.preview_url,
    obj.mockup_url,
  ])

  return {
    previewId: String(obj.preview_id ?? obj.id ?? ''),
    status: String(obj.status ?? (imageUrl ? 'READY' : 'UNKNOWN')),
    imageUrl,
    options,
  }
}

function extractOptions(obj: JsonRecord): NormalizedPreviewOption[] {
  const direct = Array.isArray(obj.options) ? obj.options.map((option) => summarizeOption(option, null)) : []
  const products = Array.isArray(obj.products) ? obj.products : []
  const nested = products.flatMap((product) => {
    const productRecord = asRecord(product)
    const productCode = pickFirstString([productRecord.code, productRecord.product, productRecord.product_code])
    const productOptions = Array.isArray(productRecord.options) ? productRecord.options : []
    return productOptions.map((option) => summarizeOption(option, productCode))
  })

  return [...direct, ...nested].filter((option) => option.imageUrl || option.mockupUrl || option.previewOptionId)
}

function summarizeOption(raw: unknown, productCode: string | null): NormalizedPreviewOption {
  const obj = asRecord(raw)
  const imageUrl = pickFirstString([obj.preview_url, obj.image_url, obj.preview_image_url, firstArrayValue(obj.image_urls)])
  const mockupUrl = pickFirstString([obj.mockup_url, obj.mockup_image_url])

  return {
    previewOptionId: String(obj.option_id ?? obj.preview_option_id ?? obj.id ?? ''),
    productCode: productCode ?? pickFirstString([obj.product_code, obj.product]),
    label: pickFirstString([obj.label, obj.name]),
    description: pickFirstString([obj.description]),
    orderable: Boolean(obj.orderable),
    imageUrl,
    mockupUrl,
    orderContract: obj.order_contract ?? null,
  }
}

function normalizePreferredSize(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().toUpperCase()
}

function normalizeBoolean(value: FormDataEntryValue | null): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function requireToken(env: Env): string {
  if (!env.MGEVERYDAY_API_TOKEN) {
    throw new Error('MGEeveryday API token is not configured')
  }
  return env.MGEVERYDAY_API_TOKEN
}

function baseUrl(env: Env): string {
  return (env.MGEVERYDAY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function corsResponse(request: Request, env: Env): Response {
  const origin = allowedOrigin(request, env)
  if (!origin) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = allowedOrigin(request, env)
  if (!origin) return response
  const next = new Response(response.body, response)
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    next.headers.set(key, value)
  }
  return next
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin') || '*'
  const configured = env.ALLOWED_ORIGIN
  if (!configured || configured === '*') return origin
  const allowed = configured.split(',').map((item) => item.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : null
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Request-ID',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function isPublicHttpImageUrl(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

  const hostname = url.hostname.toLowerCase()
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    return false
  }

  return true
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function summarizeMgeError(raw: unknown, text: string): string {
  const obj = asRecord(raw)
  const detail = pickFirstString([obj.detail, obj.error, obj.message])
  return detail || text.slice(0, 500) || 'No response body'
}

function pickFirstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function firstArrayValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : null
}
