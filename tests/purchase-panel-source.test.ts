import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/single-screen-preview/purchase-panel.tsx', import.meta.url), 'utf8')

test('magic-link request does not show accepted-unconfirmed copy', () => {
  assert.equal(source.includes('Magic link accepted by email service'), false)
  assert.equal(source.includes('Please check your emails to verify.'), true)
})

test('magic-link form only switches to sent state after confirmed email handoff', () => {
  assert.equal(source.includes('setMagicLinkSent(confirmed)'), true)
  assert.equal(source.includes('Email sent to {email}'), true)
})

test('magic-link analytics includes upstream email status', () => {
  assert.equal(source.includes('email_status: result.emailStatus'), true)
})

test('magic-link request polls request_id until a terminal delivery status', () => {
  assert.equal(source.includes('pollMagicLinkRequestStatus(result.requestId)'), true)
  assert.equal(source.includes('status.terminal'), true)
  assert.equal(source.includes('magic_link_delivery_confirmed'), true)
})

test('magic-link request shows short terminal and pending status copy', () => {
  assert.equal(source.includes('Please check your emails to verify.'), true)
  assert.equal(source.includes('Sending link…'), true)
  assert.equal(source.includes('Magic link sent. Check your inbox.'), false)
  assert.equal(source.includes('Link sent. Check your inbox.'), false)
})

test('verified identity is visible as a reusable saved-to badge', () => {
  assert.equal(source.includes('Saved to {identity.email}'), true)
  assert.equal(source.includes('Verified: {identity?.email}'), false)
})

test('verified identity skips repeat prompt until user changes email', () => {
  assert.equal(source.includes('setChangingVerifiedEmail(false)'), true)
  assert.equal(source.includes('!isVerifiedForPreview || changingVerifiedEmail'), true)
  assert.equal(source.includes('Change email'), true)
})

test('sent magic-link state hides email input and asks user to verify', () => {
  assert.equal(source.includes('Email sent to {email}'), true)
  assert.equal(source.includes('Please check your emails to verify.'), true)
  assert.equal(source.includes('Send again'), true)
  assert.equal(source.includes('magicLinkSent ? "Sent"'), false)
})
