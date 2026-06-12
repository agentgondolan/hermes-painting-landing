import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layoutSource = readFileSync(new URL('../components/single-screen-preview/layout-frame.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')

test('preview shell mounts an account panel connected to verified identity', () => {
  assert.equal(shellSource.includes('AccountPanel'), true)
  assert.equal(shellSource.includes('magicLinkIdentity'), true)
  assert.equal(shellSource.includes('selectedPreview={selectedPreview ?? null}'), true)
})

test('layout frame keeps the account action above the 3D canvas and interactive', () => {
  assert.equal(layoutSource.includes('headerAction'), true)
  assert.equal(layoutSource.includes('pointer-events-auto'), true)
  assert.equal(layoutSource.includes('z-[80]'), true)
})

test('account panel preserves the current magic-link account MVP scope', () => {
  const accountSource = readFileSync(new URL('../components/account/account-panel.tsx', import.meta.url), 'utf8')

  assert.equal(accountSource.includes('Account'), true)
  assert.equal(accountSource.includes('Save your design and continue later.'), true)
  assert.equal(accountSource.includes('Save and get back later'), true)
  assert.equal(accountSource.includes('Save current preview'), true)
  assert.equal(accountSource.includes('Verified as {identity.email}'), false)
  assert.equal(accountSource.includes('setSaveFormOpen(true)'), true)
  assert.equal(accountSource.includes('Current preview'), true)
  assert.equal(accountSource.includes('Current source'), false)
  assert.equal(accountSource.includes('Source image'), false)
  assert.equal(accountSource.includes('Source thumbnail saved'), false)
  assert.equal(accountSource.includes('Saved size only'), false)
  assert.equal(accountSource.includes('Change email'), false)
  assert.equal(accountSource.includes('Verified previews'), true)
  assert.equal(accountSource.includes('readAccountPreviews'), true)
  assert.equal(accountSource.includes('Preview list comes next from MGE'), false)
  assert.equal(accountSource.includes('requestDesignMagicLink(email, previewId, selectedSize?.id ?? null)'), true)
})
