import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const adminPageSource = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')
const adminComponentSource = readFileSync(new URL('../components/admin/admin-settings-page.tsx', import.meta.url), 'utf8')
const cartSource = readFileSync(new URL('../components/cart/multi-project-cart-page.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../lib/dottingo/project-settings.ts', import.meta.url), 'utf8')

test('admin route renders the project settings page', () => {
  assert.equal(adminPageSource.includes('AdminSettingsPage'), true)
  assert.equal(adminPageSource.includes('@/components/admin/admin-settings-page'), true)
})

test('project settings centralize Dottingo checkout knobs', () => {
  assert.equal(settingsSource.includes('DOTTINGO_ADMIN_EMAILS = ["matejgondolan@gmail.com"]'), true)
  assert.equal(settingsSource.includes('DOT_FRAME_OPTIONS_ENABLED = ["W", "WO"]'), true)
  assert.equal(settingsSource.includes('DOT_EXPRESS_OPTIONS_ENABLED = false'), true)
  assert.equal(settingsSource.includes('TARGET_GROSS_MARGIN = 0.5'), true)
  assert.equal(settingsSource.includes('DEFAULT_EUR_TO_SGD_RATE = 1.46'), true)
  assert.equal(settingsSource.includes('GST_RATE = 0.09'), true)
})

test('checkout exposes admin link only for configured admin email', () => {
  assert.equal(cartSource.includes('isDottingoAdminEmail(identity.email)'), true)
  assert.equal(cartSource.includes('href="/admin"'), true)
  assert.equal(cartSource.includes('Admin'), true)
})

test('admin page lists visible checkout settings without secrets', () => {
  assert.equal(adminComponentSource.includes('readVerifiedIdentity'), true)
  assert.equal(adminComponentSource.includes('isDottingoAdminEmail(identity?.email)'), true)
  assert.equal(adminComponentSource.includes('Checkout frame options'), true)
  assert.equal(adminComponentSource.includes('Express options'), true)
  assert.equal(adminComponentSource.includes('Target gross margin'), true)
  assert.equal(adminComponentSource.includes('EUR to SGD'), true)
  assert.equal(adminComponentSource.includes('MGEVERYDAY_API_TOKEN'), false)
})
