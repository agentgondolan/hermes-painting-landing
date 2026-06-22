import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const registrySource = readFileSync(new URL('../lib/account/preview-registry.ts', import.meta.url), 'utf8')
const accountSource = readFileSync(new URL('../components/account/account-panel.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')
const flowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')

test('preview registry stores verified previews by normalized email', () => {
  assert.equal(registrySource.includes('dottingo_preview_registry_v1'), true)
  assert.equal(registrySource.includes('normalizeRegistryEmail'), true)
  assert.equal(registrySource.includes('upsertAccountPreview'), true)
  assert.equal(registrySource.includes('isAccountPreviewSaved'), true)
  assert.equal(registrySource.includes('readAccountPreviews'), true)
  assert.equal(registrySource.includes('hideAccountPreview'), true)
})

test('account panel renders verified previews from projects with one card per project and size badges', () => {
  assert.equal(accountSource.includes('readAccountPreviews'), true)
  assert.equal(accountSource.includes('upsertAccountPreview'), true)
  assert.equal(registrySource.includes('sourceImageUrl: preview.sourceImageUrl ?? null'), true)
  assert.equal(accountSource.includes('identityProjectPreviewCards'), true)
  assert.equal(accountSource.includes('library.projects.flatMap((project)'), true)
  assert.equal(accountSource.includes('library.previews.map'), false)
  assert.equal(accountSource.includes('if (projectId) return `project:${projectId}`'), true)
  assert.equal(accountSource.includes('if (sourceGroupId && sourceGroupId !== projectId)'), true)
  assert.equal(accountSource.includes('if (sourceImageUrl) return `image:${sourceImageUrl}`'), true)
  assert.equal(accountSource.includes('aria-label={`Open ${previewBadgeLabel(record)} saved preview`}'), true)
  assert.equal(accountSource.includes('Saved design image'), true)
  assert.equal(accountSource.includes('h-20 w-20'), true)
  assert.equal(accountSource.includes('Open'), true)
  assert.equal(accountSource.includes('Open preview'), false)
  assert.equal(accountSource.includes('Continue checkout'), false)
  assert.equal(accountSource.includes('sizeAvailabilityLabel'), false)
  assert.equal(accountSource.includes('Source thumbnail saved'), false)
  assert.equal(accountSource.includes('Saved size only'), false)
  assert.equal(accountSource.includes('previewGroupsPerPage'), true)
  assert.equal(accountSource.includes('setPreviewPage'), true)
  assert.equal(accountSource.includes('Hide'), true)
  assert.equal(accountSource.includes('Preview list comes next from MGE'), false)
})

test('account preview registry preserves source group ids independently from source image urls', () => {
  assert.equal(registrySource.includes('sourceImageUrl: preview.sourceImageUrl ?? null'), true)
  assert.equal(registrySource.includes('sourceGroupId: preview.sourceGroupId ?? null'), true)
  assert.equal(registrySource.includes('sourceGroupId: preview.sourceImageUrl ?? null'), false)
})

test('account panel treats the current preview as saved from the canonical registry, not only stale component state', () => {
  assert.equal(accountSource.includes('isAccountPreviewSaved(identity.email, previewId)'), true)
  assert.match(accountSource, /savedPreviews\.some\(\(record\) => record\.previewId === previewId\) \|\| isAccountPreviewSaved\(identity\.email, previewId\)/)
  assert.equal(accountSource.includes('Save current preview'), true)
})

test('preview shell registers the current ready preview when a global identity is verified', () => {
  assert.equal(shellSource.includes('upsertAccountPreview'), true)
  assert.equal(shellSource.includes('isAccountPreviewSaved'), true)
  assert.equal(shellSource.includes('currentPreviewSaved'), true)
  assert.equal(shellSource.includes('selectedPreview.status !== "ready"'), true)
  assert.equal(shellSource.includes('account_preview_registered'), true)
})

test('saved preview links carry the saved size so reopened previews keep the correct canvas ratio', () => {
  assert.match(registrySource, /buildPreviewOpenPath\(previewId: string, sizeId\?: string \| null\)/)
  assert.equal(registrySource.includes('params.set("size_id", sizeId)'), true)
  assert.equal(accountSource.includes('buildPreviewOpenPath(group.previews[0].previewId, group.previews[0].sizeId)'), true)
  assert.equal(flowSource.includes('readPreviewSizeIdFromUrl'), true)
  assert.equal(flowSource.includes('normalizePreviewSizeIdFromUrl'), true)
  assert.equal(flowSource.includes('getFrameSizeOption(normalizedUrlSizeId)'), true)
})

test('saved preview URL size wins over stale local storage for the same preview id', () => {
  assert.equal(flowSource.includes('const normalizedUrlSizeId = normalizePreviewSizeIdFromUrl()'), true)
  assert.equal(flowSource.includes('const restoredMatchesUrlSize = !normalizedUrlSizeId || restored?.selectedSize?.id === normalizedUrlSizeId'), true)
  assert.equal(flowSource.includes('restoredMatchesUrlSize'), true)
})
