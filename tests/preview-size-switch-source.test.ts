import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const previewStateSource = readFileSync(new URL('../components/single-screen-preview/preview-state.ts', import.meta.url), 'utf8')
const previewFlowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')

test('size switch marks an uncached size as processing before the async preview request starts', () => {
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const hasSourceContext = Boolean\(state\.selectedFile && state\.sessionToken\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const shouldCreateProcessingPreview = Boolean\(hasSourceContext && !dp\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*\[event\.size\.id\]: createProcessingDotPreview\(event\.size\.id\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*status: deriveStatusForSelectedSize\(nextState\)/)
})

test('restored previews without a source image show an honest unavailable state for uncached sizes', () => {
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const hasRestoredPreview = Object\.values\(state\.dotPreviews\)\.some\(\(preview\) => preview\.status === "ready"\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*const shouldCreateUnavailablePreview = Boolean\(!hasSourceContext && hasRestoredPreview && !dp\)/)
  assert.match(previewStateSource, /case "SET_SIZE"[\s\S]*error: "Upload again to generate this size\."/)
})

test('size switch still starts real generation for uncached sizes after showing processing state', () => {
  assert.match(previewFlowSource, /const cachedPreview = currentState\.dotPreviews\[size\.id\]/)
  assert.match(previewFlowSource, /cachedPreview\?\.status === 'ready' \|\| cachedPreview\?\.status === 'processing'/)
  assert.match(previewFlowSource, /processDotPreviewForSize\(currentState\.selectedFile, currentState\.sessionToken, size\.id\)/)
})
