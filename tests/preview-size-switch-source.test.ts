import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const previewStateSource = readFileSync(new URL('../components/single-screen-preview/preview-state.ts', import.meta.url), 'utf8')
const previewFlowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')
const previewShellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')
const registrySource = readFileSync(new URL('../lib/account/preview-registry.ts', import.meta.url), 'utf8')

test('size switch marks an uncached size as processing before the async preview request starts', () => {
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const hasSourceContext = Boolean\(state\.selectedFile && state\.sessionToken\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const hasRestoredSourceImage = Boolean\(selectedPreview\?\.sourceImageUrl\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const shouldCreateProcessingPreview = Boolean\(\(hasSourceContext \|\| hasRestoredSourceImage\) && !dp\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*\[event\.size\.id\]: createProcessingDotPreview\(event\.size\.id, selectedPreview\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*status: deriveStatusForSelectedSize\(nextState\)/)
})

test('processing state preserves crop and orientation while regenerating a variant', () => {
  assert.match(previewStateSource, /type: "START_PROCESSING"[\s\S]*orientation\?: FrameOrientation \| null[\s\S]*crop\?: CropDetails \| null/)
  assert.match(previewStateSource, /orientation: event\.orientation \?\? previousPreview\?\.orientation \?\? null/)
  assert.match(previewStateSource, /crop: event\.crop \?\? previousPreview\?\.crop \?\? null/)
})

test('restored previews without a source image show an honest unavailable state for uncached sizes', () => {
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const hasRestoredPreview = Object\.values\(state\.dotPreviews\)\.some\(\(preview\) => preview\.status === "ready"\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const shouldCreateUnavailablePreview = Boolean\(!hasSourceContext && !hasRestoredSourceImage && hasRestoredPreview && !dp\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*error: "Upload again to generate this size\."/)
})

test('size switch still starts real generation for uncached sizes after showing processing state', () => {
  assert.match(previewFlowSource, /const cachedPreview = currentState\.dotPreviews\[size\.id\]/)
  assert.match(previewFlowSource, /cachedPreview\?\.status === 'ready' \|\| cachedPreview\?\.status === 'processing'/)
  assert.match(previewFlowSource, /processDotPreviewForSize\(currentState\.selectedFile, currentState\.sessionToken, size\.id\)/)
})

test('size switch from a restored account preview hydrates the source image before generating', () => {
  assert.match(previewFlowSource, /const activePreview = currentState\.selectedSize[\s\S]*currentState\.dotPreviews\[currentState\.selectedSize\.id\] \?\? null/)
  assert.match(previewFlowSource, /if \(!activePreview\?\.sourceImageUrl\) return/)
  assert.match(previewFlowSource, /const hydrated = await fetchSourceImageFile\(activePreview\.sourceImageUrl, activePreview\.previewId\)/)
  assert.match(previewFlowSource, /dispatch\(\{ type: "HYDRATE_SOURCE_IMAGE", file: hydrated\.file, sessionToken: hydrated\.sessionToken \}\)/)
  assert.match(previewFlowSource, /processDotPreviewForSize\(hydrated\.file, hydrated\.sessionToken, size\.id, \{[\s\S]*orientation: activePreview\.orientation \?\? null/)
})

test('verified account size switch generates variants from the MGE source project', () => {
  assert.match(previewStateSource, /"MARK_SIZE_PROCESSING"/)
  assert.match(previewFlowSource, /dispatch\(\{[\s\S]*type: "MARK_SIZE_PROCESSING"[\s\S]*sourceImageUrl: source\?\.sourceImageUrl \?\? null/)
  assert.match(previewShellSource, /createVerifiedIdentityProjectPreview\(magicLinkIdentity, sourceGroupId, size\.id\.toUpperCase\(\)\)/)
  assert.match(previewShellSource, /fetchVerifiedIdentityPreviews\(magicLinkIdentity\)[\s\S]*findIdentityProjectForPreview/)
  assert.match(previewShellSource, /actions\.markSizeProcessing\(size, \{[\s\S]*sourceImageUrl: project\?\.sourceImageUrl \?\? selectedPreview\?\.sourceImageUrl \?\? null/)
  assert.match(previewShellSource, /waitForGeneratedPreviewResult\(identity, generated, sourceGroupId, sizeId\)/)
  assert.match(previewShellSource, /Promise\.allSettled\(\[[\s\S]*fetchVerifiedIdentityPreviews\(identity\)[\s\S]*previewClient\.getPreview\(generated\.previewId\)/)
  assert.match(previewShellSource, /findProjectPreviewForSize\(project, generated\.previewId, sizeId\)/)
  assert.match(previewShellSource, /createPreviewClient\(\)/)
  assert.match(previewShellSource, /previewClient\.getPreview\(previewId\)/)
  assert.match(previewShellSource, /if \(imageUrl\) \{[\s\S]*return \{[\s\S]*previewResult: \{[\s\S]*\.\.\.latestPreviewResult/)
  assert.match(previewShellSource, /actions\.restorePreviewResult\([\s\S]*generatedResult\.previewResult/)
  assert.match(previewShellSource, /onSetSize=\{handleSetSize\}/)
})

test('processing restored account variants keep the source image visible in the 3D scene', () => {
  assert.match(previewStateSource, /sourceImageUrl: event\.sourceImageUrl \?\? selectedPreview\?\.sourceImageUrl \?\? null/)
  assert.match(previewStateSource, /const processingSourceUrl = selectedPreview\?\.status === "processing" \? selectedPreview\.sourceImageUrl \?\? null : null/)
  assert.match(previewStateSource, /const imageSrc = fallbackUrl \?\? processingSourceUrl \?\? state\.temporaryUrl \?\? state\.finalUrl/)
  assert.match(previewStateSource, /processingSourceUrl !== null \|\| state\.temporaryUrl !== null/)
})

test('identity preview polling bypasses browser and edge caches', () => {
  const identityBrowserSource = readFileSync(new URL('../lib/identity/browser.ts', import.meta.url), 'utf8')
  const identityEdgeSource = readFileSync(new URL('../lib/identity/edge.ts', import.meta.url), 'utf8')
  assert.equal(identityBrowserSource.includes('fetch(`/api/identity/previews?ts=${Date.now()}`'), true)
  assert.match(identityBrowserSource, /cache: 'no-store'/)
  assert.match(identityEdgeSource, /headers\.set\('Cache-Control', 'no-store'\)/)
})

test('saving a recropped same-size preview removes older same-size identity history rows', () => {
  assert.match(previewShellSource, /deleteOlderSameSizeIdentityPreviews/)
  assert.match(previewShellSource, /deleteVerifiedIdentityPreview\(identity, preview\.previewId\)/)
  assert.match(previewShellSource, /attachedPreview\?\.sourceGroupId \?\? selectedPreview\.sourceGroupId \?\? activeIdentityProject\?\.sourceGroupId/)
  assert.match(registrySource, /record\.sourceGroupId && item\.sourceGroupId === record\.sourceGroupId && item\.sizeId === sizeId/)
})

test('regenerated sizes preserve the restored source group id when saved later', () => {
  assert.match(previewStateSource, /sourceGroupId\?: string \| null/)
  assert.match(previewStateSource, /sourceGroupId: event\.sourceGroupId \?\? previousPreview\?\.sourceGroupId \?\? null/)
  assert.match(previewFlowSource, /sourceGroupId\?: string \| null/)
  assert.match(previewFlowSource, /sourceGroupId: result\.sourceGroupId \?\? null/)
  assert.match(registrySource, /sourceGroupId: preview\.sourceGroupId \?\? null/)
  assert.equal(registrySource.includes('sourceGroupId: preview.sourceImageUrl ?? null'), false)
})
