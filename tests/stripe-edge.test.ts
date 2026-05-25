import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateRetailPriceQuote,
  createStripeCheckoutSession,
  handleStripeWebhook,
  signStripeWebhookPayloadForTest,
  type StripeEnv,
} from '../lib/stripe/edge.ts'

const env: StripeEnv = {
  STRIPE_SECRET_KEY: 'sk_test_local',
  STRIPE_PRICE_ID: 'price_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_local',
  EUR_TO_SGD_RATE: '1.46',
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
})

test('calculates SGD checkout amount from MGE EUR unit cost with margin and GST', () => {
  const quote = calculateRetailPriceQuote('10.72', 'EUR', 1.46)
  assert.equal(quote.unitAmount, 3499)
  assert.equal(quote.displayAmount, '34.99')
  assert.equal(quote.sourceCurrency, 'EUR')
})

test('creates a dynamic SGD Checkout Session from the selected MGE purchase option', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
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
        selected_size: '40x50',
        purchase_option: {
          previewOptionId: 'option_123',
          product: 'DOT',
          label: 'BLACK / source / Standard',
          unitPrice: '10.72',
          currency: 'EUR',
          productionSpeed: { code: 'STD', label: 'Standard' },
          orderLine: {
            preview_option_id: 'option_123',
            sku: 'DOT/VF/40X50/W/BLACK/STD',
            quantity: 1,
          },
        },
      }),
    }),
    env,
    fetcher,
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  const body = calls[0].init.body as URLSearchParams
  assert.equal(body.get('line_items[0][price]'), null)
  assert.equal(body.get('line_items[0][price_data][currency]'), 'sgd')
  assert.equal(body.get('line_items[0][price_data][unit_amount]'), '3499')
  assert.equal(body.get('line_items[0][price_data][product_data][name]'), 'Custom Paint-by-Number Kit')
  assert.equal(body.get('metadata[preview_id]'), 'preview_123')
  assert.equal(body.get('metadata[preview_option_id]'), 'option_123')
  assert.equal(body.get('metadata[sku]'), 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(body.get('metadata[retail_unit_amount_sgd]'), '3499')
})

test('rejects mismatched selected purchase options', async () => {
  const response = await createStripeCheckoutSession(
    new Request('https://makeyourcraft.com/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview_id: 'preview_123',
        preview_option_id: 'option_123',
        purchase_option: {
          previewOptionId: 'other_option',
          unitPrice: '10.72',
          currency: 'EUR',
        },
      }),
    }),
    env,
  )

  assert.equal(response.status, 500)
  assert.match(await response.text(), /does not match/i)
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
  assert.deepEqual(await response.json(), { received: true, event: 'checkout.session.completed' })
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
