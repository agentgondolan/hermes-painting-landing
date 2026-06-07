import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/single-screen-preview/purchase-panel.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')

test('purchase panel keeps two primary actions without inline email capture', () => {
  assert.equal(source.includes('Save'), true)
  assert.equal(source.includes('Save and get back later'), false)
  assert.equal(source.includes('Paint-by-number kit'), false)
  assert.equal(source.includes('Checkout'), true)
  assert.equal(source.includes('requestDesignMagicLink'), false)
  assert.equal(source.includes('Email sent to'), false)
  assert.equal(source.includes('Please check your emails to verify.'), false)
})

test('bottom save action opens the account panel directly in email-save state', () => {
  assert.equal(source.includes('onOpenAccountPanel?.()'), true)
  assert.equal(shellSource.includes('saveEmailFlowNonce'), true)
  assert.match(shellSource, /setSaveEmailFlowNonce\(\(nonce\) => nonce \+ 1\)/)
  assert.equal(shellSource.includes('startEmailFlowNonce={saveEmailFlowNonce}'), true)
})

test('checkout accepts a global verified identity and no longer binds verification to one preview', () => {
  assert.equal(source.includes('verifiedIdentity.previewId !== previewId'), false)
  assert.equal(source.includes('Verify your email from Account first, then checkout.'), true)
  assert.equal(source.includes('identity_token: verifiedIdentity.identityToken'), true)
})

test('purchase panel hides express options but keeps option filtering available', () => {
  assert.equal(source.includes('isExpressOption(option)'), true)
  assert.equal(source.includes('visiblePurchaseOptions.length > 1'), true)
  assert.equal(source.includes('Standard'), false)
})

test('saved current preview shows saved confirmation without change-email controls', () => {
  assert.equal(source.includes('currentPreviewSaved'), true)
  assert.equal(source.includes('Saved to your verified email.'), true)
  assert.equal(source.includes('Change email'), false)
  assert.equal(source.includes('changeEmailRequestNonce'), false)
})
