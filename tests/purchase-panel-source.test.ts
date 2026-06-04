import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/single-screen-preview/purchase-panel.tsx', import.meta.url), 'utf8')

test('magic-link request does not show accepted-unconfirmed copy', () => {
  assert.equal(source.includes('Magic link accepted by email service'), false)
  assert.match(source, /setMagicLinkStatus\(result\.delivery === "email_sent"/)
})

test('magic-link form only disables retry after confirmed email handoff', () => {
  assert.match(source, /setMagicLinkSent\(result\.delivery === "email_sent"\)/)
  assert.equal(source.includes('magicLinkSent ? "Sent"'), true)
})

test('magic-link analytics includes upstream email status', () => {
  assert.equal(source.includes('email_status: result.emailStatus'), true)
})
