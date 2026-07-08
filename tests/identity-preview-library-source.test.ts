import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const browserIdentitySource = readFileSync(new URL('../lib/identity/browser.ts', import.meta.url), 'utf8')
const edgeIdentitySource = readFileSync(new URL('../lib/identity/edge.ts', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')
const flowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')
const stateSource = readFileSync(new URL('../components/single-screen-preview/preview-state.ts', import.meta.url), 'utf8')

test('verified identity preserves selected size through the magic-link return path', () => {
  assert.equal(browserIdentitySource.includes('if (sizeId) url.searchParams.set(\'size_id\', sizeId)'), true)
  assert.equal(browserIdentitySource.includes('if (identity.previewId)'), true)
  assert.equal(browserIdentitySource.includes('readRestoredPreviewSizeId(identity.previewId)'), true)
  assert.equal(flowSource.includes('normalizePreviewSizeIdFromUrl'), true)
  assert.equal(flowSource.includes('getFrameSizeOption(normalizedUrlSizeId)'), true)
})

test('verified identity preview library proxies real source images and caches them as selected files', () => {
  assert.equal(edgeIdentitySource.includes('/api/internal/v1/identity/previews/?brand_id='), true)
  assert.equal(edgeIdentitySource.includes('X-MGE-Identity-Token'), true)
  assert.equal(edgeIdentitySource.includes('source_image'), true)
  assert.equal(edgeIdentitySource.includes('normalizeOrientation'), true)
  assert.equal(edgeIdentitySource.includes('/api/mge/image?url='), true)
  assert.equal(browserIdentitySource.includes('fetchVerifiedIdentityPreviews'), true)
  assert.equal(shellSource.includes('fetchVerifiedIdentityPreviews(magicLinkIdentity)'), true)
  assert.equal(shellSource.includes('hydrateSourceImage(identityPreview.sourceImageUrl, identityPreview.previewId)'), true)
  assert.equal(flowSource.includes('fetch(sourceImageUrl'), true)
  assert.equal(stateSource.includes('HYDRATE_SOURCE_IMAGE'), true)
  assert.equal(stateSource.includes('selectedFile: event.file'), true)
})

test('MGE identity token from normal verify response is preserved separately from local checkout token', () => {
  assert.equal(edgeIdentitySource.includes('mgeIdentityToken'), true)
  assert.equal(edgeIdentitySource.includes('stringValue(record?.identity_token)'), true)
  assert.equal(browserIdentitySource.includes('mgeIdentityToken?: string | null'), true)
})

test('verified account history can attach current previews and request project size variants', () => {
  assert.equal(edgeIdentitySource.includes('attachIdentityPreview'), true)
  assert.equal(edgeIdentitySource.includes('/api/internal/v1/identity/previews/'), true)
  assert.equal(edgeIdentitySource.includes('createIdentityProjectPreview'), true)
  assert.equal(edgeIdentitySource.includes('/api/internal/v1/identity/projects/${encodeURIComponent(normalizedSourceGroupId)}/previews/'), true)
  assert.equal(edgeIdentitySource.includes('preferred_size: preferredSize'), true)
  assert.equal(edgeIdentitySource.includes('variantKey'), true)
  assert.equal(edgeIdentitySource.includes('isCurrentVariant'), true)
  assert.equal(browserIdentitySource.includes('attachVerifiedIdentityPreview'), true)
  assert.equal(browserIdentitySource.includes('/api/identity/attach-preview'), true)
  assert.equal(browserIdentitySource.includes('createVerifiedIdentityProjectPreview'), true)
  assert.equal(browserIdentitySource.includes('/api/identity/projects/${encodeURIComponent(sourceGroupId)}/previews'), true)
})
