import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { isTerminalPreview, PreviewClientImpl } from '../lib/mgeveryday/browser-preview.ts'

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
