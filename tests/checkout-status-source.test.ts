import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const successPageSource = readFileSync(new URL('../app/checkout/success/page.tsx', import.meta.url), 'utf8')
const successStatusSource = readFileSync(new URL('../components/checkout/checkout-success-status.tsx', import.meta.url), 'utf8')
const cancelPageSource = readFileSync(new URL('../app/checkout/cancel/page.tsx', import.meta.url), 'utf8')
const statusFunctionSource = readFileSync(new URL('../functions/api/checkout/status.ts', import.meta.url), 'utf8')
const cartSource = readFileSync(new URL('../components/cart/multi-project-cart-page.tsx', import.meta.url), 'utf8')
const cartStorageSource = readFileSync(new URL('../lib/cart/browser-storage.ts', import.meta.url), 'utf8')

test('checkout success page polls the server-side durable status endpoint', () => {
  assert.equal(successPageSource.includes('CheckoutSuccessStatus'), true)
  assert.equal(successStatusSource.includes('/api/checkout/status?session_id='), true)
  assert.equal(successStatusSource.includes('window.setTimeout(poll'), true)
  assert.equal(successStatusSource.includes('cache: "no-store"'), true)
  assert.equal(statusFunctionSource.includes('getStripeCheckoutStatus'), true)
})

test('checkout success page renders every safe customer order state', () => {
  assert.match(successStatusSource, /submitted/)
  assert.match(successStatusSource, /manual_review/)
  assert.match(successStatusSource, /retrying/)
  assert.match(successStatusSource, /submitting/)
  assert.match(successStatusSource, /paymentState/)
  assert.equal(successStatusSource.includes('lastError'), false)
  assert.equal(successStatusSource.includes('verifiedEmail'), false)
})

test('checkout cart survives cancellation and clears only after confirmed submission', () => {
  assert.equal(cancelPageSource.includes('href="/checkout"'), true)
  assert.equal(cancelPageSource.includes('Your selected designs are still in the checkout.'), true)
  assert.equal(cartSource.includes('readStoredCartSelections'), true)
  assert.equal(cartSource.includes('writeStoredCartSelections(selections)'), true)
  assert.equal(cartStorageSource.includes('CART_SELECTIONS_STORAGE_KEY'), true)
  assert.match(successStatusSource, /submissionState === "submitted"[\s\S]*clearStoredCartState\(\)/)
})
