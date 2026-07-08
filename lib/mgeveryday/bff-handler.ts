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
  sourceImageUrl: string | null
  sourceGroupId: string | null
  orientation: 'horizontal' | 'vertical' | null
  options: NormalizedPreviewOption[]
}

export interface NormalizedPurchaseOption {
  purchaseOptionId: string
  previewOptionId: string
  sku: string | null
  product: string | null
  label: string | null
  description: string | null
  previewUrl: string | null
  mockupUrl: string | null
  frame: JsonRecord | null
  frameCode: string | null
  frameLabel: string | null
  productionSpeed: JsonRecord | null
  productionSpeedCode: string | null
  productionSpeedLabel: string | null
  orderLine: JsonRecord | null
  unitPrice: string | null
  currency: string | null
}

interface NormalizedPurchaseOptionsResponse {
  previewId: string
  status: string
  purchaseOptions: NormalizedPurchaseOption[]
}

interface NormalizedOrderDraft {
  orderDraftId: string
  previewId: string
  previewOptionId: string
  purchaseOptionId: string
  sku: string | null
  status: string
  product: string | null
  selectedSize: string | null
  productionSpeedCode: string | null
  productionSpeedLabel: string | null
  orderLine: JsonRecord | null
  lineItems: JsonRecord[]
  itemCount: number
  unitPrice: string | null
  currency: string | null
}

interface CartDraftLineInput {
  previewId: string
  previewOptionId: string
  sku: string
  quantity: number
  selectedSize: string | null
}

const DEFAULT_BASE_URL = 'https://www.mgeveryday.sg'
const DOTTINGO_BRAND_ID = '64'
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

    if (url.pathname === '/api/mge/order-draft' && request.method === 'POST') {
      return withCors(await createOrderDraft(request, env), request, env)
    }

    const purchaseOptionsMatch = url.pathname.match(/^\/api\/mge\/preview\/([^/]+)\/purchase-options$/)
    if (purchaseOptionsMatch && request.method === 'GET') {
      return withCors(await getPurchaseOptions(purchaseOptionsMatch[1], env), request, env)
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
  body.set('brand_id', DOTTINGO_BRAND_ID)
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

  return normalizeMgeResponse(response, 201, token)
}

async function getPreview(previewId: string, env: Env): Promise<Response> {
  const token = requireToken(env)
  const safePreviewId = normalizePreviewId(previewId)

  if (!safePreviewId) {
    return json({ error: 'Invalid preview ID' }, 400)
  }

  const response = await fetch(`${baseUrl(env)}/api/v1/preview/${encodeURIComponent(safePreviewId)}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  return normalizeMgeResponse(response, 200, token)
}

async function getPurchaseOptions(previewId: string, env: Env): Promise<Response> {
  const token = requireToken(env)
  const safePreviewId = normalizePreviewId(previewId)

  if (!safePreviewId) {
    return json({ error: 'Invalid preview ID' }, 400)
  }

  const response = await fetch(`${baseUrl(env)}/api/v1/preview/${encodeURIComponent(safePreviewId)}/purchase-options/`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  return normalizeMgePurchaseOptionsResponse(response, token)
}


async function createOrderDraft(request: Request, env: Env): Promise<Response> {
  const token = requireToken(env)
  const raw = await request.json().catch(() => null)
  const body = asRecord(raw)
  const existingDraftId = normalizeId(String(body.order_draft_id ?? ''))

  if (Array.isArray(body.cart_lines)) {
    return syncCartOrderDraft(body, existingDraftId, env, token)
  }

  const previewId = normalizePreviewId(String(body.preview_id ?? ''))
  const previewOptionId = normalizeId(String(body.preview_option_id ?? ''))
  const sku = normalizeSku(String(body.sku ?? body.purchase_option_id ?? ''))

  if (!previewId) return json({ error: 'preview_id is required' }, 400)
  if (!previewOptionId) return json({ error: 'preview_option_id is required' }, 400)
  if (!sku) return json({ error: 'sku is required' }, 400)

  const canonical = await loadCanonicalPurchaseOption(previewId, previewOptionId, sku, env, token)
  if (!canonical) {
    return json({ error: 'Selected MGE purchase option is no longer orderable' }, 409)
  }

  const existingLineItems = existingDraftId ? await loadOrderDraftLineItems(existingDraftId, env, token) : []
  const shippingAddress = sanitizeShippingAddress(body.delivery_address)
  const nextLineItems = canonical.orderLine ? [...existingLineItems, canonical.orderLine] : existingLineItems
  if (!nextLineItems.length) return json({ error: 'Selected MGE purchase option has no order line' }, 409)

  const draftPayload = {
    brand_id: DOTTINGO_BRAND_ID,
    preview_id: previewId,
    preview_option_id: previewOptionId,
    selected_size: pickFirstString([body.selected_size]),
    product: canonical.product ?? 'DOT',
    shipping_address: Object.keys(shippingAddress).length ? shippingAddress : undefined,
    line_items: nextLineItems,
    source: 'dottingo_landing',
  }

  const response = await fetch(
    existingDraftId
      ? `${baseUrl(env)}/api/v1/order-drafts/${encodeURIComponent(existingDraftId)}/`
      : `${baseUrl(env)}/api/v1/order-drafts/`,
    {
      method: existingDraftId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftPayload),
    },
  )

  return normalizeMgeOrderDraftResponse(response, canonical, token)
}

async function syncCartOrderDraft(body: JsonRecord, existingDraftId: string | null, env: Env, token: string): Promise<Response> {
  const rawCartLines = Array.isArray(body.cart_lines) ? body.cart_lines : []
  const cartLines = normalizeCartDraftLines(rawCartLines)
  if (cartLines.length !== rawCartLines.length) {
    return json({ error: 'Each cart line requires preview_id, preview_option_id, and sku' }, 400)
  }
  if (!cartLines.length && !existingDraftId) {
    return json(emptyOrderDraft())
  }

  const canonicalLines: Array<{ input: CartDraftLineInput; option: NormalizedPurchaseOption }> = []
  for (const line of cartLines) {
    const canonical = await loadCanonicalPurchaseOption(line.previewId, line.previewOptionId, line.sku, env, token)
    if (!canonical) {
      return json({ error: 'Selected MGE cart line is no longer orderable', preview_id: line.previewId, preview_option_id: line.previewOptionId }, 409)
    }
    canonicalLines.push({ input: line, option: canonical })
  }

  const lineItems = canonicalLines.map(({ input, option }) => ({
    ...(option.orderLine ?? {}),
    quantity: input.quantity,
  }))

  const firstLine = canonicalLines[0] ?? null
  const draftPayload = {
    brand_id: DOTTINGO_BRAND_ID,
    product: 'DOT',
    line_items: lineItems,
    source: 'dottingo_cart',
  }

  const response = await fetch(
    existingDraftId
      ? `${baseUrl(env)}/api/v1/order-drafts/${encodeURIComponent(existingDraftId)}/`
      : `${baseUrl(env)}/api/v1/order-drafts/`,
    {
      method: existingDraftId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftPayload),
    },
  )

  return normalizeMgeOrderDraftResponse(response, firstLine?.option ?? emptyCanonicalPurchaseOption(), token)
}

export async function loadCanonicalPurchaseOption(
  previewId: string,
  previewOptionId: string,
  sku: string,
  env: Env,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<NormalizedPurchaseOption | null> {
  const response = await fetcher(`${baseUrl(env)}/api/v1/preview/${encodeURIComponent(previewId)}/purchase-options/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const raw = parseJson(await response.text())
  const options = normalizePurchaseOptions(raw).purchaseOptions
  return options.find((option) => {
    if (option.previewOptionId !== previewOptionId) return false
    if (option.sku !== sku) return false
    return Boolean(option.orderLine && option.unitPrice)
  }) ?? null
}

async function loadOrderDraftLineItems(draftId: string, env: Env, token: string): Promise<JsonRecord[]> {
  const response = await fetch(`${baseUrl(env)}/api/v1/order-drafts/${encodeURIComponent(draftId)}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return []
  const raw = parseJson(await response.text())
  return extractLineItems(raw)
}

function extractLineItems(raw: unknown): JsonRecord[] {
  const obj = asRecord(raw)
  const direct = Array.isArray(obj.line_items) ? obj.line_items : []
  return direct.map(asRecord).filter((item) => Object.keys(item).length)
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
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
      'Vary': 'Accept',
    },
  })
}

async function normalizeMgeResponse(response: Response, successStatus = 200, secretToRedact?: string): Promise<Response> {
  const text = await response.text()
  const raw = parseJson(text)

  if (!response.ok) {
    return json(
      {
        error: 'MGEeveryday preview request failed',
        status: response.status,
        detail: summarizeMgeError(raw, text, secretToRedact),
      },
      response.status >= 500 ? 502 : response.status,
    )
  }

  return json(normalizePreview(raw), successStatus)
}

async function normalizeMgePurchaseOptionsResponse(response: Response, secretToRedact?: string): Promise<Response> {
  const text = await response.text()
  const raw = parseJson(text)

  if (!response.ok) {
    return json(
      {
        error: 'MGEeveryday purchase options request failed',
        status: response.status,
        detail: summarizeMgeError(raw, text, secretToRedact),
      },
      response.status >= 500 ? 502 : response.status,
    )
  }

  return json(normalizePurchaseOptions(raw))
}

export function normalizePurchaseOptions(raw: unknown): NormalizedPurchaseOptionsResponse {
  const obj = asRecord(raw)
  const purchaseOptions = Array.isArray(obj.purchase_options)
    ? obj.purchase_options.map(normalizePurchaseOption).filter((option) => option.previewOptionId && option.orderLine)
    : []

  return {
    previewId: String(obj.preview_id ?? obj.id ?? ''),
    status: String(obj.status ?? (purchaseOptions.length ? 'COMPLETED' : 'UNKNOWN')),
    purchaseOptions,
  }
}


async function normalizeMgeOrderDraftResponse(
  response: Response,
  canonical: NormalizedPurchaseOption,
  secretToRedact?: string,
): Promise<Response> {
  const text = await response.text()
  const raw = parseJson(text)

  if (!response.ok) {
    return json(
      {
        error: 'MGEeveryday order draft request failed',
        status: response.status,
        detail: summarizeMgeError(raw, text, secretToRedact),
      },
      response.status >= 500 ? 502 : response.status,
    )
  }

  return json(normalizeOrderDraft(raw, canonical), response.status === 201 ? 201 : 200)
}

export function normalizeOrderDraft(raw: unknown, canonical: NormalizedPurchaseOption): NormalizedOrderDraft {
  const obj = asRecord(raw)
  const lineItems = extractLineItems(raw)
  const orderLine = asNullableRecord(obj.order_line) ?? lineItems.at(-1) ?? canonical.orderLine
  const previewOptionId = pickFirstString([obj.preview_option_id, canonical.previewOptionId]) ?? canonical.previewOptionId
  return {
    orderDraftId: pickFirstString([obj.order_draft_id, obj.draft_id, obj.id]) ?? `${canonical.previewOptionId}:${canonical.purchaseOptionId}`,
    previewId: pickFirstString([obj.preview_id]) ?? '',
    previewOptionId,
    purchaseOptionId: pickFirstString([obj.purchase_option_id, canonical.purchaseOptionId]) ?? canonical.purchaseOptionId,
    sku: pickFirstString([obj.sku, orderLine?.sku, canonical.sku]),
    status: pickFirstString([obj.status]) ?? 'DRAFT',
    product: pickFirstString([obj.product, obj.product_code, canonical.product]),
    selectedSize: pickFirstString([obj.selected_size]),
    productionSpeedCode: pickFirstString([obj.production_speed_code, canonical.productionSpeedCode]),
    productionSpeedLabel: pickFirstString([obj.production_speed_label, canonical.productionSpeedLabel]),
    orderLine,
    lineItems,
    itemCount: Number(obj.item_count ?? lineItems.length) || lineItems.length,
    unitPrice: pickFirstString([obj.unit_price, obj.price, canonical.unitPrice]),
    currency: pickFirstString([obj.currency, canonical.currency]),
  }
}

function normalizePurchaseOption(raw: unknown): NormalizedPurchaseOption {
  const obj = asRecord(raw)
  const orderLine = asNullableRecord(obj.order_line)
  const previewOptionId = String(obj.preview_option_id ?? obj.option_id ?? obj.id ?? orderLine?.preview_option_id ?? '')
  const frame = asNullableRecord(obj.frame)
  const frameCode = pickFirstString([frame?.code, obj.frame_code])
  const frameLabel = pickFirstString([frame?.label, obj.frame_label, frameCode])
  const productionSpeed = asNullableRecord(obj.production_speed)
  const productionSpeedCode = pickFirstString([productionSpeed?.code, obj.production_speed_code])
  const productionSpeedLabel = pickFirstString([productionSpeed?.label, obj.production_speed_label, productionSpeedCode])
  const sku = pickFirstString([orderLine?.sku])

  return {
    purchaseOptionId: pickFirstString([obj.purchase_option_id, sku, [previewOptionId, productionSpeedCode].filter(Boolean).join(':'), obj.id]) ?? previewOptionId,
    previewOptionId,
    sku,
    product: pickFirstString([obj.product, obj.product_code]),
    label: pickFirstString([obj.label, obj.name]),
    description: pickFirstString([obj.description]),
    previewUrl: pickFirstString([obj.preview_url, obj.image_url, obj.preview_image_url]),
    mockupUrl: pickFirstString([obj.mockup_url, obj.mockup_image_url]),
    frame,
    frameCode,
    frameLabel,
    productionSpeed,
    productionSpeedCode,
    productionSpeedLabel,
    orderLine,
    unitPrice: pickFirstString([obj.unit_price, obj.price]),
    currency: pickFirstString([obj.currency]),
  }
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
    sourceImageUrl: sourceImageUrl(obj),
    sourceGroupId: pickFirstString([obj.source_group_id, obj.sourceGroupId, obj.project_id, obj.projectId]),
    orientation: normalizeOrientation(pickFirstString([obj.orientation, obj.frame_orientation, obj.frameOrientation, obj.product_orientation, obj.productOrientation])),
    options,
  }
}

function sourceImageUrl(obj: JsonRecord): string | null {
  const sourceImage = asRecord(obj.source_image)
  return pickFirstString([
    sourceImage.url,
    obj.source_image_url,
    obj.sourceImageUrl,
  ])
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

function normalizeOrientation(value: string | null): 'horizontal' | 'vertical' | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if (['horizontal', 'landscape', 'h'].includes(normalized)) return 'horizontal'
  if (['vertical', 'portrait', 'v'].includes(normalized)) return 'vertical'
  return null
}

function requireToken(env: Env): string {
  if (!env.MGEVERYDAY_API_TOKEN) {
    throw new Error('MGEeveryday API token is not configured')
  }
  return env.MGEVERYDAY_API_TOKEN
}

function normalizePreviewId(previewId: string): string | null {
  return normalizeId(previewId)
}

function normalizeId(value: string): string | null {
  const decoded = decodeURIComponent(value).trim()
  return /^[a-zA-Z0-9_:-]+$/.test(decoded) ? decoded : null
}

function normalizeSku(value: string): string | null {
  const decoded = decodeURIComponent(value).trim()
  return /^[a-zA-Z0-9_./:-]+$/.test(decoded) ? decoded : null
}

function normalizeCartDraftLines(value: unknown): CartDraftLineInput[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw) => {
      const record = asRecord(raw)
      const previewId = normalizePreviewId(String(record.preview_id ?? record.previewId ?? ''))
      const previewOptionId = normalizeId(String(record.preview_option_id ?? record.previewOptionId ?? ''))
      const sku = normalizeSku(String(record.sku ?? record.purchase_option_id ?? record.purchaseOptionId ?? ''))
      if (!previewId || !previewOptionId || !sku) return null
      return {
        previewId,
        previewOptionId,
        sku,
        quantity: normalizeQuantity(record.quantity),
        selectedSize: pickFirstString([record.selected_size, record.selectedSize]),
      }
    })
    .filter((line): line is CartDraftLineInput => Boolean(line))
}

function normalizeQuantity(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.max(1, Math.min(99, Math.floor(numeric)))
}

function emptyCanonicalPurchaseOption(): NormalizedPurchaseOption {
  return {
    purchaseOptionId: '',
    previewOptionId: '',
    sku: null,
    product: 'DOT',
    label: null,
    description: null,
    previewUrl: null,
    mockupUrl: null,
    frame: null,
    frameCode: null,
    frameLabel: null,
    productionSpeed: null,
    productionSpeedCode: null,
    productionSpeedLabel: null,
    orderLine: null,
    unitPrice: null,
    currency: null,
  }
}

function emptyOrderDraft(): NormalizedOrderDraft {
  return {
    orderDraftId: '',
    previewId: '',
    previewOptionId: '',
    purchaseOptionId: '',
    sku: null,
    status: 'EMPTY',
    product: 'DOT',
    selectedSize: null,
    productionSpeedCode: null,
    productionSpeedLabel: null,
    orderLine: null,
    lineItems: [],
    itemCount: 0,
    unitPrice: null,
    currency: null,
  }
}

function sanitizeShippingAddress(value: unknown): JsonRecord {
  const record = asRecord(value)
  const mapped: JsonRecord = {
    name: pickFirstString([record.name]),
    email: pickFirstString([record.email]),
    phone: pickFirstString([record.phone]),
    street: pickFirstString([record.street, record.line1]),
    street2: pickFirstString([record.street2, record.line2]),
    city: pickFirstString([record.city]),
    zip: pickFirstString([record.zip, record.postal_code]),
    country: pickFirstString([record.country]),
  }

  return Object.fromEntries(Object.entries(mapped).filter(([, val]) => val))
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
    if (key.toLowerCase() === 'vary') {
      next.headers.set(key, mergeVaryHeader(next.headers.get(key), value))
    } else {
      next.headers.set(key, value)
    }
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

function mergeVaryHeader(current: string | null, next: string): string {
  const values = new Set(
    [current, next]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  )
  return Array.from(values).join(', ')
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

function asNullableRecord(value: unknown): JsonRecord | null {
  const record = asRecord(value)
  return Object.keys(record).length ? record : null
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function summarizeMgeError(raw: unknown, text: string, secretToRedact?: string): string {
  const obj = asRecord(raw)
  const detail = pickFirstString([obj.detail, obj.error, obj.message])
  return redactSecret(detail || text.slice(0, 500) || 'No response body', secretToRedact)
}

function redactSecret(value: string, secretToRedact?: string): string {
  if (!secretToRedact) return value
  return value.split(secretToRedact).join('[REDACTED]')
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
