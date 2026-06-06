import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')
const flowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')

test('main preview shell consumes direct magic-link tokens from the return URL', () => {
  assert.equal(shellSource.includes('consumeMagicTokenFromUrl'), true)
  assert.equal(shellSource.includes('Email verified'), false)
  assert.equal(shellSource.includes('Your design is saved to this email.'), false)
  assert.equal(shellSource.includes('Verified account ${magicLinkIdentity.email}'), true)
  assert.equal(shellSource.includes('{magicLinkIdentity.email}'), true)
  assert.equal(shellSource.includes('text-[10px] font-bold'), true)
  assert.equal(shellSource.includes('⚙'), false)
})

test('auth magic page redirects verified links back to the preview context', () => {
  const authSource = readFileSync(new URL('../app/auth/magic/page.tsx', import.meta.url), 'utf8')
  const identitySource = readFileSync(new URL('../lib/identity/browser.ts', import.meta.url), 'utf8')

  assert.equal(authSource.includes('buildVerifiedDesignReturnPath'), true)
  assert.equal(authSource.includes('window.location.replace(buildVerifiedDesignReturnPath(identity))'), true)
  assert.equal(identitySource.includes("url.searchParams.set('preview_id', identity.previewId)"), true)
  assert.equal(identitySource.includes("url.searchParams.set('identity_verified', '1')"), true)
})

test('magic-link return keeps checkout preview restoration on the main page', () => {
  assert.equal(flowSource.includes('restoreStoredPreviewState()'), true)
  assert.equal(shellSource.includes('usePreviewFlow()'), true)
  assert.match(shellSource, /consumeMagicTokenFromUrl\(\)/)
})

test('direct preview_id URLs restore the server preview onto the canvas', () => {
  assert.match(flowSource, /readPreviewIdFromUrl\(\)/)
  assert.match(flowSource, /\.getPreview\(previewId\)/)
  assert.match(flowSource, /type: "RESTORE_PREVIEW"/)
})
