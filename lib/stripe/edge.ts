import { verifyIdentitySessionToken, sendContinuationMagicLink } from '../identity/edge.ts'

type NormalizedPurchaseOption = {
  purchaseOptionId: string
  previewOptionId: string
  sku: string | null
  product: string | null
  productionSpeedCode: string | null
  productionSpeedLabel: string | null
  orderLine: Record<string, unknown> | null
  unitPrice: string | null
  currency: string | null
}

export interface StripeEnv {
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
  STRIPE_WEBHOOK_SECRET?: string
  ALLOWED_ORIGIN?: string
  EUR_TO_SGD_RATE?: string
  MGEVERYDAY_API_TOKEN?: string
  MGEVERYDAY_BASE_URL?: string
  MGEVERYDAY_BRAND_ID?: string
  MAGIC_LINK_SECRET?: string
  MAGIC_LINK_FROM?: string
  RESEND_API_KEY?: string
  APP_BASE_URL?: string
  PAYMENT_SUBMIT_OUTBOX?: PaymentSubmitOutbox | D1PaymentSubmitOutboxDatabase
}

type Fetcher = typeof fetch

export type PaymentSubmitState =
  | 'checkout_created'
  | 'paid'
  | 'mge_submit_queued'
  | 'mge_submitting'
  | 'mge_submitted'
  | 'mge_retrying'
  | 'mge_failed_manual_review'

export type PaymentSubmitOutboxRecord = {
  stripeSessionId: string
  stripeEventId?: string | null
  verifiedEmail?: string | null
  mgeOrderDraftId?: string | null
  mgeOrderId?: string | null
  state: PaymentSubmitState
  attemptCount?: number
  lastError?: string | null
}

export type PaymentSubmitClaimResult = {
  status: 'acquired' | 'already_submitted' | 'in_progress' | 'manual_review'
  attemptCount: number
  mgeOrderId?: string | null
}

export type PaymentSubmitOutbox = {
  upsert(record: PaymentSubmitOutboxRecord): Promise<void>
  claimMgeSubmit(record: PaymentSubmitOutboxRecord): Promise<PaymentSubmitClaimResult>
  getByStripeSessionId(stripeSessionId: string): Promise<PaymentSubmitOutboxRecord | null>
}

type D1PaymentSubmitOutboxDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>
      first<T = Record<string, unknown>>(): Promise<T | null>
    }
  }
}

type StripeCheckoutSession = {
  id?: string
  url?: string
  payment_status?: unknown
  status?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

type StripeWebhookEvent = {
  id?: string
  type?: string
  data?: {
    object?: {
      id?: unknown
      metadata?: Record<string, unknown>
      customer_details?: { email?: unknown }
      customer_email?: unknown
      payment_status?: unknown
    }
  }
}

type StripeWebhookSession = NonNullable<NonNullable<StripeWebhookEvent['data']>['object']>

type CheckoutOrderDraft = {
  orderDraftId?: unknown
  previewId?: unknown
  previewOptionId?: unknown
  purchaseOptionId?: unknown
  sku?: unknown
  status?: unknown
  product?: unknown
  selectedSize?: unknown
  productionSpeedCode?: unknown
  productionSpeedLabel?: unknown
  orderLine?: unknown
  lineItems?: unknown
  itemCount?: unknown
  unitPrice?: unknown
  currency?: unknown
}

type CheckoutRequestBody = {
  selected_size?: unknown
  preview_id?: unknown
  preview_option_id?: unknown
  distinct_id?: unknown
  purchase_option_id?: unknown
  sku?: unknown
  order_draft_id?: unknown
  order_draft?: CheckoutOrderDraft
  identity_token?: unknown
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

type CheckoutLineItem = {
  productName: string
  productDescription: string | null
  quote: RetailPriceQuote
  quantity: number
}

const STRIPE_API_BASE = 'https://api.stripe.com/v1'
const WEBHOOK_TOLERANCE_SECONDS = 300
const TARGET_GROSS_MARGIN = 0.5
const SINGAPORE_GST_RATE = 0.09
const DEFAULT_EUR_TO_SGD_RATE = 1.46
const DEFAULT_MGEVERYDAY_BASE_URL = 'https://www.mgeveryday.sg'
const MGE_SUBMIT_CLAIM_TTL_MS = 5 * 60 * 1000
const STRIPE_CHECKOUT_MIN_DURATION_SECONDS = 30 * 60
const STRIPE_CHECKOUT_MAX_DURATION_SECONDS = 24 * 60 * 60

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
    const checkoutContext = await readCheckoutContext(request, env, fetcher)

    const body = new URLSearchParams()
    body.set('mode', 'payment')
    body.set('success_url', `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`)
    body.set('cancel_url', `${origin}/checkout/cancel`)
    body.set('allow_promotion_codes', 'true')
    body.set('automatic_tax[enabled]', 'false')
    body.set('shipping_address_collection[allowed_countries][0]', 'SG')
    body.set('billing_address_collection', 'required')
    body.set('phone_number_collection[enabled]', 'true')
    if (checkoutContext.stripeExpiresAt) {
      body.set('expires_at', String(checkoutContext.stripeExpiresAt))
    }
    if (checkoutContext.metadata.verified_email) {
      body.set('customer_email', checkoutContext.metadata.verified_email)
    }
    body.set('metadata[source]', 'dottingo_landing')
    body.set('metadata[brand_key]', 'dottingo')
    body.set('metadata[product]', checkoutContext.metadata.product ?? 'DOT')

    if (checkoutContext.dynamicPrice) {
      checkoutContext.lineItems.forEach((item, index) => {
        body.set(`line_items[${index}][quantity]`, String(item.quantity))
        body.set(`line_items[${index}][price_data][currency]`, 'sgd')
        body.set(`line_items[${index}][price_data][unit_amount]`, String(item.quote.unitAmount))
        body.set(`line_items[${index}][price_data][product_data][name]`, item.productName)
        if (item.productDescription) {
          body.set(`line_items[${index}][price_data][product_data][description]`, item.productDescription)
        }
      })
    } else {
      const priceId = requireValue(env.STRIPE_PRICE_ID, 'STRIPE_PRICE_ID')
      body.set('line_items[0][price]', priceId)
      body.set('line_items[0][quantity]', '1')
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

    await recordCheckoutCreated(payload, checkoutContext.metadata, env)

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
  return handleStripeWebhookWithFetcher(request, env, fetch)
}

export async function handleStripeWebhookWithFetcher(
  request: Request,
  env: StripeEnv,
  fetcher: Fetcher,
): Promise<Response> {
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

    let magicLinkDelivery: 'email_sent' | 'accepted' | 'not_applicable' = 'not_applicable'
    let mgeOrderSubmission: MgeOrderSubmissionResult = { status: 'not_applicable' }
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object
      const metadata = session?.metadata ?? {}
      const email = stringValue(metadata.verified_email) || stringValue(session?.customer_details?.email) || stringValue(session?.customer_email)
      const previewId = stringValue(metadata.preview_id)
      if (email && previewId) {
        magicLinkDelivery = await sendContinuationMagicLink(request, env, { email, previewId })
      }
      mgeOrderSubmission = await processPaidMgeOrderSubmission(session ?? {}, event.id, env, fetcher)
    }

    return json({ received: true, event: event.type, magicLinkDelivery, mgeOrderSubmission })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe webhook failed'
    return json({ error: message }, 400)
  }
}

export async function getStripeCheckoutStatus(
  request: Request,
  env: StripeEnv,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const sessionId = normalizeStripeCheckoutSessionId(new URL(request.url).searchParams.get('session_id') ?? '')
  if (!sessionId) {
    return json({ error: 'A valid Stripe Checkout Session id is required' }, 400)
  }

  try {
    const secretKey = requireSandboxSecretKey(env)
    const stripeResponse = await fetcher(`${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: new Headers({ Authorization: `Bearer ${secretKey}` }),
    })
    const stripeText = await stripeResponse.text()
    const stripeSession = parseJson(stripeText) as StripeCheckoutSession | null

    if (!stripeResponse.ok || !stripeSession) {
      return json(
        { error: stripeResponse.status === 404 ? 'Checkout Session was not found' : 'Checkout status is temporarily unavailable' },
        stripeResponse.status === 404 ? 404 : 502,
      )
    }

    const metadata = asRecord(stripeSession.metadata) ?? {}
    if (stringValue(metadata.source) !== 'dottingo_landing' || stringValue(metadata.brand_key) !== 'dottingo') {
      return json({ error: 'Checkout Session was not found' }, 404)
    }

    const outbox = paymentSubmitOutbox(env)
    if (!outbox) {
      return json({ error: 'Checkout status is temporarily unavailable' }, 503)
    }

    const record = await outbox.getByStripeSessionId(sessionId)
    const paymentState = normalizeStripePaymentState(stripeSession.payment_status)
    const submissionState = customerSubmissionState(paymentState, record?.state)
    const orderDraftId = record?.mgeOrderDraftId
      || normalizeMgeId(stringValue(metadata.order_draft_id))
      || null
    const orderId = record?.mgeOrderId || null
    const payload: CheckoutStatusPayload = {
      sessionId,
      paymentState,
      submissionState,
      orderDraftId,
      orderId,
      terminal: submissionState === 'submitted' || submissionState === 'manual_review',
      message: checkoutStatusMessage(submissionState),
    }

    return json(payload)
  } catch {
    return json({ error: 'Checkout status is temporarily unavailable' }, 503)
  }
}

type MgeOrderSubmissionResult = {
  status:
    | 'not_applicable'
    | 'not_paid'
    | 'submitted'
    | 'already_submitted'
    | 'submit_in_progress'
    | 'manual_review'
  orderDraftId?: string
  orderId?: string
}

export type CheckoutStatusPayload = {
  sessionId: string
  paymentState: 'paid' | 'unpaid' | 'no_payment_required' | 'unknown'
  submissionState: 'awaiting_payment' | 'paid' | 'submitting' | 'submitted' | 'retrying' | 'manual_review'
  orderDraftId: string | null
  orderId: string | null
  terminal: boolean
  message: string
}

class MgeOrderSubmitHttpError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'MgeOrderSubmitHttpError'
    this.retryable = retryable
  }
}

class D1PaymentSubmitOutbox implements PaymentSubmitOutbox {
  private readonly db: D1PaymentSubmitOutboxDatabase

  constructor(db: D1PaymentSubmitOutboxDatabase) {
    this.db = db
  }

  async upsert(record: PaymentSubmitOutboxRecord): Promise<void> {
    const now = new Date().toISOString()
    await this.db.prepare(`
      INSERT INTO payment_submit_outbox (
        stripe_session_id,
        stripe_event_id,
        verified_email,
        mge_order_draft_id,
        mge_order_id,
        state,
        attempt_count,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stripe_session_id) DO UPDATE SET
        stripe_event_id = COALESCE(excluded.stripe_event_id, payment_submit_outbox.stripe_event_id),
        verified_email = COALESCE(excluded.verified_email, payment_submit_outbox.verified_email),
        mge_order_draft_id = COALESCE(payment_submit_outbox.mge_order_draft_id, excluded.mge_order_draft_id),
        mge_order_id = COALESCE(excluded.mge_order_id, payment_submit_outbox.mge_order_id),
        state = CASE
          WHEN payment_submit_outbox.state = 'mge_submitted' THEN payment_submit_outbox.state
          WHEN excluded.state = 'mge_submitted' THEN excluded.state
          WHEN excluded.state = 'mge_failed_manual_review' THEN excluded.state
          WHEN excluded.state = 'mge_retrying'
            AND payment_submit_outbox.state IN ('mge_submitting', 'mge_retrying') THEN excluded.state
          WHEN excluded.state = 'mge_submit_queued'
            AND payment_submit_outbox.state IN ('checkout_created', 'paid', 'mge_submit_queued') THEN excluded.state
          WHEN excluded.state = 'paid'
            AND payment_submit_outbox.state IN ('checkout_created', 'paid') THEN excluded.state
          WHEN excluded.state = 'checkout_created'
            AND payment_submit_outbox.state = 'checkout_created' THEN excluded.state
          ELSE payment_submit_outbox.state
        END,
        attempt_count = MAX(payment_submit_outbox.attempt_count, excluded.attempt_count),
        last_error = CASE
          WHEN excluded.state = 'mge_submitted' THEN NULL
          WHEN excluded.state IN ('mge_retrying', 'mge_failed_manual_review') THEN excluded.last_error
          ELSE payment_submit_outbox.last_error
        END,
        updated_at = CASE
          WHEN payment_submit_outbox.state = 'mge_submitted'
            AND excluded.state <> 'mge_submitted' THEN payment_submit_outbox.updated_at
          WHEN excluded.state = 'mge_failed_manual_review'
            AND payment_submit_outbox.state = 'mge_submitted' THEN payment_submit_outbox.updated_at
          WHEN excluded.state = 'mge_retrying'
            AND payment_submit_outbox.state NOT IN ('mge_submitting', 'mge_retrying') THEN payment_submit_outbox.updated_at
          WHEN excluded.state = 'mge_submit_queued'
            AND payment_submit_outbox.state NOT IN ('checkout_created', 'paid', 'mge_submit_queued') THEN payment_submit_outbox.updated_at
          WHEN excluded.state = 'paid'
            AND payment_submit_outbox.state NOT IN ('checkout_created', 'paid') THEN payment_submit_outbox.updated_at
          WHEN excluded.state = 'checkout_created'
            AND payment_submit_outbox.state <> 'checkout_created' THEN payment_submit_outbox.updated_at
          ELSE excluded.updated_at
        END
    `).bind(
      record.stripeSessionId,
      record.stripeEventId ?? null,
      record.verifiedEmail ?? null,
      record.mgeOrderDraftId ?? null,
      record.mgeOrderId ?? null,
      record.state,
      record.attemptCount ?? 0,
      record.lastError ?? null,
      now,
      now,
    ).run()
  }

  async claimMgeSubmit(record: PaymentSubmitOutboxRecord): Promise<PaymentSubmitClaimResult> {
    const now = new Date()
    const nowIso = now.toISOString()
    const staleBeforeIso = new Date(now.getTime() - MGE_SUBMIT_CLAIM_TTL_MS).toISOString()
    const updateResult = await this.db.prepare(`
      UPDATE payment_submit_outbox
      SET
        stripe_event_id = COALESCE(?, stripe_event_id),
        state = 'mge_submitting',
        attempt_count = attempt_count + 1,
        last_error = NULL,
        updated_at = ?
      WHERE stripe_session_id = ?
        AND mge_order_draft_id = ?
        AND (
          state IN ('paid', 'mge_submit_queued', 'mge_retrying')
          OR (state = 'mge_submitting' AND updated_at < ?)
        )
    `).bind(
      record.stripeEventId ?? null,
      nowIso,
      record.stripeSessionId,
      record.mgeOrderDraftId ?? null,
      staleBeforeIso,
    ).run()

    const changes = d1WriteChanges(updateResult)
    if (changes === null) {
      throw new Error('PAYMENT_SUBMIT_OUTBOX did not report atomic claim changes')
    }

    const current = await this.db.prepare(`
      SELECT state, attempt_count, mge_order_id, mge_order_draft_id
      FROM payment_submit_outbox
      WHERE stripe_session_id = ?
    `).bind(record.stripeSessionId).first<{
      state?: unknown
      attempt_count?: unknown
      mge_order_id?: unknown
      mge_order_draft_id?: unknown
    }>()

    if (!current) {
      throw new Error('PAYMENT_SUBMIT_OUTBOX claim row was not found')
    }

    const storedDraftId = stringValue(current.mge_order_draft_id)
    if (!storedDraftId || storedDraftId !== record.mgeOrderDraftId) {
      throw new Error('PAYMENT_SUBMIT_OUTBOX draft id does not match the paid session')
    }

    const attemptCount = Math.max(0, Number(current.attempt_count) || 0)
    if (changes > 0) {
      return { status: 'acquired', attemptCount }
    }

    const state = stringValue(current.state)
    if (state === 'mge_submitted') {
      return {
        status: 'already_submitted',
        attemptCount,
        mgeOrderId: stringValue(current.mge_order_id) || null,
      }
    }
    if (state === 'mge_submitting') {
      return { status: 'in_progress', attemptCount }
    }
    if (state === 'mge_failed_manual_review') {
      return { status: 'manual_review', attemptCount }
    }

    throw new Error(`PAYMENT_SUBMIT_OUTBOX could not claim state ${state || 'unknown'}`)
  }

  async getByStripeSessionId(stripeSessionId: string): Promise<PaymentSubmitOutboxRecord | null> {
    const row = await this.db.prepare(`
      SELECT
        stripe_session_id,
        stripe_event_id,
        verified_email,
        mge_order_draft_id,
        mge_order_id,
        state,
        attempt_count,
        last_error
      FROM payment_submit_outbox
      WHERE stripe_session_id = ?
    `).bind(stripeSessionId).first<{
      stripe_session_id?: unknown
      stripe_event_id?: unknown
      verified_email?: unknown
      mge_order_draft_id?: unknown
      mge_order_id?: unknown
      state?: unknown
      attempt_count?: unknown
      last_error?: unknown
    }>()

    if (!row) return null
    const state = normalizePaymentSubmitState(row.state)
    if (!state) {
      throw new Error('PAYMENT_SUBMIT_OUTBOX contains an unknown state')
    }

    return {
      stripeSessionId: stringValue(row.stripe_session_id),
      stripeEventId: stringValue(row.stripe_event_id) || null,
      verifiedEmail: stringValue(row.verified_email) || null,
      mgeOrderDraftId: stringValue(row.mge_order_draft_id) || null,
      mgeOrderId: stringValue(row.mge_order_id) || null,
      state,
      attemptCount: Math.max(0, Number(row.attempt_count) || 0),
      lastError: stringValue(row.last_error) || null,
    }
  }
}

function paymentSubmitOutbox(env: StripeEnv): PaymentSubmitOutbox | null {
  const binding = env.PAYMENT_SUBMIT_OUTBOX
  if (!binding) return null
  if (isPaymentSubmitOutbox(binding)) return binding
  if (isD1PaymentSubmitOutboxDatabase(binding)) return new D1PaymentSubmitOutbox(binding)
  return null
}

function isPaymentSubmitOutbox(value: unknown): value is PaymentSubmitOutbox {
  return Boolean(
    value
    && typeof value === 'object'
    && 'upsert' in value
    && typeof (value as { upsert?: unknown }).upsert === 'function'
    && 'claimMgeSubmit' in value
    && typeof (value as { claimMgeSubmit?: unknown }).claimMgeSubmit === 'function'
    && 'getByStripeSessionId' in value
    && typeof (value as { getByStripeSessionId?: unknown }).getByStripeSessionId === 'function',
  )
}

function isD1PaymentSubmitOutboxDatabase(value: unknown): value is D1PaymentSubmitOutboxDatabase {
  return Boolean(value && typeof value === 'object' && 'prepare' in value && typeof (value as { prepare?: unknown }).prepare === 'function')
}

function d1WriteChanges(result: unknown): number | null {
  const meta = asRecord(asRecord(result)?.meta)
  const changes = Number(meta?.changes)
  return Number.isFinite(changes) ? changes : null
}

async function recordCheckoutCreated(
  session: StripeCheckoutSession | null,
  metadata: Record<string, string>,
  env: StripeEnv,
): Promise<void> {
  const outbox = paymentSubmitOutbox(env)
  const stripeSessionId = stringValue(session?.id)
  const orderDraftId = normalizeMgeId(stringValue(metadata.order_draft_id))
  if (!outbox || !stripeSessionId || !orderDraftId) return

  await outbox.upsert({
    stripeSessionId,
    verifiedEmail: stringValue(metadata.verified_email) || null,
    mgeOrderDraftId: orderDraftId,
    state: 'checkout_created',
    attemptCount: 0,
    lastError: null,
  })
}

async function recordWebhookPaymentReceived(
  session: StripeWebhookSession,
  eventId: string | undefined,
  outbox: PaymentSubmitOutbox | null,
): Promise<void> {
  if (!isPaidCheckoutSession(session)) return
  const record = requirePaymentSubmitRecordFromSession(session, eventId, 'paid')
  if (!outbox) {
    throw new Error('PAYMENT_SUBMIT_OUTBOX is required before paid order submission')
  }
  await outbox.upsert(record)
}

async function processPaidMgeOrderSubmission(
  session: StripeWebhookSession,
  eventId: string | undefined,
  env: StripeEnv,
  fetcher: Fetcher,
): Promise<MgeOrderSubmissionResult> {
  if (!isPaidCheckoutSession(session)) {
    return submitMgeOrderFromPaidSession(session, eventId, env, fetcher)
  }

  const outbox = paymentSubmitOutbox(env)
  await recordWebhookPaymentReceived(session, eventId, outbox)
  const claimRecord = requirePaymentSubmitRecordFromSession(session, eventId, 'mge_submitting')
  const claim = await outbox!.claimMgeSubmit(claimRecord)
  const orderDraftId = claimRecord.mgeOrderDraftId!

  if (claim.status === 'already_submitted') {
    return {
      status: 'already_submitted',
      orderDraftId,
      orderId: claim.mgeOrderId || undefined,
    }
  }
  if (claim.status === 'in_progress') {
    return { status: 'submit_in_progress', orderDraftId }
  }
  if (claim.status === 'manual_review') {
    return { status: 'manual_review', orderDraftId }
  }

  try {
    const result = await submitMgeOrderFromPaidSession(session, eventId, env, fetcher)
    await recordMgeSubmitResult(session, eventId, result, outbox, claim.attemptCount)
    return result
  } catch (error) {
    const retryable = isRetryableMgeSubmitError(error)
    await recordMgeSubmitFailure(session, eventId, error, outbox, claim.attemptCount, retryable)
    if (retryable) throw error
    return { status: 'manual_review', orderDraftId }
  }
}

async function recordMgeSubmitResult(
  session: StripeWebhookSession,
  eventId: string | undefined,
  result: MgeOrderSubmissionResult,
  outbox: PaymentSubmitOutbox | null,
  attemptCount: number,
): Promise<void> {
  if (!outbox || result.status !== 'submitted' && result.status !== 'already_submitted') return
  const record = paymentSubmitRecordFromSession(session, eventId, 'mge_submitted', {
    mgeOrderId: result.orderId ?? null,
    attemptCount,
    lastError: null,
  })
  if (!record) return
  await outbox.upsert(record)
}

async function recordMgeSubmitFailure(
  session: StripeWebhookSession,
  eventId: string | undefined,
  error: unknown,
  outbox: PaymentSubmitOutbox | null,
  attemptCount: number,
  retryable: boolean,
): Promise<void> {
  if (!isPaidCheckoutSession(session)) return
  if (!outbox) return
  const record = paymentSubmitRecordFromSession(
    session,
    eventId,
    retryable ? 'mge_retrying' : 'mge_failed_manual_review',
    {
      attemptCount,
      lastError: sanitizeOutboxError(error),
    },
  )
  if (!record) return
  await outbox.upsert(record)
}

function requirePaymentSubmitRecordFromSession(
  session: StripeWebhookSession,
  eventId: string | undefined,
  state: PaymentSubmitState,
): PaymentSubmitOutboxRecord {
  const metadata = session.metadata ?? {}
  const stripeSessionId = stringValue(session.id)
  if (!stripeSessionId) {
    throw new Error('Paid Stripe Checkout Session is missing its session id')
  }

  const rawOrderDraftId = stringValue(metadata.order_draft_id)
  const orderDraftId = normalizeMgeId(rawOrderDraftId)
  if (rawOrderDraftId && !orderDraftId) {
    throw new Error('MGE order draft id must be a real numeric id before submit')
  }
  if (!orderDraftId) {
    throw new Error('Paid Stripe Checkout Session is missing MGE order draft id metadata')
  }

  return paymentSubmitRecordFromSession(session, eventId, state)!
}

function paymentSubmitRecordFromSession(
  session: StripeWebhookSession,
  eventId: string | undefined,
  state: PaymentSubmitState,
  overrides: Partial<PaymentSubmitOutboxRecord> = {},
): PaymentSubmitOutboxRecord | null {
  const metadata = session.metadata ?? {}
  const stripeSessionId = stringValue(session.id)
  const rawOrderDraftId = stringValue(metadata.order_draft_id)
  const orderDraftId = normalizeMgeId(rawOrderDraftId)
  if (!stripeSessionId || !orderDraftId) return null

  return {
    stripeSessionId,
    stripeEventId: eventId || null,
    verifiedEmail: stringValue(metadata.verified_email)
      || stringValue(session.customer_details?.email)
      || stringValue(session.customer_email)
      || null,
    mgeOrderDraftId: orderDraftId,
    state,
    attemptCount: 0,
    lastError: null,
    ...overrides,
  }
}

function sanitizeOutboxError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'MGE submit failed')
  return message.split(requireSafeTokenPattern()).join('[REDACTED]').slice(0, 500)
}

function requireSafeTokenPattern(): RegExp {
  return /mge_[A-Za-z0-9_-]+|sk_(?:test|live)_[A-Za-z0-9_-]+|whsec_[A-Za-z0-9_-]+/g
}

function isPaidCheckoutSession(session: StripeWebhookSession): boolean {
  const paymentStatus = stringValue(session.payment_status).toLowerCase()
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
}

function normalizeStripeCheckoutSessionId(value: string): string {
  const sessionId = value.trim()
  return /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionId) ? sessionId : ''
}

function normalizeStripePaymentState(value: unknown): CheckoutStatusPayload['paymentState'] {
  const state = stringValue(value).toLowerCase()
  return state === 'paid' || state === 'unpaid' || state === 'no_payment_required' ? state : 'unknown'
}

function normalizePaymentSubmitState(value: unknown): PaymentSubmitState | null {
  const state = stringValue(value) as PaymentSubmitState
  return [
    'checkout_created',
    'paid',
    'mge_submit_queued',
    'mge_submitting',
    'mge_submitted',
    'mge_retrying',
    'mge_failed_manual_review',
  ].includes(state) ? state : null
}

function customerSubmissionState(
  paymentState: CheckoutStatusPayload['paymentState'],
  outboxState: PaymentSubmitState | undefined,
): CheckoutStatusPayload['submissionState'] {
  if (outboxState === 'mge_submitted') return 'submitted'
  if (outboxState === 'mge_failed_manual_review') return 'manual_review'
  if (outboxState === 'mge_retrying') return 'retrying'
  if (outboxState === 'mge_submitting') return 'submitting'
  if (outboxState === 'paid' || outboxState === 'mge_submit_queued') return 'paid'
  if (paymentState === 'paid' || paymentState === 'no_payment_required') return 'paid'
  return 'awaiting_payment'
}

function checkoutStatusMessage(state: CheckoutStatusPayload['submissionState']): string {
  if (state === 'submitted') return 'Your order is confirmed.'
  if (state === 'manual_review') return 'Payment was received. Our team will finish checking your order.'
  if (state === 'retrying') return 'Payment was received. Your order is safe and is still being finalized.'
  if (state === 'submitting') return 'Payment was received. We are creating your order.'
  if (state === 'paid') return 'Payment was received. Your order is waiting to be finalized.'
  return 'We are checking your payment.'
}

function isRetryableMgeSubmitError(error: unknown): boolean {
  if (error instanceof MgeOrderSubmitHttpError) return error.retryable
  const message = error instanceof Error ? error.message : String(error || '')
  if (/is not configured|must be a real numeric id|missing MGE order draft id/i.test(message)) return false
  return true
}

function isTransientMgeSubmitStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

async function submitMgeOrderFromPaidSession(
  session: StripeWebhookSession,
  eventId: string | undefined,
  env: StripeEnv,
  fetcher: Fetcher,
): Promise<MgeOrderSubmissionResult> {
  const metadata = session.metadata ?? {}
  const rawOrderDraftId = stringValue(metadata.order_draft_id)
  const orderDraftId = normalizeMgeId(rawOrderDraftId)
  if (rawOrderDraftId && !orderDraftId) {
    throw new Error('MGE order draft id must be a real numeric id before submit')
  }
  if (!orderDraftId) return { status: 'not_applicable' }

  const paymentStatus = stringValue(session.payment_status).toLowerCase()
  if (paymentStatus && paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
    return { status: 'not_paid', orderDraftId }
  }

  const token = requireValue(env.MGEVERYDAY_API_TOKEN, 'MGEVERYDAY_API_TOKEN')
  const sessionId = stringValue(session.id)
  const idempotencyKey = ['stripe-checkout', sessionId || eventId || 'unknown', orderDraftId].join(':')
  const upstream = await fetcher(`${mgeBaseUrl(env)}/api/v1/order-drafts/${encodeURIComponent(orderDraftId)}/submit/`, {
    method: 'POST',
    headers: new Headers({
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    }),
  })
  const text = await upstream.text()
  const raw = parseJson(text)

  if (upstream.ok) {
    const orderId = extractMgeOrderId(raw)
    if (!orderId) {
      throw new MgeOrderSubmitHttpError('MGE order submit response did not include a final order id', true)
    }
    return {
      status: 'submitted',
      orderDraftId,
      orderId,
    }
  }

  if (looksAlreadySubmitted(raw, text)) {
    return {
      status: 'already_submitted',
      orderDraftId,
      orderId: extractMgeOrderId(raw),
    }
  }

  throw new MgeOrderSubmitHttpError(
    `MGE order submit failed (${upstream.status}): ${summarizeMgeSubmitError(raw, text, token)}`,
    isTransientMgeSubmitStatus(upstream.status),
  )
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
  fetcher: Fetcher = fetch,
): Promise<{
  dynamicPrice: boolean
  lineItems: CheckoutLineItem[]
  metadata: Record<string, string>
  stripeExpiresAt?: number
}> {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return fallbackCheckoutContext()
  }

  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') {
    return fallbackCheckoutContext()
  }

  const source = raw as CheckoutRequestBody
  const draft = source.order_draft
  const orderDraftId = stringValue(source.order_draft_id)
  const draftRecord = draft && typeof draft === 'object' ? draft : null
  if (orderDraftId && !isSubmitReadyMgeDraftId(orderDraftId)) {
    throw new Error('MGE order draft id must be a real numeric id before payment')
  }

  const draftOrderDraftId = draftRecord ? stringValue(draftRecord.orderDraftId) : ''
  if (draftRecord && draftOrderDraftId && draftOrderDraftId !== orderDraftId) {
    throw new Error('order_draft_id does not match the order draft')
  }

  const identity = await verifyIdentitySessionToken(stringValue(source.identity_token), env)
  const token = requireValue(env.MGEVERYDAY_API_TOKEN, 'MGEVERYDAY_API_TOKEN')

  if (orderDraftId && !source.preview_id && !source.preview_option_id && !source.sku) {
    return await readMgeDraftCheckoutContext(orderDraftId, identity.email, env, token, fetcher)
  }

  const previewId = stringValue(source.preview_id) || stringValue(draftRecord?.previewId)
  const previewOptionId = stringValue(source.preview_option_id) || stringValue(draftRecord?.previewOptionId)
  const sku = stringValue(source.sku) || stringValue(draftRecord?.sku) || stringValue(asRecord(draftRecord?.orderLine)?.sku) || stringValue(source.purchase_option_id) || stringValue(draftRecord?.purchaseOptionId)

  if (!previewId) throw new Error('preview_id is required for dynamic checkout')
  if (!previewOptionId) throw new Error('preview_option_id is required for dynamic checkout')
  if (!sku) throw new Error('sku is required for dynamic checkout')

  const canonical = await loadCanonicalPurchaseOptionForCheckout(previewId, previewOptionId, sku, env, token, fetcher)
  if (!canonical) {
    throw new Error('Selected MGE purchase option is no longer orderable')
  }

  if (draftRecord) {
    validateDraftMatchesCanonical(draftRecord, canonical)
  }

  const exchangeRate = parseOptionalPositiveNumber(env.EUR_TO_SGD_RATE, DEFAULT_EUR_TO_SGD_RATE)
  const quote = calculateRetailPriceQuote(canonical.unitPrice ?? '', canonical.currency, exchangeRate)
  const orderLine = canonical.orderLine
  const canonicalSku = stringValue(orderLine?.sku) || stringValue(canonical.sku)
  const selectedSize = stringValue(source.selected_size) || stringValue(draftRecord?.selectedSize)
  const speedCode = canonical.productionSpeedCode || stringValue(draftRecord?.productionSpeedCode)
  const speedLabel = canonical.productionSpeedLabel || stringValue(draftRecord?.productionSpeedLabel)

  return {
    dynamicPrice: true,
    lineItems: [{
      productName: 'Custom Paint-by-Number Kit',
      productDescription: [selectedSize, speedLabel || speedCode ? `${speedLabel || speedCode} production` : null]
        .filter(Boolean)
        .join(' · ') || null,
      quote,
      quantity: 1,
    }],
    metadata: compactMetadata({
      order_draft_id: orderDraftId,
      selected_size: selectedSize,
      preview_id: previewId,
      preview_option_id: previewOptionId,
      purchase_option_id: source.purchase_option_id || canonical.purchaseOptionId,
      distinct_id: source.distinct_id,
      verified_email: identity.email,
      product: canonical.product ?? stringValue(draftRecord?.product),
      sku: canonicalSku,
      production_speed: speedCode || speedLabel,
      source_currency: quote.sourceCurrency,
      source_unit_price: quote.sourceAmount.toFixed(2),
      eur_to_sgd_rate: quote.exchangeRate.toFixed(4),
      retail_unit_amount_sgd: quote.unitAmount,
      order_line: orderLine ? JSON.stringify(orderLine).slice(0, 500) : undefined,
    }),
  }
}

function validateDraftMatchesCanonical(draft: CheckoutOrderDraft, canonical: NormalizedPurchaseOption): void {
  const draftPreviewOptionId = stringValue(draft.previewOptionId)
  if (draftPreviewOptionId && draftPreviewOptionId !== canonical.previewOptionId) {
    throw new Error('order_draft preview option does not match the canonical purchase option')
  }

  const draftPurchaseOptionId = stringValue(draft.purchaseOptionId)
  if (draftPurchaseOptionId && draftPurchaseOptionId !== canonical.purchaseOptionId) {
    throw new Error('order_draft purchase option does not match the canonical purchase option')
  }

  const draftUnitPrice = stringValue(draft.unitPrice)
  if (draftUnitPrice && draftUnitPrice !== stringValue(canonical.unitPrice)) {
    throw new Error('order_draft price does not match the canonical purchase option')
  }

  const draftCurrency = stringValue(draft.currency).toUpperCase()
  const canonicalCurrency = stringValue(canonical.currency).toUpperCase()
  if (draftCurrency && canonicalCurrency && draftCurrency !== canonicalCurrency) {
    throw new Error('order_draft currency does not match the canonical purchase option')
  }

  const draftOrderLine = asRecord(draft.orderLine)
  const draftSku = stringValue(draftOrderLine?.sku)
  const canonicalSku = stringValue(canonical.orderLine?.sku)
  if (draftSku && canonicalSku && draftSku !== canonicalSku) {
    throw new Error('order_draft SKU does not match the canonical purchase option')
  }
}

async function readMgeDraftCheckoutContext(
  orderDraftId: string,
  verifiedEmail: string,
  env: StripeEnv,
  token: string,
  fetcher: Fetcher,
): Promise<{
  dynamicPrice: boolean
  lineItems: CheckoutLineItem[]
  metadata: Record<string, string>
  stripeExpiresAt: number
}> {
  const draft = await loadMgeOrderDraftForCheckout(orderDraftId, env, token, fetcher)
  const validation = await validateMgeOrderDraftForCheckout(orderDraftId, env, token, fetcher)
  return draftToCheckoutContext(orderDraftId, verifiedEmail, draft, validation, env)
}

function draftToCheckoutContext(
  orderDraftId: string,
  verifiedEmail: string,
  draft: unknown,
  validation: unknown,
  env: StripeEnv,
): {
  dynamicPrice: boolean
  lineItems: CheckoutLineItem[]
  metadata: Record<string, string>
  stripeExpiresAt: number
} {
  const draftLineItems = extractDraftLineItems(draft)
  if (!draftLineItems.length) {
    throw new Error('MGE order draft has no line items')
  }

  const exchangeRate = parseOptionalPositiveNumber(env.EUR_TO_SGD_RATE, DEFAULT_EUR_TO_SGD_RATE)
  const draftRecord = asRecord(draft) ?? {}
  const validationLineItems = extractDraftLineItems(validation)
  const lineItems = draftLineItems.map((line, index) => {
    const validatedLine = validationLineItems.find((candidate) => Number(candidate.index) === index)
      ?? validationLineItems.find((candidate) => {
        const skuMatches = stringValue(candidate.sku) === stringValue(line.sku)
        const previewOptionMatches = stringValue(candidate.preview_option_id) === stringValue(line.preview_option_id)
        return skuMatches && (!stringValue(line.preview_option_id) || previewOptionMatches)
      })
      ?? (validationLineItems.length === draftLineItems.length ? validationLineItems[index] : null)
    const unitPrice = stringValue(validatedLine?.unit_price)
      || stringValue(validatedLine?.unitPrice)
      || stringValue(validatedLine?.price)
      || stringValue(line.unit_price)
      || stringValue(line.unitPrice)
      || stringValue(line.price)
      || (draftLineItems.length === 1 ? stringValue(draftRecord.unitPrice) || stringValue(draftRecord.unit_price) : '')
    const currency = stringValue(validatedLine?.currency)
      || stringValue(line.currency)
      || (draftLineItems.length === 1 ? stringValue(draftRecord.currency) : '')
      || 'EUR'
    const quantity = normalizePositiveInteger(line.quantity, 1)
    const quote = calculateRetailPriceQuote(unitPrice, currency, exchangeRate)
    const sku = stringValue(line.sku)
    const selectedSize = stringValue(line.selected_size)
      || stringValue(line.selectedSize)
      || (draftLineItems.length === 1 ? stringValue(draftRecord.selectedSize) || stringValue(draftRecord.selected_size) : '')
      || sizeFromSku(sku)
    const label = stringValue(line.label) || stringValue(line.name)
    return {
      productName: label || `Custom Dottingo Design ${index + 1}`,
      productDescription: [selectedSize, sku].filter(Boolean).join(' · ') || null,
      quote,
      quantity,
    }
  })

  const totalAmount = lineItems.reduce((sum, item) => sum + item.quote.unitAmount * item.quantity, 0)
  const skus = draftLineItems.map((line) => stringValue(line.sku)).filter(Boolean)
  const previewOptionIds = draftLineItems.map((line) => stringValue(line.preview_option_id) || stringValue(line.previewOptionId)).filter(Boolean)
  const checkoutWindow = mgeCheckoutWindow(validation)

  return {
    dynamicPrice: true,
    lineItems,
    stripeExpiresAt: checkoutWindow.expiresAt,
    metadata: compactMetadata({
      order_draft_id: orderDraftId,
      verified_email: verifiedEmail,
      product: stringValue(draftRecord.product) || 'DOT',
      item_count: lineItems.length,
      sku: skus.join(','),
      preview_option_id: previewOptionIds.join(','),
      source_currency: lineItems[0]?.quote.sourceCurrency,
      eur_to_sgd_rate: exchangeRate.toFixed(4),
      retail_total_amount_sgd: totalAmount,
      mge_ready_until: checkoutWindow.readyUntil,
      mge_max_payment_session_seconds: checkoutWindow.maxPaymentSessionSeconds,
    }),
  }
}

function mgeCheckoutWindow(validation: unknown): {
  readyUntil: string
  maxPaymentSessionSeconds: number
  expiresAt: number
} {
  const validationRecord = asRecord(validation) ?? {}
  const checkout = asRecord(validationRecord.checkout)
  const readyUntil = stringValue(checkout?.ready_until) || stringValue(checkout?.readyUntil)
  const readyUntilMs = Date.parse(readyUntil)
  const maxPaymentSessionSeconds = Number(checkout?.max_payment_session_seconds ?? checkout?.maxPaymentSessionSeconds)

  if (!readyUntil || !Number.isFinite(readyUntilMs)) {
    throw new Error('MGE READY draft validation did not include a valid checkout.ready_until')
  }
  if (!Number.isInteger(maxPaymentSessionSeconds) || maxPaymentSessionSeconds <= 0) {
    throw new Error('MGE READY draft validation did not include a valid checkout.max_payment_session_seconds')
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const readyUntilSeconds = Math.floor(readyUntilMs / 1000)
  const expiresAt = Math.min(
    readyUntilSeconds,
    nowSeconds + maxPaymentSessionSeconds,
    nowSeconds + STRIPE_CHECKOUT_MAX_DURATION_SECONDS,
  )

  if (expiresAt - nowSeconds < STRIPE_CHECKOUT_MIN_DURATION_SECONDS) {
    throw new Error('MGE READY draft checkout window is too short for Stripe Checkout; revalidate the draft')
  }

  return {
    readyUntil,
    maxPaymentSessionSeconds,
    expiresAt,
  }
}

async function loadMgeOrderDraftForCheckout(
  orderDraftId: string,
  env: StripeEnv,
  token: string,
  fetcher: Fetcher,
): Promise<unknown> {
  const upstream = await fetcher(`${mgeBaseUrl(env)}/api/v1/order-drafts/${encodeURIComponent(orderDraftId)}/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await upstream.text()
  const raw = parseJson(text)
  if (!upstream.ok) {
    throw new Error(`MGE order draft fetch failed (${upstream.status}): ${summarizeMgeSubmitError(raw, text, token)}`)
  }
  return raw
}

async function validateMgeOrderDraftForCheckout(
  orderDraftId: string,
  env: StripeEnv,
  token: string,
  fetcher: Fetcher,
): Promise<unknown> {
  const upstream = await fetcher(`${mgeBaseUrl(env)}/api/v1/order-drafts/${encodeURIComponent(orderDraftId)}/validate/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await upstream.text()
  const raw = parseJson(text)
  if (!upstream.ok) {
    throw new Error(`MGE order draft validation failed (${upstream.status}): ${summarizeMgeSubmitError(raw, text, token)}`)
  }
  if (!looksMgeDraftValidationReady(raw)) {
    throw new Error(`MGE order draft validation failed: ${summarizeMgeValidationResult(raw, text, token)}`)
  }
  return raw
}

function looksMgeDraftValidationReady(raw: unknown): boolean {
  const obj = asRecord(raw) ?? {}
  if (obj.valid === true || obj.is_valid === true || obj.ok === true) return true
  const status = stringValue(obj.status).toUpperCase()
  if (['READY', 'VALID', 'VALIDATED'].includes(status)) return true
  const draft = asRecord(obj.draft)
  const draftStatus = stringValue(draft?.status).toUpperCase()
  if (['READY', 'VALID', 'VALIDATED'].includes(draftStatus)) return true
  return false
}

function summarizeMgeValidationResult(raw: unknown, text: string, token: string): string {
  const obj = asRecord(raw) ?? {}
  const detail = stringValue(obj.detail)
    || stringValue(obj.error)
    || stringValue(obj.message)
    || stringValue(obj.status)
    || text
  return detail.split(token).join('[REDACTED]').slice(0, 500) || 'Draft was not marked READY'
}

function extractDraftLineItems(raw: unknown): Record<string, unknown>[] {
  const obj = asRecord(raw) ?? {}
  const lines = Array.isArray(obj.line_items) ? obj.line_items : Array.isArray(obj.lineItems) ? obj.lineItems : []
  return lines.map((line) => asRecord(line)).filter((line): line is Record<string, unknown> => Boolean(line && Object.keys(line).length))
}

async function loadCanonicalPurchaseOptionForCheckout(
  previewId: string,
  previewOptionId: string,
  sku: string,
  env: StripeEnv,
  token: string,
  fetcher: Fetcher,
): Promise<NormalizedPurchaseOption | null> {
  const upstream = await fetcher(
    `${mgeBaseUrl(env)}/api/v1/preview/${encodeURIComponent(previewId)}/purchase-options/`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!upstream.ok) return null

  const raw = parseJson(await upstream.text())
  const obj = asRecord(raw) ?? {}
  const rawOptions = Array.isArray(obj.purchase_options) ? obj.purchase_options : []

  for (const rawOption of rawOptions) {
    const option = normalizeCanonicalPurchaseOption(rawOption)
    if (option.previewOptionId !== previewOptionId) continue
    if (option.sku !== sku) continue
    if (!option.orderLine || !option.unitPrice) continue
    return option
  }

  return null
}

function normalizeCanonicalPurchaseOption(raw: unknown): NormalizedPurchaseOption {
  const obj = asRecord(raw) ?? {}
  const orderLine = asRecord(obj.order_line)
  const productionSpeed = asRecord(obj.production_speed)
  const previewOptionId = stringValue(obj.preview_option_id) || stringValue(obj.option_id) || stringValue(obj.id) || stringValue(orderLine?.preview_option_id)
  const productionSpeedCode = stringValue(productionSpeed?.code) || stringValue(obj.production_speed_code) || null
  const productionSpeedLabel = stringValue(productionSpeed?.label) || stringValue(obj.production_speed_label) || productionSpeedCode
  const sku = stringValue(orderLine?.sku)

  return {
    purchaseOptionId: stringValue(obj.purchase_option_id) || sku || [previewOptionId, productionSpeedCode].filter(Boolean).join(':') || stringValue(obj.id),
    previewOptionId,
    sku: sku || null,
    product: stringValue(obj.product) || stringValue(obj.product_code) || null,
    productionSpeedCode,
    productionSpeedLabel,
    orderLine,
    unitPrice: stringValue(obj.unit_price) || stringValue(obj.price) || null,
    currency: stringValue(obj.currency) || null,
  }
}

function mgeBaseUrl(env: StripeEnv): string {
  return (env.MGEVERYDAY_BASE_URL || DEFAULT_MGEVERYDAY_BASE_URL).replace(/\/+$/, '')
}

function fallbackCheckoutContext(): {
  dynamicPrice: boolean
  lineItems: CheckoutLineItem[]
  metadata: Record<string, string>
  stripeExpiresAt?: number
} {
  return {
    dynamicPrice: false,
    lineItems: [{
      productName: 'Custom Paint-by-Number Kit',
      productDescription: null,
      quote: calculateRetailPriceQuote(1, 'SGD'),
      quantity: 1,
    }],
    metadata: {},
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

function normalizeMgeId(value: string): string {
  return isSubmitReadyMgeDraftId(value) ? value : ''
}

function isSubmitReadyMgeDraftId(value: string): boolean {
  return /^\d+$/.test(value.trim())
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function parseOptionalPositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(99, Math.floor(parsed)))
}

function sizeFromSku(sku: string): string {
  const match = sku.match(/(\d{2,3})X(\d{2,3})/i)
  return match ? `${match[1]}x${match[2]}` : ''
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

function extractMgeOrderId(raw: unknown): string | undefined {
  const obj = asRecord(raw) ?? {}
  const nestedOrder = asRecord(obj.order)
  return stringValue(obj.id)
    || stringValue(obj.order_id)
    || stringValue(obj.submitted_order_id)
    || stringValue(obj.mge_order_id)
    || stringValue(nestedOrder?.id)
    || undefined
}

function looksAlreadySubmitted(raw: unknown, text: string): boolean {
  const obj = asRecord(raw) ?? {}
  const status = stringValue(obj.status).toLowerCase()
  const hasSubmittedStatus = ['submitted', 'ordered', 'completed'].includes(status)
  const hasFinalOrderId = Boolean(extractMgeOrderId(raw))
  const hasDuplicateSignal = /already\s+submitted|duplicate|already\s+converted/i.test(text)
  return (hasFinalOrderId || hasSubmittedStatus) && (hasDuplicateSignal || hasSubmittedStatus)
}

function summarizeMgeSubmitError(raw: unknown, text: string, token: string): string {
  const obj = asRecord(raw) ?? {}
  const detail = stringValue(obj.detail) || stringValue(obj.error) || stringValue(obj.message) || text
  return detail.split(token).join('[REDACTED]').slice(0, 500) || 'No response body'
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
