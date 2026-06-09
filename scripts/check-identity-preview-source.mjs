import { readFile } from 'node:fs/promises'

const token = process.env.MGEVERYDAY_API_TOKEN
const baseUrl = (process.env.MGEVERYDAY_BASE_URL || 'https://www.mgeveryday.sg').replace(/\/+$/, '')
if (!token) throw new Error('MGEVERYDAY_API_TOKEN missing')

const brandId = 64
const email = `integrator-test+${Date.now()}@example.com`
const image = await readFile('public/opengraph-image.png')

const form = new FormData()
form.set('brand_id', String(brandId))
form.set('image', new Blob([image], { type: 'image/png' }), 'opengraph-image.png')
form.append('products', 'DOT')
form.set('comparison_count', '1')
form.set('auto_enhance', 'true')
form.set('auto_crop', 'true')
form.set('preferred_size', '40x60')
form.set('preview_options', JSON.stringify({ DOT: [{ variant: 'source' }] }))

const createRes = await fetch(`${baseUrl}/api/v1/preview/`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
const createText = await createRes.text()
if (!createRes.ok) throw new Error(`create failed ${createRes.status}: ${createText.slice(0, 300)}`)
const created = JSON.parse(createText)
const previewId = String(created.preview_id || created.id || created.previewId || '')
if (!previewId) throw new Error(`preview id missing in create response: ${createText.slice(0, 300)}`)

const sessionRes = await fetch(`${baseUrl}/api/internal/v1/identity/testing/session/`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'X-API-Key': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ brand_id: brandId, email, preview_id: previewId }),
})
const sessionText = await sessionRes.text()
if (!sessionRes.ok) throw new Error(`testing session failed ${sessionRes.status}: ${sessionText.slice(0, 300)}`)
const session = JSON.parse(sessionText)
const identityToken = String(session.identity_token || '')
if (!identityToken) throw new Error('identity token missing from testing response')

const libraryRes = await fetch(`${baseUrl}/api/internal/v1/identity/previews/?brand_id=${brandId}`, {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${token}`,
    'X-API-Key': token,
    'X-MGE-Identity-Token': identityToken,
  },
})
const libraryText = await libraryRes.text()
if (!libraryRes.ok) throw new Error(`preview library failed ${libraryRes.status}: ${libraryText.slice(0, 300)}`)
const library = JSON.parse(libraryText)
const rows = Array.isArray(library) ? library : Array.isArray(library.previews) ? library.previews : Array.isArray(library.results) ? library.results : Array.isArray(library.data) ? library.data : []
const row = rows.find((item) => String(item.preview_id || item.previewId || item.id) === previewId) || rows[0]
const sourceImage = row?.source_image || row?.sourceImage || null
const sourceUrl = typeof sourceImage?.url === 'string' ? sourceImage.url : row?.source_image_url || row?.sourceImageUrl || null

console.log(JSON.stringify({
  ok: true,
  previewId,
  createdPreferredSize: '40x60',
  testingSessionOk: Boolean(session.ok),
  libraryCount: rows.length,
  matchingPreviewFound: Boolean(row),
  sourceImagePresent: Boolean(sourceUrl),
  sourceImageKeys: sourceImage && typeof sourceImage === 'object' ? Object.keys(sourceImage).sort() : [],
}, null, 2))
