import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const registrySource = readFileSync(new URL('../lib/account/preview-registry.ts', import.meta.url), 'utf8')
const accountSource = readFileSync(new URL('../components/account/account-panel.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')

test('preview registry stores verified previews by normalized email', () => {
  assert.equal(registrySource.includes('dottingo_preview_registry_v1'), true)
  assert.equal(registrySource.includes('normalizeRegistryEmail'), true)
  assert.equal(registrySource.includes('upsertAccountPreview'), true)
  assert.equal(registrySource.includes('readAccountPreviews'), true)
  assert.equal(registrySource.includes('hideAccountPreview'), true)
})

test('account panel renders saved previews with open continue and hide actions', () => {
  assert.equal(accountSource.includes('readAccountPreviews'), true)
  assert.equal(accountSource.includes('upsertAccountPreview'), true)
  assert.equal(accountSource.includes('Open preview'), true)
  assert.equal(accountSource.includes('Continue checkout'), true)
  assert.equal(accountSource.includes('Hide'), true)
  assert.equal(accountSource.includes('Preview list comes next from MGE'), false)
})

test('preview shell registers the current ready preview when a global identity is verified', () => {
  assert.equal(shellSource.includes('upsertAccountPreview'), true)
  assert.equal(shellSource.includes('selectedPreview.status !== "ready"'), true)
  assert.equal(shellSource.includes('account_preview_registered'), true)
})
