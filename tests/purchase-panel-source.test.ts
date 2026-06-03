import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/single-screen-preview/purchase-panel.tsx', import.meta.url), 'utf8')

test('magic-link request does not render a post-submit status message', () => {
  assert.equal(source.includes('Magic link sent.'), false)
  assert.equal(source.includes('Magic link requested.'), false)
  assert.equal(source.includes('If it does not arrive'), false)
})

test('magic-link form only disables retry after confirmed email handoff', () => {
  assert.match(source, /setMagicLinkSent\(result\.delivery === "email_sent"\)/)
  assert.equal(source.includes('magicLinkSent ? "Sent"'), true)
})
