import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const imageProcessingSource = readFileSync(new URL('../lib/image-processing.ts', import.meta.url), 'utf8')
const previewStateSource = readFileSync(new URL('../components/single-screen-preview/preview-state.ts', import.meta.url), 'utf8')
const previewFlowSource = readFileSync(new URL('../components/single-screen-preview/use-preview-flow.ts', import.meta.url), 'utf8')

test('image processing exposes manual crop input while preserving centered defaults', () => {
  assert.match(imageProcessingSource, /export type ManualCropInput = CropBox/)
  assert.match(imageProcessingSource, /export type VariantCropIntent = {[\s\S]*sizeId: FrameSizeId[\s\S]*orientation: FrameOrientation[\s\S]*crop: ManualCropInput/)
  assert.match(imageProcessingSource, /export function getManualCrop\(/)
  assert.match(imageProcessingSource, /options\?\.crop[\s\S]*getManualCrop\(/)
  assert.match(imageProcessingSource, /: getCenteredCrop\(/)
})

test('crop details include source pixels and normalized coordinates', () => {
  assert.match(imageProcessingSource, /source: CropSource/)
  assert.match(imageProcessingSource, /zoom: number \| null/)
  assert.match(imageProcessingSource, /normalized: CropBox/)
  assert.match(imageProcessingSource, /x: safeOffsetX \/ safeSourceWidth/)
  assert.match(imageProcessingSource, /width: safeCropWidth \/ safeSourceWidth/)
})

test('preview state stores crop and orientation per size variant', () => {
  assert.match(previewStateSource, /orientation\?: FrameOrientation \| null/)
  assert.match(previewStateSource, /crop\?: CropDetails \| null/)
  assert.match(previewStateSource, /"SET_PREVIEW_CROP"/)
  assert.match(previewStateSource, /orientation: event\.orientation/)
  assert.match(previewStateSource, /crop: event\.crop/)
})

test('preview generation writes prepared crop metadata into processing success state', () => {
  assert.match(previewFlowSource, /type CropDetails/)
  assert.match(previewFlowSource, /type FrameOrientation/)
  assert.match(previewFlowSource, /orientation: preparedArtwork\.orientation/)
  assert.match(previewFlowSource, /crop: preparedArtwork\.crop/)
})
