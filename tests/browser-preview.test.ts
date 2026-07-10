import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { isTerminalPreview, PreviewClientImpl, resolveBffBaseUrl } from '../lib/mgeveryday/browser-preview.ts'

test('preview client defaults to same-origin BFF when public env is absent', () => {
  const originalProcess = globalThis.process

  try {
    // Simulate the browser bundle when Cloudflare Pages did not inline NEXT_PUBLIC_MGE_BFF_BASE_URL.
    // The live site must still call same-origin Pages Functions instead of silently falling back local-only.
    // @ts-expect-error test-only mutation of Node global
    globalThis.process = undefined
    assert.equal(resolveBffBaseUrl(), '')
  } finally {
    globalThis.process = originalProcess
  }
})

test('preview readiness ignores early image URLs while MGE is still processing', () => {
  assert.equal(isTerminalPreview({ status: 'PROCESSING', imageUrl: 'https://mge.example.test/early.jpg' }), false)
  assert.equal(isTerminalPreview({ status: 'COMPLETED', imageUrl: 'https://mge.example.test/final.jpg' }), true)
  assert.equal(isTerminalPreview({ status: 'PARTIAL', imageUrl: null }), true)
})

test('preview client keeps polling when create response has imageUrl but non-terminal status', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`)

    if (String(url).endsWith('/api/mge/preview') && init?.method === 'POST') {
      return new Response(JSON.stringify({
        previewId: 'preview-123',
        status: 'PROCESSING',
        imageUrl: 'https://mge.example.test/early.jpg',
        options: [],
      }), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      previewId: 'preview-123',
      status: 'COMPLETED',
      imageUrl: 'https://mge.example.test/final.jpg',
      options: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const client = new PreviewClientImpl('')
    const created = await client.createPreview(new File(['x'], 'x.png', { type: 'image/png' }))
    assert.equal(isTerminalPreview(created), false)

    const final = isTerminalPreview(created) ? created : await client.pollPreview(created.previewId, { intervalMs: 0, maxWaitMs: 10 })
    assert.equal(final.status, 'COMPLETED')
    assert.equal(calls.length, 2)
    assert.deepEqual(calls, [
      'POST /api/mge/preview',
      'GET /api/mge/preview/preview-123',
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preview client sends clientCropped flag for browser-rendered crops', async () => {
  const originalFetch = globalThis.fetch
  let submittedForm: FormData | null = null

  globalThis.fetch = (async (_url, init) => {
    submittedForm = init?.body instanceof FormData ? init.body : null
    return new Response(JSON.stringify({
      previewId: 'preview-crop-123',
      status: 'COMPLETED',
      imageUrl: 'https://mge.example.test/cropped.jpg',
      options: [],
    }), { status: 201, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const client = new PreviewClientImpl('')
    await client.createPreview(new File(['x'], 'cropped.png', { type: 'image/png' }), '40X50', true)
    assert.equal(submittedForm?.get('preferredSize'), '40X50')
    assert.equal(submittedForm?.get('clientCropped'), 'true')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preview client polls purchase options until MGE exposes orderable options', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url) => {
    calls.push(String(url))
    const purchaseOptions = calls.length < 3 ? [] : [{
      purchaseOptionId: 'DOT/VF/40X50/W/BLACK/STD',
      previewOptionId: 'option-123',
      sku: 'DOT/VF/40X50/W/BLACK/STD',
      product: 'DOT',
      label: 'Standard',
      description: null,
      previewUrl: null,
      mockupUrl: null,
      productionSpeed: { code: 'STD', label: 'Standard' },
      productionSpeedCode: 'STD',
      productionSpeedLabel: 'Standard',
      orderLine: { sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 },
      unitPrice: '10.72',
      currency: 'EUR',
    }]

    return new Response(JSON.stringify({
      previewId: 'preview-123',
      status: 'COMPLETED',
      purchaseOptions,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const client = new PreviewClientImpl('')
    const final = await client.pollPurchaseOptions('preview-123', { intervalMs: 0, maxWaitMs: 1_000 })

    assert.equal(final.purchaseOptions.length, 1)
    assert.equal(calls.length, 3)
    assert.deepEqual(calls, [
      '/api/mge/preview/preview-123/purchase-options',
      '/api/mge/preview/preview-123/purchase-options',
      '/api/mge/preview/preview-123/purchase-options',
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})
