'use client'

import canvasSpecData from './canvas-spec.json'

export type FrameSizeId = string
export type FrameOrientation = 'vertical' | 'horizontal'
export type CropSource = 'centered' | 'manual'

export type CropBox = {
  x: number
  y: number
  width: number
  height: number
}

export type ManualCropInput = CropBox

export type VariantCropIntent = {
  sizeId: FrameSizeId
  orientation: FrameOrientation
  crop: ManualCropInput
  zoom?: number | null
}

export type CanvasSpecFrameSize = {
  id: string
  label: string
  widthCm: number
  heightCm: number
}

export type CanvasBackFrameSpec = {
  barWidthCm: number
  imageCoverCm: number
  woodRevealCm: number
  enableMirroredBackCover: boolean
}

export type CanvasSpec = {
  defaultFrameSizeId: string
  worldUnitsPerCm: number
  edgeDepthCm: number
  backFrame: CanvasBackFrameSpec
  frameSizes: CanvasSpecFrameSize[]
}

export type FrameSizeOption = CanvasSpecFrameSize

const CANVAS_SPEC = canvasSpecData as CanvasSpec

export type CropDetails = {
  applied: boolean
  source: CropSource
  sourceWidth: number
  sourceHeight: number
  cropWidth: number
  cropHeight: number
  offsetX: number
  offsetY: number
  targetRatio: number
  zoom: number | null
  normalized: CropBox
}

export type ProcessedArtwork = {
  resultUrl: string
  mimeType: string
  sourceName: string
  sizeId: FrameSizeId
  sizeLabel: string
  orientation: FrameOrientation
  crop: CropDetails
  statusMessage: string
  cleanup?: () => void
}

export type PreparedArtworkForFrame = ProcessedArtwork & {
  file: File
}

export type ProcessArtworkOptions = {
  preferredSizeId?: FrameSizeId
  orientation?: FrameOrientation | null
  crop?: ManualCropInput | null
  zoom?: number | null
}

export type ImageProcessor = (file: File, options?: ProcessArtworkOptions) => Promise<ProcessedArtwork>

export const FRAME_SIZE_OPTIONS: FrameSizeOption[] = CANVAS_SPEC.frameSizes

export const DEFAULT_FRAME_SIZE_ID: FrameSizeId = CANVAS_SPEC.defaultFrameSizeId

const MOCK_DELAY_MS = 1400
const MAX_OUTPUT_EDGE = 2000
const EPSILON = 0.01

export function getFrameSizeOption(sizeId: FrameSizeId) {
  return FRAME_SIZE_OPTIONS.find((option) => option.id === sizeId) ?? FRAME_SIZE_OPTIONS[0]
}

export function getCanvasSpec() {
  return CANVAS_SPEC
}

export function getCanvasWorldUnitsPerCm() {
  return CANVAS_SPEC.worldUnitsPerCm
}

export function getCanvasEdgeDepthCm() {
  return CANVAS_SPEC.edgeDepthCm
}

export function getCanvasBackFrameSpec() {
  return CANVAS_SPEC.backFrame
}

export function getOrientationFromDimensions(width: number, height: number): FrameOrientation {
  return width > height ? 'horizontal' : 'vertical'
}

export function getFrameRatio(sizeId: FrameSizeId, orientation: FrameOrientation) {
  const option = getFrameSizeOption(sizeId)
  const width = orientation === 'horizontal' ? option.heightCm : option.widthCm
  const height = orientation === 'horizontal' ? option.widthCm : option.heightCm
  return width / height
}

export function getOrientedFrameDimensions(sizeId: FrameSizeId, orientation: FrameOrientation) {
  const option = getFrameSizeOption(sizeId)

  if (orientation === 'horizontal') {
    return {
      widthCm: option.heightCm,
      heightCm: option.widthCm,
      depthCm: CANVAS_SPEC.edgeDepthCm,
    }
  }

  return {
    widthCm: option.widthCm,
    heightCm: option.heightCm,
    depthCm: CANVAS_SPEC.edgeDepthCm,
  }
}

export function getClosestFrameSizeId(sourceRatio: number, orientation: FrameOrientation) {
  return FRAME_SIZE_OPTIONS.reduce<FrameSizeId>((closest, option) => {
    const currentDelta = Math.abs(getFrameRatio(option.id, orientation) - sourceRatio)
    const bestDelta = Math.abs(getFrameRatio(closest, orientation) - sourceRatio)
    return currentDelta < bestDelta ? option.id : closest
  }, DEFAULT_FRAME_SIZE_ID)
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function buildCropDetails(
  source: CropSource,
  sourceWidth: number,
  sourceHeight: number,
  cropWidth: number,
  cropHeight: number,
  offsetX: number,
  offsetY: number,
  targetRatio: number,
  zoom: number | null,
): CropDetails {
  const safeSourceWidth = Math.max(1, Math.round(sourceWidth))
  const safeSourceHeight = Math.max(1, Math.round(sourceHeight))
  const safeCropWidth = Math.max(1, Math.min(safeSourceWidth, Math.round(cropWidth)))
  const safeCropHeight = Math.max(1, Math.min(safeSourceHeight, Math.round(cropHeight)))
  const safeOffsetX = Math.round(clampNumber(offsetX, 0, safeSourceWidth - safeCropWidth))
  const safeOffsetY = Math.round(clampNumber(offsetY, 0, safeSourceHeight - safeCropHeight))

  return {
    applied: source === 'manual' || safeCropWidth !== safeSourceWidth || safeCropHeight !== safeSourceHeight || safeOffsetX !== 0 || safeOffsetY !== 0,
    source,
    sourceWidth: safeSourceWidth,
    sourceHeight: safeSourceHeight,
    cropWidth: safeCropWidth,
    cropHeight: safeCropHeight,
    offsetX: safeOffsetX,
    offsetY: safeOffsetY,
    targetRatio,
    zoom,
    normalized: {
      x: safeOffsetX / safeSourceWidth,
      y: safeOffsetY / safeSourceHeight,
      width: safeCropWidth / safeSourceWidth,
      height: safeCropHeight / safeSourceHeight,
    },
  }
}

export function getCenteredCrop(sourceWidth: number, sourceHeight: number, targetRatio: number): CropDetails {
  const sourceRatio = sourceWidth / sourceHeight

  if (Math.abs(sourceRatio - targetRatio) <= EPSILON) {
    return buildCropDetails('centered', sourceWidth, sourceHeight, sourceWidth, sourceHeight, 0, 0, targetRatio, null)
  }

  if (sourceRatio > targetRatio) {
    const cropWidth = Math.round(sourceHeight * targetRatio)
    const offsetX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2))

    return buildCropDetails('centered', sourceWidth, sourceHeight, cropWidth, sourceHeight, offsetX, 0, targetRatio, null)
  }

  const cropHeight = Math.round(sourceWidth / targetRatio)
  const offsetY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2))

  return buildCropDetails('centered', sourceWidth, sourceHeight, sourceWidth, cropHeight, 0, offsetY, targetRatio, null)
}

export function getManualCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number,
  crop: ManualCropInput,
  zoom: number | null = null,
): CropDetails {
  const boundedWidth = clampNumber(crop.width, 1, sourceWidth)
  const boundedHeight = clampNumber(crop.height, 1, sourceHeight)
  const centerX = clampNumber(crop.x, 0, sourceWidth) + boundedWidth / 2
  const centerY = clampNumber(crop.y, 0, sourceHeight) + boundedHeight / 2
  let cropWidth = boundedWidth
  let cropHeight = Math.round(cropWidth / targetRatio)

  if (cropHeight > boundedHeight) {
    cropHeight = boundedHeight
    cropWidth = Math.round(cropHeight * targetRatio)
  }

  if (cropWidth > sourceWidth) {
    cropWidth = sourceWidth
    cropHeight = Math.round(cropWidth / targetRatio)
  }

  if (cropHeight > sourceHeight) {
    cropHeight = sourceHeight
    cropWidth = Math.round(cropHeight * targetRatio)
  }

  const offsetX = clampNumber(centerX - cropWidth / 2, 0, sourceWidth - cropWidth)
  const offsetY = clampNumber(centerY - cropHeight / 2, 0, sourceHeight - cropHeight)

  return buildCropDetails('manual', sourceWidth, sourceHeight, cropWidth, cropHeight, offsetX, offsetY, targetRatio, zoom)
}

function formatCropStatus(sizeId: FrameSizeId, orientation: FrameOrientation, crop: CropDetails) {
  const direction = orientation === 'horizontal' ? 'horizontal' : 'vertical'
  const option = getFrameSizeOption(sizeId)

  if (!crop.applied) {
    return `Matched ${option.label} in ${direction} orientation.`
  }

  const removedWidth = crop.sourceWidth - crop.cropWidth
  const removedHeight = crop.sourceHeight - crop.cropHeight
  const cropSummary = removedWidth > 0 ? `trimmed ${removedWidth}px from the sides` : `trimmed ${removedHeight}px from top and bottom`

  return `Cropped to ${option.label} in ${direction} orientation — centered and ${cropSummary}.`
}

// --- EXIF orientation handling ---

function getExifOrientation(arrayBuffer: ArrayBuffer): number | null {
  const view = new DataView(arrayBuffer)
  if (view.getUint16(0) !== 0xffd8) {
    return null
  }

  let offset = 2
  while (offset < view.byteLength - 1) {
    // Check for APP1 marker (0xFFE1)
    if (view.getUint8(offset) !== 0xff || view.getUint8(offset + 1) !== 0xe1) {
      offset += 2
      continue
    }

    const app1Length = view.getUint16(offset + 2)
    const exifMarker = view.getUint32(offset + 4)
    const tiffOffset = offset + 10

    if (exifMarker === 0x45786966 && tiffOffset + 8 <= view.byteLength) {
      const le = view.getUint16(tiffOffset) === 0x4949
      const ifdOffset = view.getUint32(tiffOffset + 4, le)
      // Handle both little-endian and big-endian offset base
      let ifdPtr: number
      if (le) {
        ifdPtr = tiffOffset + ifdOffset
      } else {
        ifdPtr = tiffOffset + ifdOffset
      }

      if (ifdPtr + 2 > view.byteLength) return null

      const numEntries = view.getUint16(ifdPtr, le)
      for (let i = 0; i < numEntries; i++) {
        const entryPtr = ifdPtr + 2 + i * 12
        if (entryPtr + 12 > view.byteLength) break
        const tag = view.getUint16(entryPtr, le)
        if (tag === 274) {
          return view.getUint16(entryPtr + 8, le)
        }
      }
    }
    offset += 2 + app1Length
  }
  return null
}

/**
 * Returns a blob URL for an EXIF-corrected version of the file.
 * If no EXIF orientation is found, returns a blob URL of the corrected image.
 * This handles BOTH JPEGs with EXIF orientation tags AND JPEGs without.
 */
export async function getExifCorrectedPreviewUrl(file: File): Promise<string> {
  return loadExifAdjustedImageToBlobUrl(file)
}

async function loadExifAdjustedImageToBlobUrl(file: File): Promise<string> {
  // Read EXIF orientation from raw file bytes
  let orientation: number | null = null
  try {
    const arrayBuffer = await file.arrayBuffer()
    orientation = getExifOrientation(arrayBuffer)
  } catch {
    return URL.createObjectURL(file)
  }

  // No EXIF rotation needed — return raw file
  if (!orientation || orientation === 1) {
    return URL.createObjectURL(file)
  }

  // Let the browser decoder apply EXIF exactly once, then draw that oriented
  // bitmap into a new canvas. The exported blob has no EXIF tag, so MGE receives
  // already-upright pixels and cannot rotate iPhone photos a second time.
  try {
    const imageBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    canvas.width = imageBitmap.width
    canvas.height = imageBitmap.height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return URL.createObjectURL(file)
    }

    ctx.drawImage(imageBitmap, 0, 0)
    imageBitmap.close()

    return new Promise<string>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(URL.createObjectURL(file)); return }
        resolve(URL.createObjectURL(blob))
      }, file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg')
    })
  } catch {
    // Fallback: Image() also applies EXIF orientation in modern browsers.
    return new Promise<string>((resolve, reject) => {
      const tmpUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(tmpUrl)
          resolve(URL.createObjectURL(file))
          return
        }
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(tmpUrl)
        canvas.toBlob((blob) => {
          if (!blob) { resolve(URL.createObjectURL(file)); return }
          resolve(URL.createObjectURL(blob))
        }, file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg')
      }
      img.onerror = () => { URL.revokeObjectURL(tmpUrl); reject(new Error('Could not load adjusted image')) }
      img.src = tmpUrl
    })
  }
}

async function loadExifAdjustedImage(file: File): Promise<HTMLImageElement> {
  const correctedUrl = await loadExifAdjustedImageToBlobUrl(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load adjusted image'))
    img.src = correctedUrl
  })
}

// --- end EXIF orientation handling ---

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The processed artwork could not be exported.'))
        return
      }

      resolve(blob)
    }, type)
  })
}

function getPreparedArtworkMeta(image: HTMLImageElement, options?: ProcessArtworkOptions) {
  const preferredSize = options?.preferredSizeId ? getFrameSizeOption(options.preferredSizeId) : null
  const orientation = options?.orientation ?? (preferredSize
    ? preferredSize.widthCm >= preferredSize.heightCm
      ? 'horizontal'
      : 'vertical'
    : getOrientationFromDimensions(image.naturalWidth, image.naturalHeight))
  const sourceRatio = image.naturalWidth / image.naturalHeight
  const sizeId = options?.preferredSizeId ?? getClosestFrameSizeId(sourceRatio, orientation)
  const sizeLabel = getFrameSizeOption(sizeId).label
  const targetRatio = getFrameRatio(sizeId, orientation)
  const crop = options?.crop
    ? getManualCrop(image.naturalWidth, image.naturalHeight, targetRatio, options.crop, options.zoom ?? null)
    : getCenteredCrop(image.naturalWidth, image.naturalHeight, targetRatio)

  return { orientation, sizeId, sizeLabel, crop }
}

async function renderCroppedArtwork(file: File, image: HTMLImageElement, options?: ProcessArtworkOptions) {
  const { orientation, sizeId, sizeLabel, crop } = getPreparedArtworkMeta(image, options)

  const largestCropEdge = Math.max(crop.cropWidth, crop.cropHeight)
  const scale = largestCropEdge > MAX_OUTPUT_EDGE ? MAX_OUTPUT_EDGE / largestCropEdge : 1
  const outputWidth = Math.max(1, Math.round(crop.cropWidth * scale))
  const outputHeight = Math.max(1, Math.round(crop.cropHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas processing is unavailable in this browser.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    crop.offsetX,
    crop.offsetY,
    crop.cropWidth,
    crop.cropHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  const mimeType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/png'
  const blob = await canvasToBlob(canvas, mimeType)
  const resultUrl = URL.createObjectURL(blob)
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  const sourceName = file.name || `artwork.${extension}`
  const preparedFile = new File([blob], sourceName.replace(/\.[^.]+$/, '') + `-${sizeId}.${extension}`, {
    type: mimeType,
    lastModified: file.lastModified || Date.now(),
  })

  return {
    resultUrl,
    file: preparedFile,
    mimeType,
    sourceName: file.name,
    sizeId,
    sizeLabel,
    orientation,
    crop,
    statusMessage: formatCropStatus(sizeId, orientation, crop),
    cleanup: () => URL.revokeObjectURL(resultUrl),
  }
}

export async function prepareArtworkForFrame(file: File, options?: ProcessArtworkOptions): Promise<PreparedArtworkForFrame> {
  const image = await loadExifAdjustedImage(file)
  return renderCroppedArtwork(file, image, options)
}

export const mockImageProcessor: ImageProcessor = async (file, options) => {
  await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))

  const image = await loadExifAdjustedImage(file)
  const prepared = await renderCroppedArtwork(file, image, options)

  return {
    resultUrl: prepared.resultUrl,
    mimeType: prepared.mimeType,
    sourceName: prepared.sourceName,
    sizeId: prepared.sizeId,
    sizeLabel: prepared.sizeLabel,
    orientation: prepared.orientation,
    crop: prepared.crop,
    statusMessage: prepared.statusMessage,
    cleanup: prepared.cleanup,
  }
}
