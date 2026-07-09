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

test('verified bottom save action saves the current preview directly before opening account email flow', () => {
  assert.equal(source.includes('onSaveCurrentPreview?: () => boolean | void | Promise<boolean | void>'), true)
  assert.equal(source.includes('onSaveCurrentPreview?.()'), true)
  assert.equal(shellSource.includes('const handleSaveCurrentPreview = async () => {'), true)
  assert.equal(shellSource.includes('sourceImageUrl: attachedPreview?.sourceImageUrl ?? selectedPreview.sourceImageUrl ?? localSourceThumbnailUrl ?? null'), true)
  assert.equal(shellSource.includes('upsertAccountPreview(magicLinkIdentity.email, previewForRegistry, state.selectedSize)'), true)
  assert.equal(shellSource.includes('onSaveCurrentPreview={handleSaveCurrentPreview}'), true)
  assert.equal(shellSource.includes('saveEmailFlowNonce'), true)
  assert.match(shellSource, /setSaveEmailFlowNonce\(\(nonce\) => nonce \+ 1\)/)
  assert.equal(shellSource.includes('startEmailFlowNonce={saveEmailFlowNonce}'), true)
})

test('checkout accepts a global verified identity and no longer binds verification to one preview', () => {
  assert.equal(source.includes('verifiedIdentity.previewId !== previewId'), false)
  assert.equal(source.includes('Verify your email from Account first, then checkout.'), true)
  assert.equal(source.includes('window.location.assign("/checkout")'), true)
  assert.equal(source.includes('fetch("/api/stripe/checkout"'), false)
  assert.equal(source.includes('Checkout is not configured yet.'), false)
})

test('purchase panel filters and labels order options with the same project settings as checkout', () => {
  assert.equal(source.includes('DOT_FRAME_OPTIONS_ENABLED'), true)
  assert.equal(source.includes('DOT_EXPRESS_OPTIONS_ENABLED'), true)
  assert.equal(source.includes('isEnabledPurchaseOption(option)'), true)
  assert.equal(source.includes('isAllowedFramePurchaseOption(option)'), true)
  assert.equal(source.includes('optionFrameCode(option)'), true)
  assert.equal(source.includes('isExpressOption(option)'), true)
  assert.equal(source.includes('frameLabelFromSkuParts'), true)
  assert.equal(source.includes('frameLabelFromText'), true)
  assert.equal(source.includes('DOT_EXPRESS_OPTIONS_ENABLED ? speedLabel : ""'), true)
  assert.match(source, /Without frame/)
  assert.match(source, /With frame/)
  assert.equal(source.includes('visiblePurchaseOptions.length > 1'), true)
  assert.equal(source.includes('Standard'), false)
})

test('saved current preview hides save without adding a redundant confirmation message', () => {
  assert.equal(source.includes('currentPreviewSaved'), true)
  assert.match(source, /!currentPreviewSaved \? \([\s\S]*Save[\s\S]*\) : null/)
  assert.equal(source.includes('saveStatus === "saved" ? "Saved"'), false)
  assert.match(source, /currentPreviewSaved \? "grid-cols-1" : "grid-cols-2"/)
  assert.equal(source.includes('Saved to your verified email.'), false)
  assert.equal(source.includes('Change email'), false)
  assert.equal(source.includes('changeEmailRequestNonce'), false)
})

test('loaded MGE identity previews count as already saved for the bottom save action', () => {
  assert.equal(shellSource.includes('identityPreviewLibrary.projects.flatMap((project) => project.previews ?? [])'), true)
  assert.equal(shellSource.includes('savedInIdentityLibrary'), true)
  assert.equal(shellSource.includes('normalizeSizeId(preview.selectedSize ?? preview.preferredSize) === state.selectedSize?.id'), true)
})
