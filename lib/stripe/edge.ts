export interface StripeEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
  STRIPE_WEBHOOK_SECRET?: string
  ALLOWED_ORIGIN?: string
  EUR_TO_SGD_RATE?: string
}

type Fetcher = typeof fetch

type StripeCheckoutSession = {
  id?: string
  url?: string
  [key: string]: unknown
}

type StripeWebhookEvent = {
  id?: string
  type?: string
  data?: unknown
}

type CheckoutPurchaseOption = {
  previewOptionId?: unknown
  product?: unknown
  label?: unknown
  description?: unknown
  orderLine?: unknown
  unitPrice?: unknown
  currency?: unknown
  productionSpeed?: unknown
}

type CheckoutRequestBody = {
  selected_size?: unknown
  preview_id?: unknown
  preview_option_id?: unknown
  distinct_id?: unknown
  purchase_option?: CheckoutPurchaseOption
}

export type RetailPriceQuote = {
  sourceAmount: number
  sourceCurrency: string
  exchangeRate: number
  costSgd: number
  subtotalSgd: number
  totalSgd: number
  unitAmount: number
  displayAmount: string
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const WEBHOOK_TOLERANCE_SECONDS = 300
const TARGET_GROSS_MARGIN = 0.5
const SINGAPORE_GST_RATE = 0.09
const DEFAULT_EUR_TO_SGD_RATE = 1.46

export async function createStripeCheckoutSession(
  request: Request,
  env: StripeEnv,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return corsResponse(request, env)
  }

  if (request.method !== 'POST') {
    return withCors(json({ error: 'Method not allowed' }, 405), request, env)
  }

  try {
    const secretKey = requireSandboxSecretKey(env)
    const origin = requestOrigin(request)
    const checkoutContext = await readCheckoutContext(request, env)

    const body = new URLSearchParams()
    body.set('mode', 'payment')
    body.set('line_items[0][quantity]', '1')
    body.set('success_url', `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`)
    body.set('cancel_url', `${origin}/checkout/cancel`)
    body.set('allow_promotion_codes', 'true')
    body.set('automatic_tax[enabled]', 'false')
    body.set('metadata[source]', 'makeyourcraft_landing')
    body.set('metadata[product]', checkoutContext.metadata.product ?? 'DOT')

    if (checkoutContext.dynamicPrice) {
      body.set('line_items[0][price_data][currency]', 'sgd')
      body.set('line_items[0][price_data][unit_amount]', String(checkoutContext.quote.unitAmount))
      body.set('line_items[0][price_data][product_data][name]', checkoutContext.productName)
      if (checkoutContext.productDescription) {
        body.set('line_items[0][price_data][product_data][description]', checkoutContext.productDescription)
      }
    } else {
      const priceId = requireValue(env.STRIPE_PRICE_ID, 'STRIPE_PRICE_ID')
      body.set('line_items[0][price]', priceId)
    }

    for (const [key, value] of Object.entries(checkoutContext.metadata)) {
      if (value) {
        body.set(`metadata[${key}]`, value)
      }
    }

    const upstream = await fetcher(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: new Headers({
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body,
    })

    const text = await upstream.text()
    const payload = parseJson(text) as StripeCheckoutSession | null

    if (!upstream.ok) {
      return withCors(
        json(
          {
            error: 'Stripe Checkout Session creation failed',
            status: upstream.status,
            detail: summarizeStripeError(payload, text),
          },
          upstream.status >= 500 ? 502 : upstream.status,
        ),
        request,
        env,
      )
    }

    return withCors(
      json({
        id: payload?.id,
        url: payload?.url,
      }),
      request,
      env,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe checkout failed'
    return withCors(json({ error: message }, 500), request, env)
  }
}

export async function handleStripeWebhook(request: Request, env: StripeEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const webhookSecret = requireValue(env.STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET')
    const signatureHeader = request.headers.get('Stripe-Signature')
    if (!signatureHeader) {
      return json({ error: 'Missing Stripe signature header' }, 400)
    }

    const payload = await request.text()
    const verified = await verifyStripeSignature(payload, signatureHeader, webhookSecret)
    if (!verified) {
      return json({ error: 'Invalid Stripe webhook signature' }, 400)
    }

    const event = parseJson(payload) as StripeWebhookEvent | null
    if (!event?.type) {
      return json({ error: 'Invalid Stripe webhook event payload' }, 400)
    }

    return json({ received: true, event: event.type })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe webhook failed'
    return json({ error: message }, 400)
  }
}

export async function signStripeWebhookPayloadForTest(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): Promise<string> {
  return hmacSha256Hex(secret, `${timestamp}.${payload}`)
}

export function calculateRetailPriceQuote(
  unitPrice: string | number,
  currency: string | null | undefined,
  exchangeRate = DEFAULT_EUR_TO_SGD_RATE,
): RetailPriceQuote {
  const sourceAmount = typeof unitPrice === 'number' ? unitPrice : Number.parseFloat(unitPrice)
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error('A valid purchase option unit price is required')
  }

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error('A valid EUR_TO_SGD_RATE is required')
  }

  const sourceCurrency = (currency || 'EUR').toUpperCase()
  const costSgd = sourceCurrency === 'SGD' ? sourceAmount : sourceAmount * exchangeRate
  const subtotalSgd = costSgd / TARGET_GROSS_MARGIN
  const totalSgd = subtotalSgd * (1 + SINGAPORE_GST_RATE)
  const unitAmount = roundUpToNinetyNineCents(totalSgd)

  return {
    sourceAmount,
    sourceCurrency,
    exchangeRate,
    costSgd,
    subtotalSgd,
    totalSgd,
    unitAmount,
    displayAmount: (unitAmount / 100).toFixed(2),
  }
}

async function readCheckoutContext(
  request: Request,
  env: StripeEnv,
): Promise<{
  dynamicPrice: boolean
  productName: string
  productDescription: string | null
  quote: RetailPriceQuote
  metadata: Record<string, string>
}> {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      dynamicPrice: false,
      productName: 'Custom Paint-by-Number Kit',
      productDescription: null,
      quote: calculateRetailPriceQuote(1, 'SGD'),
      metadata: {},
    }
  }

  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') {
    return {
      dynamicPrice: false,
      productName: 'Custom Paint-by-Number Kit',
      productDescription: null,
      quote: calculateRetailPriceQuote(1, 'SGD'),
      metadata: {},
    }
  }

  const source = raw as CheckoutRequestBody
  const option = source.purchase_option
  if (!option || typeof option !== 'object') {
    return {
      dynamicPrice: false,
      productName: 'Custom Paint-by-Number Kit',
      productDescription: null,
      quote: calculateRetailPriceQuote(1, 'SGD'),
      metadata: compactMetadata({
        selected_size: source.selected_size,
        preview_id: source.preview_id,
        preview_option_id: source.preview_option_id,
        distinct_id: source.distinct_id,
      }),
    }
  }

  const previewId = stringValue(source.preview_id)
  const requestedPreviewOptionId = stringValue(source.preview_option_id)
  const optionPreviewOptionId = stringValue(option.previewOptionId)
  const orderLine = asRecord(option.orderLine)
  const orderLinePreviewOptionId = stringValue(orderLine?.preview_option_id ?? orderLine?.previewOptionId)
  const previewOptionId = requestedPreviewOptionId || optionPreviewOptionId || orderLinePreviewOptionId

  if (!previewId) {
    throw new Error('preview_id is required for dynamic checkout')
  }
  if (!previewOptionId) {
    throw new Error('preview_option_id is required for dynamic checkout')
  }
  if (optionPreviewOptionId && optionPreviewOptionId !== previewOptionId) {
    throw new Error('Selected preview option does not match purchase option')
  }
  if (orderLinePreviewOptionId && orderLinePreviewOptionId !== previewOptionId) {
    throw new Error('Selected preview option does not match MGE order line')
  }

  const exchangeRate = parseOptionalPositiveNumber(env.EUR_TO_SGD_RATE, DEFAULT_EUR_TO_SGD_RATE)
  const quote = calculateRetailPriceQuote(stringValue(option.unitPrice), stringValue(option.currency), exchangeRate)
  const speed = asRecord(option.productionSpeed)
  const speedCode = stringValue(speed?.code)
  const sku = stringValue(orderLine?.sku)
  const label = stringValue(option.label)
  const selectedSize = stringValue(source.selected_size)

  return {
    dynamicPrice: true,
    productName: 'Custom Paint-by-Number Kit',
    productDescription: [selectedSize, label, speedCode ? `${speedCode} production` : null]
      .filter(Boolean)
      .join(' · ') || null,
    quote,
    metadata: compactMetadata({
      selected_size: source.selected_size,
      preview_id: previewId,
      preview_option_id: previewOptionId,
      distinct_id: source.distinct_id,
      product: option.product,
      sku,
      production_speed: speedCode,
      source_currency: quote.sourceCurrency,
      source_unit_price: quote.sourceAmount.toFixed(2),
      eur_to_sgd_rate: quote.exchangeRate.toFixed(4),
      retail_unit_amount_sgd: quote.unitAmount,
      order_line: orderLine ? JSON.stringify(orderLine).slice(0, 500) : undefined,
    }),
  }
}

function compactMetadata(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
      .map(([key, value]) => [key, String(value).slice(0, 500)]),
  )
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

function requireSandboxSecretKey(env: StripeEnv): string {
  const secretKey = requireValue(env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY')
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Stripe sandbox checkout requires a test-mode secret key')
  }
  return secretKey
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function parseOptionalPositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function roundUpToNinetyNineCents(amount: number): number {
  const cents = Math.ceil(amount * 100)
  const dollars = Math.floor(cents / 100)
  const ninetyNine = dollars * 100 + 99
  return cents <= ninetyNine ? ninetyNine : (dollars + 1) * 100 + 99
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = parseStripeSignatureHeader(header)
  const timestamp = Number(parts.t)
  const signatures = parts.v1

  if (!Number.isFinite(timestamp) || !signatures.length) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`)
  return signatures.some((signature) => constantTimeEqualHex(signature, expected))
}

function parseStripeSignatureHeader(header: string): { t?: string; v1: string[] } {
  const parsed: { t?: string; v1: string[] } = { v1: [] }
  for (const item of header.split(',')) {
    const [key, value] = item.split('=', 2)
    if (key === 't') parsed.t = value
    if (key === 'v1' && value) parsed.v1.push(value)
  }
  return parsed
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bytesToHex(new Uint8Array(signature))
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false
  if (a.length !== b.length) return false

  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return mismatch === 0
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function summarizeStripeError(payload: StripeCheckoutSession | null, text: string): string {
  const error = payload?.error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Stripe error')
  }
  return text.slice(0, 500) || 'No response body'
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function corsResponse(request: Request, env: StripeEnv): Response {
  const origin = allowedOrigin(request, env)
  if (!origin) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

function withCors(response: Response, request: Request, env: StripeEnv): Response {
  const origin = allowedOrigin(request, env)
  if (!origin) return response
  const next = new Response(response.body, response)
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    next.headers.set(key, value)
  }
  return next
}

function allowedOrigin(request: Request, env: StripeEnv): string | null {
  const origin = request.headers.get('Origin') || requestOrigin(request)
  const configured = env.ALLOWED_ORIGIN
  if (!configured || configured === '*') return origin
  const allowed = configured.split(',').map((item) => item.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : null
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Request-ID',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
