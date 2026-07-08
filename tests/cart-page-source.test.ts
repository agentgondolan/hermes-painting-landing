import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const cartSource = readFileSync(new URL('../components/cart/multi-project-cart-page.tsx', import.meta.url), 'utf8')
const checkoutPageSource = readFileSync(new URL('../app/checkout/page.tsx', import.meta.url), 'utf8')

test('checkout route renders the multi-project cart page', () => {
  assert.equal(checkoutPageSource.includes('MultiProjectCartPage'), true)
  assert.equal(checkoutPageSource.includes('@/components/cart/multi-project-cart-page'), true)
})

test('cart page loads verified identity projects and not local flat fallback only', () => {
  assert.equal(cartSource.includes('readVerifiedIdentity'), true)
  assert.equal(cartSource.includes('fetchVerifiedIdentityPreviews(stored)'), true)
  assert.equal(cartSource.includes('library.projects'), true)
  assert.equal(cartSource.includes('readyProjects'), true)
  assert.equal(cartSource.includes('library.previews.map'), false)
})

test('cart page renders source images with ready 2D designs and no 3D scene', () => {
  assert.equal(cartSource.includes('project.sourceImageUrl'), true)
  assert.equal(cartSource.includes('alt="Source image"'), true)
  assert.equal(cartSource.includes('designImageUrl(preview)'), true)
  assert.equal(cartSource.includes('alt="Ready DOT design"'), true)
  assert.equal(cartSource.includes('ProductSceneCanvas'), false)
  assert.equal(cartSource.includes('SingleScreenPreviewShell'), false)
})

test('cart page fetches orderable purchase options per ready preview', () => {
  assert.equal(cartSource.includes('client.pollPurchaseOptions(preview.previewId)'), true)
  assert.equal(cartSource.includes('result.purchaseOptions.filter(isOrderablePurchaseOption)'), true)
  assert.equal(cartSource.includes('function isOrderablePurchaseOption'), true)
  assert.equal(cartSource.includes('function isAllowedFramePurchaseOption'), true)
  assert.equal(cartSource.includes('DOT_FRAME_OPTIONS_ENABLED.includes'), true)
  assert.equal(cartSource.includes('!isExpressPurchaseOption(option)'), true)
  assert.equal(cartSource.includes('DOT_EXPRESS_OPTIONS_ENABLED || !isExpressPurchaseOption(option)'), true)
  assert.equal(cartSource.includes('function isExpressPurchaseOption'), true)
  assert.match(cartSource, /express\|rush\|fast/)
})

test('cart page supports explicit selection, purchase option choice, and quantity per preview', () => {
  assert.equal(cartSource.includes('type DesignSelection'), true)
  assert.equal(cartSource.includes('purchaseOptionId: string'), true)
  assert.equal(cartSource.includes('quantity: number'), true)
  assert.equal(cartSource.includes('togglePreview'), true)
  assert.equal(cartSource.includes('onOptionChange'), true)
  assert.equal(cartSource.includes('onQuantityChange'), true)
  assert.equal(cartSource.includes('type="number"'), true)
  assert.equal(cartSource.includes('min={1}'), true)
  assert.equal(cartSource.includes('max={99}'), true)
})

test('cart page labels framed purchase options from MGE frame metadata first', () => {
  assert.equal(cartSource.includes('function purchaseOptionLabel'), true)
  assert.equal(cartSource.includes('option.frameLabel'), true)
  assert.equal(cartSource.includes('option.productionSpeedLabel'), true)
  assert.equal(cartSource.includes('function frameLabelFromSkuParts'), true)
  assert.equal(cartSource.includes('function frameLabelFromText'), true)
  assert.equal(cartSource.includes('DOT_EXPRESS_OPTIONS_ENABLED ? speedLabel : ""'), true)
  assert.match(cartSource, /Without frame/)
  assert.match(cartSource, /With frame/)
  assert.equal(cartSource.includes('skuParts.some'), true)
  assert.match(cartSource, /NOFRAME|NO-FRAME|UNFRAMED|WO/)
  assert.match(cartSource, /WPM/)
  assert.match(cartSource, /WDIYF/)
})

test('cart page syncs selected lines to one MGE draft before Stripe handoff', () => {
  assert.equal(cartSource.includes('type BffOrderDraftResult'), true)
  assert.equal(cartSource.includes('orderDraftId'), true)
  assert.equal(cartSource.includes('syncedDraft'), true)
  assert.equal(cartSource.includes('draftDirty'), true)
  assert.equal(cartSource.includes('syncDraft'), true)
  assert.equal(cartSource.includes('client.createOrderDraft'), true)
  assert.equal(cartSource.includes('order_draft_id: orderDraftId'), true)
  assert.equal(cartSource.includes('cart_lines: lines.map'), true)
  assert.equal(cartSource.includes('preview_id: preview.previewId'), true)
  assert.equal(cartSource.includes('preview_option_id: option.previewOptionId'), true)
  assert.equal(cartSource.includes('sku: optionSku(option)'), true)
  assert.equal(cartSource.includes('quantity,'), true)
  assert.equal(cartSource.includes('syncedDraft && selectedLines.length'), true)
  assert.equal(cartSource.includes('Draft saved · {draftLineCount}'), true)
  assert.equal(cartSource.includes('MGE draft {syncedDraft.orderDraftId}'), false)
  assert.equal(cartSource.includes('window.setTimeout'), true)
  assert.equal(cartSource.includes('Saving draft'), true)
  assert.equal(cartSource.includes('Create MGE draft'), false)
  assert.equal(cartSource.includes('Update MGE draft'), false)
})

test('cart page starts Stripe only from the synced MGE draft id', () => {
  assert.equal(cartSource.includes('handleCheckout'), true)
  assert.equal(cartSource.includes('fetch("/api/stripe/checkout"'), true)
  assert.equal(cartSource.includes('order_draft_id: syncedDraft.orderDraftId'), true)
  assert.equal(cartSource.includes('identity_token: identity.identityToken'), true)
  assert.equal(cartSource.includes('window.location.assign(payload.url)'), true)
  assert.equal(cartSource.includes('Wait for the MGE draft to finish syncing before payment.'), true)
  assert.match(cartSource, /disabled=\{checkoutLoading \|\| draftSyncing \|\| !selectedLines\.length \|\| !syncedDraft \|\| draftDirty\}/)
  assert.match(cartSource, /fetch\("\/api\/stripe\/checkout"[\s\S]*order_draft_id: syncedDraft\.orderDraftId[\s\S]*identity_token: identity\.identityToken/)
})

test('cart thumbnails use the selected purchase option image without cropping and open a larger modal', () => {
  assert.equal(cartSource.includes('purchaseOptionImageUrl(selectedOption) ?? designImageUrl(preview)'), true)
  assert.equal(cartSource.includes('function purchaseOptionImageUrl'), true)
  assert.equal(cartSource.includes('option.previewUrl ?? option.mockupUrl'), true)
  assert.equal(cartSource.includes('object-contain'), true)
  assert.equal(cartSource.includes('h-36 w-full'), true)
  assert.equal(cartSource.includes('h-36 w-auto max-w-full'), true)
  assert.equal(cartSource.includes('setPreviewModal'), true)
  assert.equal(cartSource.includes('role="dialog"'), true)
  assert.equal(cartSource.includes('max-h-[86dvh]'), true)
})

test('cart renders designs as single-line rows with preview in col4 and details in col8', () => {
  assert.equal(cartSource.includes('md:grid-cols-2'), false)
  assert.equal(cartSource.includes('grid grid-cols-12'), true)
  assert.equal(cartSource.includes('col-span-4 flex items-center justify-center'), true)
  assert.equal(cartSource.includes('col-span-8 min-w-0'), true)
  assert.equal(cartSource.includes('bg-[#2e2d2c]/4 p-1'), false)
  assert.equal(cartSource.includes('text-right text-sm font-black'), true)
})

test('cart uses styled option pills and hides them when only one purchase option is available', () => {
  assert.equal(cartSource.includes('const hasMultipleOptions = optionState.options.length > 1'), true)
  assert.match(cartSource, /hasMultipleOptions \? \([\s\S]*role="radiogroup"/)
  assert.equal(cartSource.includes('aria-pressed={isSelected}'), true)
  assert.equal(cartSource.includes('<select'), false)
  assert.match(cartSource, /purchaseOptionLabel\(selectedOption\)/)
})

test('cart page can clear stale lines by syncing an empty selection to an existing draft', () => {
  assert.equal(cartSource.includes('CART_DRAFT_STORAGE_KEY'), true)
  assert.equal(cartSource.includes('readStoredCartDraftId'), true)
  assert.equal(cartSource.includes('writeStoredCartDraftId'), true)
  assert.equal(cartSource.includes('clearStoredCartDraftId'), true)
  assert.equal(cartSource.includes('!lines.length && !orderDraftId'), true)
  assert.equal(cartSource.includes('setSyncedDraft(null)'), true)
  assert.equal(cartSource.includes('setOrderDraftId(null)'), true)
  assert.equal(cartSource.includes('!selectedLines.length && !orderDraftId'), false)
  assert.equal(cartSource.includes('cart_lines: lines.map'), true)
  assert.match(cartSource, /!selectedLines\.length \? "Select designs to start a draft\."/)
  assert.match(cartSource, /setSelections\(\(current\) => \{[\s\S]*validPreviewIds/)
})
