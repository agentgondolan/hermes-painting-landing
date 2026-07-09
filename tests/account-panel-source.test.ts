import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layoutSource = readFileSync(new URL('../components/single-screen-preview/layout-frame.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')
const accountSource = readFileSync(new URL('../components/account/account-panel.tsx', import.meta.url), 'utf8')

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
  assert.equal(accountSource.includes('Log in to your saved designs.'), true)
  assert.equal(accountSource.includes('Save and get back later'), true)
  assert.equal(accountSource.includes('Save current preview'), true)
  assert.equal(accountSource.includes('Verified as {identity.email}'), false)
  assert.equal(accountSource.includes('type EmailFlowIntent = "save" | "login"'), true)
  assert.equal(accountSource.includes('setEmailFlowIntent("save")'), true)
  assert.equal(accountSource.includes('Current preview'), false)
  assert.equal(accountSource.includes('Current source'), false)
  assert.equal(accountSource.includes('Source image'), false)
  assert.equal(accountSource.includes('Source thumbnail saved'), false)
  assert.equal(accountSource.includes('Saved size only'), false)
  assert.equal(accountSource.includes('Change email'), false)
  assert.equal(accountSource.includes('Verified previews'), true)
  assert.equal(accountSource.includes('readAccountPreviews'), true)
  assert.equal(accountSource.includes('Preview list comes next from MGE'), false)
  assert.equal(accountSource.includes('requestDesignMagicLink(targetEmail, previewId, selectedSize?.id ?? null)'), true)
  assert.equal(accountSource.includes('account_login_magic_link_blocked_without_preview'), false)
})

test('account panel exposes a returning-user login entrypoint without a current preview', () => {
  assert.equal(accountSource.includes('No current design yet. You can still log in to saved designs.'), false)
  assert.equal(accountSource.includes('Log in to saved designs'), true)
  assert.equal(accountSource.includes('setEmailFlowIntent("login")'), true)
  assert.equal(accountSource.includes('const showEmailForm = Boolean((!isVerifiedGlobally || isChangingEmail) && emailFlowIntent)'), true)
  assert.equal(accountSource.includes('Saved-design login needs MGE account-link confirmation before we can send this email.'), false)
  assert.equal(accountSource.includes('Log in by email to load saved designs, or save a ready preview from this device.'), true)
  assert.equal(accountSource.includes('Create a design first, then save it to your email.'), false)
})

test('account panel exposes a temporary Matej magic-link shortcut without bypassing email verification', () => {
  assert.equal(accountSource.includes('const TEMP_MAGIC_LINK_EMAIL = "matejgondolan@gmail.com"'), true)
  assert.equal(accountSource.includes('Send Matej test link'), true)
  assert.equal(accountSource.includes('handleTemporaryMagicLink'), true)
  assert.equal(accountSource.includes('requestDesignMagicLink(targetEmail, previewId, selectedSize?.id ?? null)'), true)
  assert.equal(accountSource.includes('developmentLoginVerifiedIdentity(TEMP_MAGIC_LINK_EMAIL'), false)
})

test('development identity login supports a tokenized production smoke URL instead of a public backdoor', () => {
  const identityBrowserSource = readFileSync(new URL('../lib/identity/browser.ts', import.meta.url), 'utf8')
  const identityEdgeSource = readFileSync(new URL('../lib/identity/edge.ts', import.meta.url), 'utf8')
  const devLoginPageSource = readFileSync(new URL('../app/auth/dev-login/page.tsx', import.meta.url), 'utf8')

  assert.equal(identityBrowserSource.includes('readDevelopmentIdentityLoginToken'), true)
  assert.equal(identityBrowserSource.includes('X-Dottingo-Dev-Login-Token'), true)
  assert.equal(identityEdgeSource.includes('DOT_DEV_IDENTITY_LOGIN_TOKEN'), true)
  assert.equal(identityEdgeSource.includes('isAuthorizedDevelopmentIdentityBypass'), true)
  assert.equal(devLoginPageSource.includes('/auth/dev-login'), false)
  assert.equal(devLoginPageSource.includes('developmentLoginVerifiedIdentity(DEV_IDENTITY_EMAIL, null, token)'), true)
  assert.equal(devLoginPageSource.includes('nextPath === "/checkout" ? "/checkout" : verifiedPath'), true)
})

test('account panel marks the opened saved project instead of offering to open it again', () => {
  assert.equal(accountSource.includes('isCurrentPreviewGroup'), true)
  assert.equal(accountSource.includes('Opened'), true)
  assert.equal(accountSource.includes('aria-current="true"'), true)
  assert.equal(accountSource.includes('shadow-[0_0_0_2px_rgba(148,50,193,0.12)]'), true)
})

test('account panel uses source thumbnails for saved project images', () => {
  assert.equal(accountSource.includes('sourceThumbnailUrl'), true)
  assert.equal(accountSource.includes('src={group.sourceThumbnailUrl}'), true)
  assert.equal(accountSource.includes('width={80}'), true)
  assert.equal(accountSource.includes('height={80}'), true)
  assert.equal(accountSource.includes('loading="lazy"'), true)
  assert.equal(accountSource.includes('decoding="async"'), true)
})
