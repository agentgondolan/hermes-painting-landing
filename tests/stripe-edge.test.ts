import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateRetailPriceQuote,
  createStripeCheckoutSession,
  handleStripeWebhook,
  handleStripeWebhookWithFetcher,
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
    orderDraftId: 'draft_123',
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
        order_draft_id: 'draft_123',
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
  assert.equal(body.get('metadata[order_draft_id]'), 'draft_123')
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
    if (String(url).includes('/api/v1/order-drafts/draft_multi/')) {
      return new Response(JSON.stringify({
        id: 'draft_multi',
        product: 'DOT',
        status: 'DRAFT',
        line_items: [
          {
            preview_option_id: 'option_a',
            sku: 'DOT/VF/40X50/W/BLACK/STD',
            quantity: 2,
            unit_price: '10.72',
            currency: 'EUR',
            selected_size: '40x50',
            label: '40x50 without frame',
          },
          {
            preview_option_id: 'option_b',
            sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD',
            quantity: 1,
            unit_price: '18.25',
            currency: 'EUR',
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
        order_draft_id: 'draft_multi',
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
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/draft_multi/')
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer mge_test_token')
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/checkout/sessions')
  const body = calls[1].init.body as URLSearchParams
  assert.equal(body.get('line_items[0][price]'), null)
  assert.equal(body.get('line_items[0][quantity]'), '2')
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '3499')
  assert.equal(body.get('line_items[0][price_data][product_data][name]'), '40x50 without frame')
  assert.equal(body.get('line_items[1][quantity]'), '1')
  assert.equal(body.get('line_items[1][price_data][unit_amount]'), '5899')
  assert.equal(body.get('line_items[1][price_data][product_data][name]'), '60x80 with frame')
  assert.equal(body.get('metadata[order_draft_id]'), 'draft_multi')
  assert.equal(body.get('metadata[item_count]'), '2')
  assert.equal(body.get('metadata[sku]'), 'DOT/VF/40X50/W/BLACK/STD,DOT/VF/60X80/W/BLACK/FRAME/STD')
  assert.equal(body.get('metadata[preview_option_id]'), 'option_a,option_b')
  assert.equal(body.get('metadata[verified_email]'), 'multi@example.com')
  assert.equal(body.get('metadata[retail_total_amount_sgd]'), '12897')
  assert.equal(body.get('customer_email'), 'multi@example.com')
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
        order_draft_id: 'draft_123',
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
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({ submitted_order_id: 'order_456', status: 'submitted' }), {
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
          order_draft_id: 'draft_123',
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
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'submitted', orderDraftId: 'draft_123', orderId: 'order_456' },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://mge.test/api/v1/order-drafts/draft_123/submit/')
  const headers = new Headers(calls[0].init.headers)
  assert.equal(headers.get('Authorization'), 'Bearer mge_test_token')
  assert.equal(headers.get('Idempotency-Key'), 'stripe-checkout:cs_test_paid_123:draft_123')
})

test('Stripe webhook skips MGE submit when Checkout Session is not paid yet', async () => {
  const payload = JSON.stringify({
    id: 'evt_test_unpaid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_unpaid',
        payment_status: 'unpaid',
        metadata: { order_draft_id: 'draft_123' },
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
    mgeOrderSubmission: { status: 'not_paid', orderDraftId: 'draft_123' },
  })
})

test('Stripe webhook treats already-submitted MGE drafts as idempotent success', async () => {
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
        metadata: { order_draft_id: 'draft_123' },
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
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    received: true,
    event: 'checkout.session.completed',
    magicLinkDelivery: 'not_applicable',
    mgeOrderSubmission: { status: 'already_submitted', orderDraftId: 'draft_123', orderId: 'order_789' },
  })
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
