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
  assert.equal(normalized.purchaseOptions.length, 3)

  const [standard, withoutFrame, wrappedWood] = normalized.purchaseOptions
  assert.equal(standard.purchaseOptionId, 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(standard.previewOptionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(standard.sku, 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(standard.product, 'DOT')
  assert.equal(standard.label, 'BLACK / source / Standard')
  assert.equal(standard.frameCode, 'W')
  assert.equal(standard.frameLabel, 'With frame')
  assert.equal(standard.productionSpeedCode, 'STD')
  assert.equal(standard.productionSpeedLabel, 'Standard')
  assert.equal(standard.orderLine?.sku, 'DOT/VF/40X50/W/BLACK/STD')
  assert.equal(standard.orderLine?.quantity, 1)
  assert.equal(standard.unitPrice, '10.72')
  assert.equal(standard.currency, 'EUR')
  assert.equal(standard.previewUrl, '[REDACTED_URL]')

  assert.equal(withoutFrame.purchaseOptionId, 'DOT/VF/40X50/WO/BLACK/STD')
  assert.equal(withoutFrame.previewOptionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(withoutFrame.frameCode, 'WO')
  assert.equal(withoutFrame.frameLabel, 'Without frame')
  assert.equal(withoutFrame.productionSpeedCode, 'STD')
  assert.equal(withoutFrame.productionSpeedLabel, 'Standard')
  assert.equal(withoutFrame.orderLine?.sku, 'DOT/VF/40X50/WO/BLACK/STD')
  assert.equal(withoutFrame.unitPrice, '7.14')

  assert.equal(wrappedWood.purchaseOptionId, 'DOT/VF/40X50/WW/BLACK/STD')
  assert.equal(wrappedWood.previewOptionId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.equal(wrappedWood.frameCode, 'WW')
  assert.equal(wrappedWood.frameLabel, 'Wrapped wood')
  assert.equal(wrappedWood.orderLine?.sku, 'DOT/VF/40X50/WW/BLACK/STD')
  assert.equal(wrappedWood.unitPrice, '11.11')
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
    assert.equal(payload.purchaseOptions.length, 3)
    assert.equal(payload.purchaseOptions[0].orderLine?.sku, 'DOT/VF/40X50/W/BLACK/STD')
    assert.equal(payload.purchaseOptions[1].orderLine?.sku, 'DOT/VF/40X50/WO/BLACK/STD')

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

test('preview BFF always uses Dottingo brand 64 even if legacy B2B env brand is configured', async () => {
  const calls: Array<{ url: string; init: RequestInit; body: FormData }> = []
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (url, init) => {
    const body = init?.body as FormData
    calls.push({ url: String(url), init: init ?? {}, body })
    return new Response(JSON.stringify({ id: 'preview-123', status: 'COMPLETED' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const form = new FormData()
    form.set('image', new File(['fake-image'], 'art.png', { type: 'image/png' }))

    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/preview', {
        method: 'POST',
        body: form,
      }),
      env,
    )

    assert.equal(response.status, 201)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/preview/')
    assert.equal(calls[0].body.get('brand_id'), '64')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preview BFF preserves MGE source image fields for account history thumbnails', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      id: 'preview-123',
      status: 'COMPLETED',
      source_group_id: 'source-group-123',
      source_image: {
        url: 'https://mge.example.test/media/source-photo.jpg',
      },
      options: [
        {
          preview_option_id: 'option-123',
          orderable: true,
          preview_url: 'https://mge.example.test/media/generated-dot.jpg',
        },
      ],
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const form = new FormData()
    form.set('image', new File(['fake-image'], 'art.png', { type: 'image/png' }))

    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/preview', {
        method: 'POST',
        body: form,
      }),
      env,
    )

    assert.equal(response.status, 201)
    const payload = await response.json() as {
      imageUrl: string | null
      sourceImageUrl: string | null
      sourceGroupId: string | null
    }
    assert.equal(payload.imageUrl, 'https://mge.example.test/media/generated-dot.jpg')
    assert.equal(payload.sourceImageUrl, 'https://mge.example.test/media/source-photo.jpg')
    assert.equal(payload.sourceGroupId, 'source-group-123')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('preview BFF preserves orientation metadata when MGE returns it', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({
      id: 'preview-landscape-123',
      status: 'COMPLETED',
      frame_orientation: 'landscape',
      preview_url: 'https://mge.example.test/media/landscape-dot.jpg',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/preview/preview-landscape-123'),
      env,
    )

    assert.equal(response.status, 200)
    const payload = await response.json() as { orientation: string | null }
    assert.equal(payload.orientation, 'horizontal')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('image proxy caches account source and preview images for repeat checkout views', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  const inits: Array<RequestInit & { cf?: { image?: Record<string, unknown> } }> = []

  globalThis.fetch = (async (url, init) => {
    calls.push(String(url))
    inits.push(init ?? {})
    return new Response('fake-image', {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/image?url=https%3A%2F%2Fcdn.example.test%2Fsource.jpg%3Fsig%3Dabc'),
      env,
    )

    assert.equal(response.status, 200)
    assert.equal(calls[0], 'https://cdn.example.test/source.jpg?sig=abc')
    assert.equal(response.headers.get('Content-Type'), 'image/jpeg')
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800')
    assert.equal(response.headers.get('Vary'), 'Accept, Origin')
    assert.equal(inits[0].cf, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('image proxy forwards bounded resize options for account thumbnails', async () => {
  const originalFetch = globalThis.fetch
  let upstreamInit: (RequestInit & { cf?: { image?: Record<string, unknown> } }) | null = null

  globalThis.fetch = (async (_url, init) => {
    upstreamInit = init ?? {}
    return new Response('fake-image', {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/image?url=https%3A%2F%2Fcdn.example.test%2Fsource.jpg&width=160&height=160&fit=cover'),
      env,
    )

    assert.equal(response.status, 200)
    assert.deepEqual(upstreamInit?.cf?.image, {
      width: 160,
      height: 160,
      fit: 'cover',
      quality: 78,
      format: 'auto',
    })
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

test('order-draft BFF posts to documented plural MGE order-drafts endpoint', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/preview/preview-123/purchase-options/')) {
      return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({
        id: '123',
        preview_id: 'preview-123',
        status: 'DRAFT',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview_id: 'preview-123',
          preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          selected_size: '40x50',
          delivery_address: {
            name: 'Test Customer',
            email: 'test@example.com',
            phone: '+65 8123 4567',
            line1: '1 Test Street',
            city: 'Singapore',
            postal_code: '018956',
            country: 'SG',
          },
        }),
      }),
      env,
    )

    assert.equal(response.status, 201)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/preview/preview-123/purchase-options/')
    assert.equal(calls[1].url, 'https://mge.example.test/api/v1/order-drafts/')

    const headers = new Headers(calls[1].init.headers)
    assert.equal(headers.get('Authorization'), 'Bearer mge_test_token')
    assert.equal(headers.get('Content-Type'), 'application/json')

    const upstreamBody = JSON.parse(String(calls[1].init.body))
    assert.equal(upstreamBody.brand_id, '64')
    assert.equal(upstreamBody.preview_id, 'preview-123')
    assert.equal(upstreamBody.preview_option_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    assert.equal('purchase_option_id' in upstreamBody, false)
    assert.deepEqual(upstreamBody.shipping_address, {
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '+65 8123 4567',
      street: '1 Test Street',
      city: 'Singapore',
      zip: '018956',
      country: 'SG',
    })
    assert.deepEqual(upstreamBody.line_items, [{ preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 }])
    assert.equal('asset_url' in upstreamBody.line_items[0], false)
    assert.equal('delivery_address' in upstreamBody, false)
    assert.equal('order_lines' in upstreamBody, false)
    assert.equal('line1' in upstreamBody.shipping_address, false)
    assert.equal('postal_code' in upstreamBody.shipping_address, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF rejects successful MGE draft responses without a numeric id', async () => {
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

  globalThis.fetch = (async (url) => {
    if (String(url).includes('/api/v1/preview/preview-123/purchase-options/')) {
      return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      status: 'DRAFT',
      line_items: [{ preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 }],
    }), { status: 201, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview_id: 'preview-123',
          preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
        }),
      }),
      env,
    )

    assert.equal(response.status, 502)
    assert.match(await response.text(), /submit-ready draft id/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF creates draft without local delivery fields because MGE draft is canonical', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    if (String(url).includes('/api/v1/preview/preview-123/purchase-options/')) {
      return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({
        id: '123',
        preview_id: 'preview-123',
        status: 'DRAFT',
        item_count: 1,
        line_items: [{ preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 }],
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview_id: 'preview-123',
          preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          selected_size: '40x50',
        }),
      }),
      env,
    )

    assert.equal(response.status, 201)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/preview/preview-123/purchase-options/')
    assert.equal(calls[1].url, 'https://mge.example.test/api/v1/order-drafts/')

    const upstreamBody = JSON.parse(String(calls[1].init.body))
    assert.equal(upstreamBody.brand_id, '64')
    assert.equal(upstreamBody.preview_id, 'preview-123')
    assert.equal(upstreamBody.preview_option_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    assert.equal('shipping_address' in upstreamBody, false)
    assert.deepEqual(upstreamBody.line_items, [{ preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 }])

    const payload = await response.json() as { itemCount?: number; lineItems?: unknown[] }
    assert.equal(payload.itemCount, 1)
    assert.equal(payload.lineItems?.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF edits existing MGE draft by PATCHing merged line_items', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  const existingLine = { preview_option_id: 'existing-option', sku: 'EXISTING/SKU', quantity: 1 }

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    const target = String(url)
    if (target.includes('/api/v1/preview/preview-123/purchase-options/')) {
      return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (target === 'https://mge.example.test/api/v1/order-drafts/123/' && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ id: '123', line_items: [existingLine], item_count: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({
      id: '123',
      preview_id: 'preview-123',
      status: 'DRAFT',
      item_count: 2,
      line_items: [existingLine, { preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_draft_id: '123',
          preview_id: 'preview-123',
          preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sku: 'DOT/VF/40X50/W/BLACK/STD',
          selected_size: '40x50',
        }),
      }),
      env,
    )

    assert.equal(response.status, 200)
    assert.equal(calls.length, 3)
    assert.equal(calls[1].url, 'https://mge.example.test/api/v1/order-drafts/123/')
    assert.equal(calls[2].url, 'https://mge.example.test/api/v1/order-drafts/123/')
    assert.equal(calls[2].init.method, 'PATCH')
    const upstreamBody = JSON.parse(String(calls[2].init.body))
    assert.deepEqual(upstreamBody.line_items, [existingLine, { preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 1 }])
    const payload = await response.json() as { itemCount?: number; lineItems?: unknown[] }
    assert.equal(payload.itemCount, 2)
    assert.equal(payload.lineItems?.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF syncs multi-preview cart lines by replacing draft line_items', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  const secondFixture = {
    ...fixture,
    preview_id: 'preview-456',
    purchase_options: [
      {
        ...fixture.purchase_options[0],
        preview_option_id: 'ffffffff-1111-2222-3333-444444444444',
        label: 'BLACK / source / Framed',
        order_line: {
          preview_option_id: 'ffffffff-1111-2222-3333-444444444444',
          sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD',
          quantity: 1,
        },
        unit_price: '18.25',
      },
    ],
  }

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    const target = String(url)
    if (target.includes('/api/v1/preview/preview-123/purchase-options/')) {
      return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (target.includes('/api/v1/preview/preview-456/purchase-options/')) {
      return new Response(JSON.stringify(secondFixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      id: '123',
      status: 'DRAFT',
      item_count: 2,
      line_items: [
        { preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 2 },
        { preview_option_id: 'ffffffff-1111-2222-3333-444444444444', sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD', quantity: 1 },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_draft_id: '123',
          cart_lines: [
            {
              preview_id: 'preview-123',
              preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
              sku: 'DOT/VF/40X50/W/BLACK/STD',
              quantity: 2,
              unit_price: '0.01',
              order_line: { sku: 'TAMPERED/SKU', quantity: 99 },
              design_image_url: 'https://mge.example.test/generated-display-only.jpg',
            },
            {
              preview_id: 'preview-456',
              preview_option_id: 'ffffffff-1111-2222-3333-444444444444',
              sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD',
              quantity: 1,
              source_image_url: 'https://mge.example.test/source-display-only.jpg',
            },
          ],
        }),
      }),
      env,
    )

    assert.equal(response.status, 200)
    assert.equal(calls.length, 3)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/preview/preview-123/purchase-options/')
    assert.equal(calls[1].url, 'https://mge.example.test/api/v1/preview/preview-456/purchase-options/')
    assert.equal(calls[2].url, 'https://mge.example.test/api/v1/order-drafts/123/')
    assert.equal(calls[2].init.method, 'PATCH')

    const upstreamBody = JSON.parse(String(calls[2].init.body))
    assert.equal(upstreamBody.source, 'dottingo_cart')
    assert.equal(upstreamBody.preview_id, undefined)
    assert.equal(upstreamBody.preview_option_id, undefined)
    assert.equal(upstreamBody.unit_price, undefined)
    assert.deepEqual(upstreamBody.line_items, [
      { preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', sku: 'DOT/VF/40X50/W/BLACK/STD', quantity: 2 },
      { preview_option_id: 'ffffffff-1111-2222-3333-444444444444', sku: 'DOT/VF/60X80/W/BLACK/FRAME/STD', quantity: 1 },
    ])

    const payload = await response.json() as { itemCount?: number; lineItems?: unknown[] }
    assert.equal(payload.itemCount, 2)
    assert.equal(payload.lineItems?.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF rejects tampered cart lines before mutating an MGE draft', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_draft_id: '123',
          cart_lines: [
            {
              preview_id: 'preview-123',
              preview_option_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
              sku: 'DOT/VF/40X50/W/BLACK/NOT-REAL',
              quantity: 1,
            },
          ],
        }),
      }),
      env,
    )

    assert.equal(response.status, 409)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/preview/preview-123/purchase-options/')
    const text = await response.text()
    assert.match(text, /no longer orderable/i)
    assert.doesNotMatch(text, /mge_test_token/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF can clear an existing cart draft by syncing empty cart_lines', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({
      id: '123',
      status: 'DRAFT',
      item_count: 0,
      line_items: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_draft_id: '123',
          cart_lines: [],
        }),
      }),
      env,
    )

    assert.equal(response.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://mge.example.test/api/v1/order-drafts/123/')
    const upstreamBody = JSON.parse(String(calls[0].init.body))
    assert.deepEqual(upstreamBody.line_items, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('order-draft BFF accepts an empty cart without creating a new MGE draft', async () => {
  const originalFetch = globalThis.fetch
  let called = false

  globalThis.fetch = (async () => {
    called = true
    return new Response('{}')
  }) as typeof fetch

  try {
    const response = await handleMgeBffRequest(
      new Request('https://makeyourcraft.com/api/mge/order-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_lines: [] }),
      }),
      env,
    )

    assert.equal(response.status, 200)
    assert.equal(called, false)
    const payload = await response.json() as {
      orderDraftId: string
      status: string
      itemCount: number
      lineItems: unknown[]
    }
    assert.equal(payload.orderDraftId, '')
    assert.equal(payload.status, 'EMPTY')
    assert.equal(payload.itemCount, 0)
    assert.deepEqual(payload.lineItems, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})
