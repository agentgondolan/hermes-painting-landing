import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateRetailPriceQuote,
  createStripeCheckoutSession,
  getStripeCheckoutStatus,
  handleStripeWebhook,
  handleStripeWebhookWithFetcher,
  type PaymentSubmitOutboxRecord,
  signStripeWebhookPayloadForTest,
  type StripeEnv,
} from '../lib/stripe/edge.ts'
import { createIdentitySessionToken } from '../lib/identity/edge.ts'

const env: StripeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_local',
  STRIPE_PRICE_ID: 'price_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_local',
  EUR_TO_SGD_RATE: '1.46',
  MGEVERYDAY_API_TOKEN: 'mge_test_token',
  MGEVERYDAY_BASE_URL: 'https://mge.test',
  MGEVERYDAY_BRAND_ID: '116',
  MAGIC_LINK_SECRET: 'test_magic_link_secret_minimum_24_chars',
}

const canonicalPurchaseOptionsPayload = {
  preview_id: 'preview_123',
  status: 'COMPLETED',
  purchase_options: [
    {
      preview_option_id: 'option_123',
      product: 'DOT',
      label: 'BLACK / source / Standard',
      unit_price: '10.72',
      currency: 'EUR',
      production_speed: { code: 'STD', label: 'Standard' },
      order_line: {
        preview_option_id: 'option_123',
        sku: 'DOT/VF/40X50/W/BLACK/STD',
        quantity: 1,
      },
    },
  ],
}

async function identityToken(previewId = 'preview_123', email = 'buyer@example.com') {
  return createIdentitySessionToken({ email, previewId }, env)
}

function orderDraft(overrides: Record<string, unknown> = {}) {
  return {
    orderDraftId: '123',
    previewId: 'preview_123',
    previewOptionId: 'option_123',
    purchaseOptionId: 'DOT/VF/40X50/W/BLACK/STD',
    sku: 'DOT/VF/40X50/W/BLACK/STD',
    status: 'DRAFT',
    product: 'DOT',
    selectedSize: '40x50',
    productionSpeedCode: 'STD',
    productionSpeedLabel: 'Standard',
    orderLine: {
      preview_option_id: 'option_123',
      sku: 'DOT/VF/40X50/W/BLACK/STD',
      quantity: 1,
    },
    unitPrice: '10.72',
    currency: 'EUR',
    ...overrides,
  }
}

function readyCheckoutWindow(options: { readyInSeconds?: number; maxPaymentSessionSeconds?: number } = {}) {
  return {
    ready_until: new Date(Date.now() + (options.readyInSeconds ?? 7200) * 1000).toISOString(),
    max_payment_session_seconds: options.maxPaymentSessionSeconds ?? 3600,
  }
}

function memoryPaymentSubmitOutbox(options: { failOnState?: string } = {}) {
  const rows = new Map<string, PaymentSubmitOutboxRecord>()
  const writes: PaymentSubmitOutboxRecord[] = []

  function allowsTransition(previousState: string | undefined, nextState: string): boolean {
    if (!previousState || previousState === nextState) return true
    if (previousState === 'mge_submitted') return false
    if (nextState === 'mge_submitted' || nextState === 'mge_failed_manual_review') return true
    if (nextState === 'mge_retrying') return ['mge_submitting', 'mge_retrying'].includes(previousState)
    if (nextState === 'mge_submit_queued') return ['checkout_created', 'paid', 'mge_submit_queued'].includes(previousState)
    if (nextState === 'paid') return ['checkout_created', 'paid'].includes(previousState)
    if (nextState === 'checkout_created') return previousState === 'checkout_created'
    return false
  }

  return {
    rows,
    writes,
    binding: {
      async upsert(record: PaymentSubmitOutboxRecord) {
        if (options.failOnState === record.state) {
          throw new Error(`outbox rejected ${record.state}`)
        }
        const previous = rows.get(record.stripeSessionId)
        const transitionAllowed = allowsTransition(previous?.state, record.state)
        const next = {
          ...previous,
          ...record,
          state: transitionAllowed ? record.state : previous!.state,
          attemptCount: Math.max(previous?.attemptCount ?? 0, record.attemptCount ?? 0),
          lastError: transitionAllowed ? record.lastError : previous?.lastError,
          ...(record.mgeOrderId !== undefined || previous?.mgeOrderId !== undefined
            ? { mgeOrderId: record.mgeOrderId ?? previous?.mgeOrderId }
            : {}),
        }
        rows.set(record.stripeSessionId, next)
        writes.push(record)
      },
      async claimMgeSubmit(record: PaymentSubmitOutboxRecord) {
        const previous = rows.get(record.stripeSessionId)
        if (!previous) throw new Error('outbox claim row was not found')
        if (previous.mgeOrderDraftId !== record.mgeOrderDraftId) {
          throw new Error('outbox claim draft id mismatch')
        }

        const attemptCount = previous.attemptCount ?? 0
        if (previous.state === 'mge_submitted') {
          return { status: 'already_submitted' as const, attemptCount, mgeOrderId: previous.mgeOrderId }
        }
        if (previous.state === 'mge_submitting') {
          return { status: 'in_progress' as const, attemptCount }
        }
        if (previous.state === 'mge_failed_manual_review') {
          return { status: 'manual_review' as const, attemptCount }
        }
        if (!['paid', 'mge_submit_queued', 'mge_retrying'].includes(previous.state)) {
          throw new Error(`outbox cannot claim ${previous.state}`)
        }

        const claimed: PaymentSubmitOutboxRecord = {
          ...previous,
          stripeEventId: record.stripeEventId ?? previous.stripeEventId,
          state: 'mge_submitting',
          attemptCount: attemptCount + 1,
          lastError: null,
        }
        rows.set(record.stripeSessionId, claimed)
        writes.push(claimed)
        return { status: 'acquired' as const, attemptCount: claimed.attemptCount ?? 1 }
      },
      async getByStripeSessionId(stripeSessionId: string) {
        return rows.get(stripeSessionId) ?? null
      },
    },
  }
}

test('creates a sandbox Checkout Session for the configured fallback price', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(
      JSON.stringify({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', { method: 'POST' }),
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as { id: string; url: string }
  assert.equal(payload.id, 'cs_test_123')
  assert.equal(payload.url, 'https://checkout.stripe.com/c/pay/cs_test_123')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.stripe.com/v1/checkout/sessions')
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer sk_test_local')
  const body = calls[0].init.body as URLSearchParams
  assert.equal(body.get('mode'), 'payment')
  assert.equal(body.get('line_items[0][price]'), 'price_123')
  assert.equal(body.get('line_items[0][quantity]'), '1')
  assert.equal(body.get('success_url'), 'https://makeyourcraft.com/checkout/success?session_id={CHECKOUT_SESSION_ID}')
  assert.equal(body.get('cancel_url'), 'https://makeyourcraft.com/checkout/cancel')
  assert.equal(body.get('shipping_address_collection[allowed_countries][0]'), 'SG')
  assert.equal(body.get('billing_address_collection'), 'required')
  assert.equal(body.get('phone_number_collection[enabled]'), 'true')
})

test('calculates SGD checkout amount from MGE EUR unit cost with margin and GST', () => {
  const quote = calculateRetailPriceQuote('10.72', 'EUR', 1.46)
  assert.equal(quote.unitAmount, 3499)
  assert.equal(quote.displayAmount, '34.99')
  assert.equal(quote.sourceCurrency, 'EUR')
})

test('creates a dynamic Checkout Session directly and lets Stripe collect delivery details', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/preview/preview_123/purchase-options/')) {
      return new Response(JSON.stringify(canonicalPurchaseOptionsPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        id: 'cs_test_direct',
        url: 'https://checkout.stripe.com/c/pay/cs_test_direct',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview_id: 'preview_123',
        preview_option_id: 'option_123',
        purchase_option_id: 'DOT/VF/40X50/W/BLACK/STD',
        sku: 'DOT/VF/40X50/W/BLACK/STD',
        selected_size: '40x50',
        identity_token: await identityToken(),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/preview/preview_123/purchase-options/')
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/checkout/sessions')
  const body = calls[1].init.body as URLSearchParams
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '3499')
  assert.equal(body.get('shipping_address_collection[allowed_countries][0]'), 'SG')
  assert.equal(body.get('billing_address_collection'), 'required')
  assert.equal(body.get('phone_number_collection[enabled]'), 'true')
  assert.equal(body.get('metadata[order_draft_id]'), null)
  assert.equal(body.get('metadata[preview_id]'), 'preview_123')
  assert.equal(body.get('metadata[preview_option_id]'), 'option_123')
  assert.equal(body.get('metadata[purchase_option_id]'), 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(body.get('metadata[sku]'), 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(body.get('metadata[verified_email]'), 'buyer@example.com')
  assert.equal(body.get('customer_email'), 'buyer@example.com')
})

test('creates a dynamic SGD Checkout Session from the canonical MGE purchase option', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/preview/preview_123/purchase-options/')) {
      return new Response(JSON.stringify(canonicalPurchaseOptionsPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        id: 'cs_test_dynamic',
        url: 'https://checkout.stripe.com/c/pay/cs_test_dynamic',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview_id: 'preview_123',
        preview_option_id: 'option_123',
        sku: 'DOT/VF/40X50/W/BLACK/STD',
        selected_size: '40x50',
        identity_token: await identityToken(),
        order_draft_id: '123',
        order_draft: orderDraft({
          // Tamper with a non-authoritative display-only field to prove Stripe uses canonical server data.
          selectedSize: 'fake browser size',
        }),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/preview/preview_123/purchase-options/')
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer mge_test_token')
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/checkout/sessions')
  const body = calls[1].init.body as URLSearchParams
  assert.equal(body.get('line_items[0][price]'), null)
  assert.equal(body.get('line_items[0][price_data][currency]'), 'sgd')
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '3499')
  assert.equal(body.get('line_items[0][price_data][product_data][name]'), 'Custom Paint-by-Number Kit')
  assert.equal(body.get('metadata[order_draft_id]'), '123')
  assert.equal(body.get('metadata[preview_id]'), 'preview_123')
  assert.equal(body.get('metadata[preview_option_id]'), 'option_123')
  assert.equal(body.get('metadata[purchase_option_id]'), 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(body.get('metadata[sku]'), 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(body.get('metadata[verified_email]'), 'buyer@example.com')
  assert.equal(body.get('customer_email'), 'buyer@example.com')
  assert.equal(body.get('metadata[retail_unit_amount_sgd]'), '3499')
})

test('creates a multi-line Stripe Checkout Session from the canonical MGE order draft', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      if (String(url).endsWith('/validate/')) {
        return new Response(JSON.stringify({
          status: 'READY',
          valid: true,
          checkout: readyCheckoutWindow(),
          line_items: [
            {
              index: 0,
              preview_option_id: 'option_a',
              sku: 'DOT/VF/40X50/W/BLACK/STD',
              unit_price: '10.72',
              currency: 'EUR',
              errors: [],
            },
            {
              index: 1,
              preview_option_id: 'option_b',
              sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD',
              unit_price: '18.25',
              currency: 'EUR',
              errors: [],
            },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        id: '234',
        product: 'DOT',
        status: 'DRAFT',
        line_items: [
          {
            preview_option_id: 'option_a',
            sku: 'DOT/VF/40X50/W/BLACK/STD',
            quantity: 2,
            selected_size: '40x50',
            label: '40x50 without frame',
          },
          {
            preview_option_id: 'option_b',
            sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD',
            quantity: 1,
            selected_size: '60x80',
            label: '60x80 with frame',
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        id: 'cs_test_multi',
        url: 'https://checkout.stripe.com/c/pay/cs_test_multi',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
        cart_lines: [
          {
            preview_id: 'fake_preview',
            preview_option_id: 'fake_option',
            sku: 'FAKE',
            unit_price: '0.01',
            quantity: 99,
          },
        ],
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/234/')
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer mge_test_token')
  assert.equal(calls[1].url, 'https://mge.test/api/v1/order-drafts/234/validate/')
  assert.equal(calls[1].init.method, 'POST')
  assert.equal(new Headers(calls[1].init.headers).get('Authorization'), 'Bearer mge_test_token')
  assert.equal(calls[2].url, 'https://api.stripe.com/v1/checkout/sessions')
  const body = calls[2].init.body as URLSearchParams
  assert.equal(body.get('line_items[0][price]'), null)
  assert.equal(body.get('line_items[0][quantity]'), '2')
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '3499')
  assert.equal(body.get('line_items[0][price_data][product_data][name]'), '40x50 without frame')
  assert.equal(body.get('line_items[1][quantity]'), '1')
  assert.equal(body.get('line_items[1][price_data][unit_amount]'), '5899')
  assert.equal(body.get('line_items[1][price_data][product_data][name]'), '60x80 with frame')
  assert.equal(body.get('metadata[order_draft_id]'), '234')
  assert.equal(body.get('metadata[item_count]'), '2')
  assert.equal(body.get('metadata[sku]'), 'DOT/VF/40X50/W/BLACK/STD,DOT/VF/60X80/W/BLACK/FRAME/STD')
  assert.equal(body.get('metadata[preview_option_id]'), 'option_a,option_b')
  assert.equal(body.get('metadata[verified_email]'), 'multi@example.com')
  assert.equal(body.get('metadata[retail_total_amount_sgd]'), '12897')
  assert.equal(body.get('customer_email'), 'multi@example.com')
  const expiresAt = Number(body.get('expires_at'))
  const nowSeconds = Math.floor(Date.now() / 1000)
  assert.ok(expiresAt >= nowSeconds + 3599)
  assert.ok(expiresAt <= nowSeconds + 3600)
  assert.equal(body.get('metadata[mge_max_payment_session_seconds]'), '3600')
})

test('records checkout_created in the payment submit outbox after Stripe creates a session', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  const fetcher: typeof fetch = async (url) => {
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      if (String(url).endsWith('/validate/')) {
        return new Response(JSON.stringify({
          status: 'READY',
          valid: true,
          checkout: readyCheckoutWindow(),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        id: '234',
        product: 'DOT',
        status: 'READY',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
          unit_price: '10.72',
          currency: 'EUR',
          selected_size: '40x50',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      id: 'cs_test_outbox_created',
      url: 'https://checkout.stripe.com/c/pay/cs_test_outbox_created',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.equal(outbox.rows.size, 1)
  assert.deepEqual(outbox.rows.get('cs_test_outbox_created'), {
    stripeSessionId: 'cs_test_outbox_created',
    verifiedEmail: 'multi@example.com',
    mgeOrderDraftId: '234',
    state: 'checkout_created',
    attemptCount: 0,
    lastError: null,
  })
})

test('caps Stripe Checkout expiry at the MGE ready_until timestamp', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const readyUntil = new Date(Date.now() + 45 * 60 * 1000).toISOString()
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).endsWith('/api/v1/order-drafts/234/validate/')) {
      return new Response(JSON.stringify({
        status: 'READY',
        valid: true,
        checkout: {
          ready_until: readyUntil,
          max_payment_session_seconds: 3600,
        },
        line_items: [{
          index: 0,
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          unit_price: '10.72',
          currency: 'EUR',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      return new Response(JSON.stringify({
        id: 234,
        product: 'DOT',
        status: 'DRAFT',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      id: 'cs_test_ready_until',
      url: 'https://checkout.stripe.com/c/pay/cs_test_ready_until',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  const stripeBody = calls[2].init.body as URLSearchParams
  assert.equal(stripeBody.get('expires_at'), String(Math.floor(Date.parse(readyUntil) / 1000)))
  assert.equal(stripeBody.get('metadata[mge_ready_until]'), readyUntil)
})

test('rejects payment when an MGE READY response omits the checkout window', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).endsWith('/api/v1/order-drafts/234/validate/')) {
      return new Response(JSON.stringify({
        status: 'READY',
        valid: true,
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          unit_price: '10.72',
          currency: 'EUR',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      return new Response(JSON.stringify({
        id: 234,
        product: 'DOT',
        status: 'DRAFT',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('Stripe should not be called without an MGE checkout window')
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /checkout\.ready_until/)
  assert.equal(calls.length, 2)
})

test('rejects payment when the MGE READY window is shorter than Stripe minimum', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).endsWith('/api/v1/order-drafts/234/validate/')) {
      return new Response(JSON.stringify({
        status: 'READY',
        valid: true,
        checkout: readyCheckoutWindow({ readyInSeconds: 20 * 60, maxPaymentSessionSeconds: 20 * 60 }),
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          unit_price: '10.72',
          currency: 'EUR',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      return new Response(JSON.stringify({
        id: 234,
        product: 'DOT',
        status: 'DRAFT',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('Stripe should not be called for a short MGE checkout window')
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /too short for Stripe Checkout/)
  assert.equal(calls.length, 2)
})

test('rejects checkout when MGE draft validation returns invalid response', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).endsWith('/api/v1/order-drafts/234/validate/')) {
      return new Response(JSON.stringify({ status: 'DRAFT', detail: 'Missing shipping address' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      return new Response(JSON.stringify({
        id: 234,
        product: 'DOT',
        status: 'DRAFT',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
          unit_price: '10.72',
          currency: 'EUR',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Stripe should not be called when MGE validation is invalid')
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /MGE order draft validation failed/)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/234/')
  assert.equal(calls[1].url, 'https://mge.test/api/v1/order-drafts/234/validate/')
})

test('rejects checkout when MGE draft validation returns 4xx without leaking token', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).endsWith('/api/v1/order-drafts/234/validate/')) {
      return new Response(JSON.stringify({ detail: 'Token mge_test_token cannot validate this draft' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      return new Response(JSON.stringify({
        id: 234,
        product: 'DOT',
        status: 'DRAFT',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
          unit_price: '10.72',
          currency: 'EUR',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Stripe should not be called when MGE validation fails')
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  const text = await response.text()
  assert.match(text, /MGE order draft validation failed \(400\)/)
  assert.doesNotMatch(text, /mge_test_token/)
  assert.match(text, /\[REDACTED\]/)
  assert.equal(calls.length, 2)
})

test('rejects checkout when MGE draft validation returns 5xx before Stripe is called', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).endsWith('/api/v1/order-drafts/234/validate/')) {
      return new Response(JSON.stringify({ detail: 'Validation service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (String(url).includes('/api/v1/order-drafts/234/')) {
      return new Response(JSON.stringify({
        id: 234,
        product: 'DOT',
        status: 'DRAFT',
        line_items: [{
          preview_option_id: 'option_a',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          quantity: 1,
          unit_price: '10.72',
          currency: 'EUR',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Stripe should not be called when MGE validation is unavailable')
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '234',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /MGE order draft validation failed \(503\)/)
  assert.equal(calls.length, 2)
})

test('rejects checkout when the MGE draft cannot be read before payment', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/order-drafts/345/')) {
      return new Response('<!doctype html><title>Not Found</title>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return new Response(
      JSON.stringify({
        id: 'cs_test_synced',
        url: 'https://checkout.stripe.com/c/pay/cs_test_synced',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '345',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
        order_draft: {
          orderDraftId: '345',
          product: 'DOT',
          lineItems: [
            {
              previewOptionId: 'option_a',
              sku: 'DOT/VF/60X80/WO/BLACK/STD',
              quantity: 1,
              unitPrice: '10.72',
              currency: 'EUR',
              selectedSize: '60x80',
              label: '60x80 without frame',
            },
          ],
          itemCount: 1,
        },
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /MGE order draft fetch failed \(404\)/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/345/')
})

test('rejects synthetic order draft ids before creating Stripe sessions', async () => {
  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: 'preview-option:DOT/VF/60X80/WO/BLACK/STD',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
      }),
    }),
    env,
    async () => {
      throw new Error('Stripe and MGE should not be called for synthetic draft ids')
    },
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /real numeric id before payment/i)
})

test('rejects single-line draft payload fallback when MGE draft read is unavailable', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/order-drafts/456/')) {
      return new Response('<!doctype html><title>Not Found</title>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return new Response(
      JSON.stringify({
        id: 'cs_test_live_shape',
        url: 'https://checkout.stripe.com/c/pay/cs_test_live_shape',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_draft_id: '456',
        identity_token: await identityToken('preview_ignored', 'multi@example.com'),
        order_draft: {
          orderDraftId: '456',
          product: 'DOT',
          selectedSize: '60x80',
          unitPrice: '9.81',
          currency: 'EUR',
          lineItems: [
            {
              preview_option_id: 'option_live',
              sku: 'DOT/VF/60X80/WO/BLACK/STD',
              quantity: 1,
            },
          ],
          itemCount: 1,
        },
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /MGE order draft fetch failed \(404\)/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/456/')
})

test('rejects tampered order drafts before creating Stripe sessions', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(canonicalPurchaseOptionsPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview_id: 'preview_123',
        preview_option_id: 'option_123',
        sku: 'DOT/VF/40X50/W/BLACK/STD',
        identity_token: await identityToken(),
        order_draft_id: '123',
        order_draft: orderDraft({ unitPrice: '1.00' }),
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /price does not match/i)
  assert.equal(calls.length, 1)
})

test('rejects live Stripe secret keys for sandbox-only checkout', async () => {
  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', { method: 'POST' }),
    { ...env, STRIPE_SECRET_KEY: 'sk_live_nope' },
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /sandbox/i)
})

test('checkout status returns safe customer states from Stripe and the durable outbox', async () => {
  const cases: Array<{
    stripeSessionId: string
    outboxState: PaymentSubmitOutboxRecord['state']
    submissionState: string
    terminal: boolean
    orderId?: string
  }> = [
    { stripeSessionId: 'cs_test_status_paid', outboxState: 'paid', submissionState: 'paid', terminal: false },
    { stripeSessionId: 'cs_test_status_submitting', outboxState: 'mge_submitting', submissionState: 'submitting', terminal: false },
    { stripeSessionId: 'cs_test_status_submitted', outboxState: 'mge_submitted', submissionState: 'submitted', terminal: true, orderId: 'MGE2404230001' },
    { stripeSessionId: 'cs_test_status_retrying', outboxState: 'mge_retrying', submissionState: 'retrying', terminal: false },
    { stripeSessionId: 'cs_test_status_review', outboxState: 'mge_failed_manual_review', submissionState: 'manual_review', terminal: true },
  ]

  for (const statusCase of cases) {
    const outbox = memoryPaymentSubmitOutbox()
    await outbox.binding.upsert({
      stripeSessionId: statusCase.stripeSessionId,
      verifiedEmail: 'private@example.com',
      mgeOrderDraftId: '123',
      mgeOrderId: statusCase.orderId ?? null,
      state: statusCase.outboxState,
      attemptCount: 2,
      lastError: 'private upstream detail',
    })
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      id: statusCase.stripeSessionId,
      payment_status: 'paid',
      status: 'complete',
      metadata: {
        source: 'dottingo_landing',
        brand_key: 'dottingo',
        order_draft_id: '123',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await getStripeCheckoutStatus(
      new Request(`https://makeyourcraft.com/api/checkout/status?session_id=${statusCase.stripeSessionId}`),
      { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
      fetcher,
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as Record<string, unknown>
    assert.equal(payload.sessionId, statusCase.stripeSessionId)
    assert.equal(payload.paymentState, 'paid')
    assert.equal(payload.submissionState, statusCase.submissionState)
    assert.equal(payload.orderDraftId, '123')
    assert.equal(payload.orderId, statusCase.orderId ?? null)
    assert.equal(payload.terminal, statusCase.terminal)
    assert.equal(typeof payload.message, 'string')
    assert.equal('lastError' in payload, false)
    assert.equal('verifiedEmail' in payload, false)
  }
})

test('checkout status verifies the Stripe session belongs to Dottingo', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  const response = await getStripeCheckoutStatus(
    new Request('https://makeyourcraft.com/api/checkout/status?session_id=cs_test_other_store'),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    async () => new Response(JSON.stringify({
      id: 'cs_test_other_store',
      payment_status: 'paid',
      metadata: { source: 'another_store', brand_key: 'other' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Checkout Session was not found' })
})

test('checkout status rejects malformed Stripe session ids before any upstream call', async () => {
  let upstreamCalled = false
  const response = await getStripeCheckoutStatus(
    new Request('https://makeyourcraft.com/api/checkout/status?session_id=not-a-session'),
    env,
    async () => {
      upstreamCalled = true
      throw new Error('should not run')
    },
  )

  assert.equal(response.status, 400)
  assert.equal(upstreamCalled, false)
})

test('verifies Stripe webhook signatures before accepting events', async () => {
  const payload = JSON.stringify({ id: 'evt_test_123', type: 'checkout.session.completed' })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhook(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    env,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'not_applicable' },
  })
})

test('Stripe webhook submits the paid MGE order draft with a Stripe idempotency key', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ id: 'MGE2404230001', status: 'submitted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const payload = JSON.stringify({
    id: 'evt_test_456',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_paid_123',
        payment_status: 'paid',
        metadata: {
          order_draft_id: '123',
          preview_id: 'preview_123',
        },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'submitted', orderDraftId: '123', orderId: 'MGE2404230001' },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/123/submit/')
  const headers = new Headers(calls[0].init.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mge_test_token')
  assert.equal(headers.get('Idempotency-Key'), 'stripe-checkout:cs_test_paid_123:123')
})

test('Stripe webhook records paid and submitted states in the payment submit outbox', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ submitted_order_id: 'order_456', status: 'submitted' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  const payload = JSON.stringify({
    id: 'evt_test_outbox_paid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_outbox_paid',
        payment_status: 'paid',
        metadata: {
          order_draft_id: '123',
          verified_email: 'paid@example.com',
        },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(outbox.writes.map((write) => write.state), ['paid', 'mge_submitting', 'mge_submitted'])
  assert.deepEqual(outbox.rows.get('cs_test_outbox_paid'), {
    stripeSessionId: 'cs_test_outbox_paid',
    stripeEventId: 'evt_test_outbox_paid',
    verifiedEmail: 'paid@example.com',
    mgeOrderDraftId: '123',
    state: 'mge_submitted',
    attemptCount: 1,
    lastError: null,
    mgeOrderId: 'order_456',
  })
})

test('Stripe webhook returns non-2xx and skips MGE submit when paid event cannot be durably recorded', async () => {
  const outbox = memoryPaymentSubmitOutbox({ failOnState: 'paid' })
  const payload = JSON.stringify({
    id: 'evt_test_outbox_failure',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_outbox_failure',
        payment_status: 'paid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    async () => {
      throw new Error('MGE should not be called when outbox persistence fails')
    },
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /outbox rejected paid/)
})

test('duplicate Stripe webhook events upsert one payment submit outbox row', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  let submitCalls = 0
  const fetcher: typeof fetch = async () => {
    submitCalls += 1
    return new Response(JSON.stringify({ submitted_order_id: 'order_456', status: 'submitted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const payload = JSON.stringify({
    id: 'evt_test_duplicate_outbox',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_duplicate_outbox',
        payment_status: 'paid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  for (let index = 0; index < 2; index += 1) {
    const response = await handleStripeWebhookWithFetcher(
      new Request('https://makeyourcraft.com/api/stripe/webhook', {
        method: 'POST',
        body: payload,
        headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
      }),
      { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
      fetcher,
    )
    assert.equal(response.status, 200)
  }

  assert.equal(outbox.rows.size, 1)
  assert.equal(submitCalls, 1)
  assert.equal(outbox.rows.get('cs_test_duplicate_outbox')?.state, 'mge_submitted')
  assert.equal(outbox.rows.get('cs_test_duplicate_outbox')?.mgeOrderId, 'order_456')
})

test('concurrent duplicate Stripe webhook events allow only one active MGE submit', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  let submitCalls = 0
  let releaseSubmit: (() => void) | undefined
  let markSubmitStarted: (() => void) | undefined
  const submitStarted = new Promise<void>((resolve) => {
    markSubmitStarted = resolve
  })
  const submitReleased = new Promise<void>((resolve) => {
    releaseSubmit = resolve
  })
  const fetcher: typeof fetch = async () => {
    submitCalls += 1
    markSubmitStarted?.()
    await submitReleased
    return new Response(JSON.stringify({ id: 'order_concurrent', status: 'submitted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const payload = JSON.stringify({
    id: 'evt_test_concurrent_outbox',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_concurrent_outbox',
        payment_status: 'paid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)
  const webhookRequest = () => new Request('https://makeyourcraft.com/api/stripe/webhook', {
    method: 'POST',
    body: payload,
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
  })

  const firstResponsePromise = handleStripeWebhookWithFetcher(
    webhookRequest(),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )
  await submitStarted

  const duplicateResponse = await handleStripeWebhookWithFetcher(
    webhookRequest(),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )
  assert.equal(duplicateResponse.status, 200)
  assert.deepEqual(await duplicateResponse.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'submit_in_progress', orderDraftId: '123' },
  })
  assert.equal(submitCalls, 1)

  releaseSubmit?.()
  const firstResponse = await firstResponsePromise
  assert.equal(firstResponse.status, 200)
  assert.equal(outbox.rows.get('cs_test_concurrent_outbox')?.state, 'mge_submitted')
})

test('Stripe webhook retries a transient MGE submit failure with the same durable session', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  let submitCalls = 0
  const fetcher: typeof fetch = async () => {
    submitCalls += 1
    if (submitCalls === 1) {
      return new Response(JSON.stringify({ detail: 'MGE temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ id: 'order_retry_456', status: 'submitted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const payload = JSON.stringify({
    id: 'evt_test_retry_outbox',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_retry_outbox',
        payment_status: 'paid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)
  const webhookRequest = () => new Request('https://makeyourcraft.com/api/stripe/webhook', {
    method: 'POST',
    body: payload,
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
  })

  const firstResponse = await handleStripeWebhookWithFetcher(
    webhookRequest(),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )
  assert.notEqual(firstResponse.status, 200)
  assert.equal(outbox.rows.get('cs_test_retry_outbox')?.state, 'mge_retrying')
  assert.equal(outbox.rows.get('cs_test_retry_outbox')?.attemptCount, 1)
  assert.match(outbox.rows.get('cs_test_retry_outbox')?.lastError ?? '', /temporarily unavailable/)

  const retryResponse = await handleStripeWebhookWithFetcher(
    webhookRequest(),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )
  assert.equal(retryResponse.status, 200)
  assert.equal(submitCalls, 2)
  assert.equal(outbox.rows.get('cs_test_retry_outbox')?.state, 'mge_submitted')
  assert.equal(outbox.rows.get('cs_test_retry_outbox')?.attemptCount, 2)
  assert.equal(outbox.rows.get('cs_test_retry_outbox')?.mgeOrderId, 'order_retry_456')
})

test('Stripe webhook skips MGE submit when Checkout Session is not paid yet', async () => {
  const payload = JSON.stringify({
    id: 'evt_test_unpaid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_unpaid',
        payment_status: 'unpaid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    env,
    async () => {
      throw new Error('MGE should not be called for unpaid checkout sessions')
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'not_paid', orderDraftId: '123' },
  })
})

test('Stripe webhook treats already-submitted MGE drafts as idempotent success', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({
    detail: 'Order draft was already submitted',
    submitted_order_id: 'order_789',
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  })
  const payload = JSON.stringify({
    id: 'evt_test_duplicate',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_duplicate',
        payment_status: 'paid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'already_submitted', orderDraftId: '123', orderId: 'order_789' },
  })
  assert.equal(outbox.rows.get('cs_test_duplicate')?.state, 'mge_submitted')
  assert.equal(outbox.rows.get('cs_test_duplicate')?.mgeOrderId, 'order_789')
})

test('Stripe webhook rejects paid sessions without MGE draft metadata', async () => {
  const outbox = memoryPaymentSubmitOutbox()
  const payload = JSON.stringify({
    id: 'evt_test_missing_draft',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_missing_draft',
        payment_status: 'paid',
        metadata: {},
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)
  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    { ...env, PAYMENT_SUBMIT_OUTBOX: outbox.binding },
    async () => {
      throw new Error('MGE should not be called without draft metadata')
    },
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /missing MGE order draft id metadata/i)
  assert.equal(outbox.rows.size, 0)
})

test('Stripe webhook blocks paid MGE submit when the durable outbox is not configured', async () => {
  const payload = JSON.stringify({
    id: 'evt_test_missing_outbox',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_missing_outbox',
        payment_status: 'paid',
        metadata: { order_draft_id: '123' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)
  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    env,
    async () => {
      throw new Error('MGE should not be called without durable submit state')
    },
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /PAYMENT_SUBMIT_OUTBOX is required/i)
})

test('Stripe webhook rejects synthetic MGE draft ids instead of submitting them', async () => {
  const payload = JSON.stringify({
    id: 'evt_test_synthetic',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_synthetic',
        payment_status: 'paid',
        metadata: { order_draft_id: 'preview-option:DOT/VF/60X80/WO/BLACK/STD' },
      },
    },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await signStripeWebhookPayloadForTest(payload, env.STRIPE_WEBHOOK_SECRET!, timestamp)

  const response = await handleStripeWebhookWithFetcher(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    }),
    env,
    async () => {
      throw new Error('MGE should not be called for synthetic draft ids')
    },
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /real numeric id before submit/i)
})

test('rejects Stripe webhooks with invalid signatures', async () => {
  const response = await handleStripeWebhook(
    new Request('https://makeyourcraft.com/api/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_test_123', type: 'checkout.session.completed' }),
      headers: { 'Stripe-Signature': 't=123,v1=bad' },
    }),
    env,
  )

  assert.equal(response.status, 400)
  assert.match(await response.text(), /signature/i)
})
