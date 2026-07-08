import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const cropModalSource = readFileSync(new URL('../components/single-screen-preview/crop-modal.tsx', import.meta.url), 'utf8')
const guidedControlsSource = readFileSync(new URL('../components/single-screen-preview/guided-controls.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/single-screen-preview/single-screen-preview-shell.tsx', import.meta.url), 'utf8')
const previewFlowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')
const identityBrowserSource = readFileSync(new URL('../lib/identity/browser.ts', import.meta.url), 'utf8')

test('crop modal exposes fixed-ratio crop controls without preview regeneration', () => {
  assert.match(cropModalSource, /getFrameRatio/)
  assert.match(cropModalSource, /getManualCrop/)
  assert.match(cropModalSource, /type="range"[\s\S]*Zoom/)
  assert.match(cropModalSource, /\(\["vertical", "horizontal"\] as const\)\.map/)
  assert.match(cropModalSource, /onApply\(orientation, crop\)/)
  assert.equal(cropModalSource.includes('createPreview('), false)
})

test('guided controls provide an edit crop entrypoint only when source exists', () => {
  assert.match(guidedControlsSource, /onEditCrop\?: \(\) => void/)
  assert.match(guidedControlsSource, /canEditCrop\?: boolean/)
  assert.match(guidedControlsSource, /Edit crop/)
  assert.match(shellSource, /canEditCrop=\{Boolean\(state\.selectedFile && state\.selectedSize\)\}/)
})

test('guided controls distinguish saved variants from not-ready size choices', () => {
  assert.match(guidedControlsSource, /readySizeIds\?: string\[\]/)
  assert.match(guidedControlsSource, /const isReady = readySizeIdSet\.has\(opt\.id\)/)
  assert.match(guidedControlsSource, /bg-\[#9432c1\]\/8 text-\[#9432c1\]/)
  assert.match(shellSource, /const readySizeIds = Object\.values\(state\.dotPreviews\)/)
  assert.match(shellSource, /readySizeIds=\{readySizeIds\}/)
})

test('verified customers see add image instead of replace photo', () => {
  assert.match(guidedControlsSource, /isVerified\?: boolean/)
  assert.match(guidedControlsSource, /isVerified \? "Add image" : UX_COPY\.replaceImage/)
  assert.match(shellSource, /isVerified=\{Boolean\(magicLinkIdentity\)\}/)
})

test('crop apply can regenerate local previews through preview flow', () => {
  assert.match(shellSource, /<CropModal/)
  assert.match(shellSource, /handleApplyCrop\(orientation, crop\)/)
  assert.match(previewFlowSource, /const handleApplyCrop = useCallback/)
  assert.match(previewFlowSource, /processDotPreviewForSize\(currentState\.selectedFile, currentState\.sessionToken, sizeId, \{ orientation, crop \}\)/)
  assert.match(previewFlowSource, /prepareArtworkForFrame\(file, \{[\s\S]*orientation: generationOptions\?\.orientation \?\? null[\s\S]*crop: manualCrop/)
  assert.match(previewFlowSource, /\.createPreview\(preparedArtwork\.file, preferredSizeId\.toUpperCase\(\), true\)/)
})

test('verified account crop uses source project generation instead of creating a new source upload', () => {
  assert.match(shellSource, /const handleApplyCrop = useCallback/)
  assert.match(shellSource, /createVerifiedIdentityProjectPreview\([\s\S]*sourceGroupId[\s\S]*size\.id\.toUpperCase\(\)[\s\S]*orientation[\s\S]*crop: identityProjectCropParams\(crop\)/)
  assert.match(identityBrowserSource, /auto_crop: false/)
  assert.match(identityBrowserSource, /preferred_orientation/)
  assert.match(identityBrowserSource, /product_params/)
  assert.match(identityBrowserSource, /preview_options/)
  assert.equal(shellSource.includes('catch (error) {\n      actions.applyCrop(size.id, orientation, crop)'), false)
})

test('explicit preview orientation is passed into the 3D scene', () => {
  const previewStateSource = readFileSync(new URL('../components/single-screen-preview/preview-state.ts', import.meta.url), 'utf8')
  const scenePanelSource = readFileSync(new URL('../components/single-screen-preview/preview-scene-panel.tsx', import.meta.url), 'utf8')
  const productSceneSource = readFileSync(new URL('../components/product-scene-canvas.tsx', import.meta.url), 'utf8')

  assert.match(previewStateSource, /orientation: selectedPreview\?\.orientation \?\? null/)
  assert.match(scenePanelSource, /orientation=\{sceneModel\.orientation \?\? undefined\}/)
  assert.match(productSceneSource, /const orientation = props\.orientation \?\? inferredArtworkOrientation \?\? \(hasSelectedSize/)
})

test('restored previews infer frame orientation from the DOT image when metadata is absent', () => {
  const productSceneSource = readFileSync(new URL('../components/product-scene-canvas.tsx', import.meta.url), 'utf8')

  assert.match(productSceneSource, /function useArtworkOrientation/)
  assert.match(productSceneSource, /image\.naturalWidth >= image\.naturalHeight \? 'horizontal' : 'vertical'/)
  assert.match(productSceneSource, /const inferredArtworkOrientation = useArtworkOrientation\(artworkTextureUrl\)/)
  assert.match(productSceneSource, /props\.orientation \?\? inferredArtworkOrientation/)
})
