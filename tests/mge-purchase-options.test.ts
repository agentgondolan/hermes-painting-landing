import * as assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import { handleMgeBffRequest, normalizePurchaseOptions, type Env } from '../lib/mgeveryday/bff-handler.ts'

const env: Env = {
  MGEVERYDAY_API_TOKEN: 'mge_test_token',
  MGEVERYDAY_BASE_URL: 'https://mge.example.test',
  MGEVERYDAY_BRAND_ID: '116',
  ALLOWED_ORIGIN: '*',
}

const fixturePath = join(process.cwd(), 'tests/fixtures/mge-purchase-options.sample.json')

test('normalizes MGE purchase options into browser-safe camelCase payload', async () => {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  const normalized = normalizePurchaseOptions(fixture)

  assert.equal(normalized.previewId, '11111111-2222-3333-4444-555555555555')
  assert.equal(normalized.status, 'COMPLETED')
  assert.equal(normalized.purchaseOptions.length, 2)

  const [standard, express] = normalized.purchaseOptions
  assert.equal(standard.purchaseOptionId, 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(standard.previewOptionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(standard.product, 'DOT')
  assert.equal(standard.label, 'BLACK / source / Standard')
  assert.equal(standard.productionSpeedCode, 'STD')
  assert.equal(standard.productionSpeedLabel, 'Standard')
  assert.equal(standard.orderLine?.sku, 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(standard.orderLine?.quantity, 1)
  assert.equal(standard.unitPrice, '10.72')
  assert.equal(standard.currency, 'EUR')
  assert.equal(standard.previewUrl, '[REDACTED_URL]')

  assert.equal(express.purchaseOptionId, 'DOT/VF/40X50/W/BLACK/EXP')
  assert.equal(express.previewOptionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(express.productionSpeedCode, 'EXP')
  assert.equal(express.productionSpeedLabel, 'Express')
  assert.equal(express.orderLine?.sku, 'DOT/VF/40X50/W/BLACK/EXP')
  assert.equal(express.unitPrice, '14.72')
})

test('purchase-options BFF proxies to MGE with server-side token and hides authorization', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/preview/preview-123/purchase-options'),
      env,
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as ReturnType<typeof normalizePurchaseOptions> extends infer T ? Awaited<T> : never
    assert.equal(payload.purchaseOptions.length, 2)
    assert.equal(payload.purchaseOptions[0].orderLine?.sku, 'DOT/VF/40X50/W/BLACK/STD')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/preview/preview-123/purchase-options/')
    const headers = new Headers(calls[0].init.headers)
    assert.equal(headers.get('Authorization'), 'Bearer mge_test_token')

    const body = JSON.stringify(payload)
    assert.doesNotMatch(body, /mge_test_token/)
    assert.doesNotMatch(body, /Authorization/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('purchase-options BFF rejects invalid preview IDs before calling MGE', async () => {
  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return new Response('{}')
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/preview/../../bad/purchase-options'),
      env,
    )

    assert.equal(response.status, 404)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('purchase-options BFF maps MGE 500s to 502 without leaking token', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ detail: 'upstream exploded mge_test_token' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/preview/preview-123/purchase-options'),
      env,
    )

    assert.equal(response.status, 502)
    const text = await response.text()
    assert.match(text, /purchase options request failed/i)
    assert.doesNotMatch(text, /mge_test_token/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
