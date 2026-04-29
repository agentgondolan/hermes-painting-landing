'use client'

export type FrameSizeId = '40x50' | '40x60' | '60x80'
export type FrameOrientation = 'vertical' | 'horizontal'

export type FrameSizeOption = {
  id: FrameSizeId
  label: string
  widthCm: number
  heightCm: number
}

export type CropDetails = {
  applied: boolean
  sourceWidth: number
  sourceHeight: number
  cropWidth: number
  cropHeight: number
  offsetX: number
  offsetY: number
  targetRatio: number
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

export type ProcessArtworkOptions = {
  preferredSizeId?: FrameSizeId
}

export type ImageProcessor = (file: File, options?: ProcessArtworkOptions) => Promise<ProcessedArtwork>

export const FRAME_SIZE_OPTIONS: FrameSizeOption[] = [
  { id: '40x50', label: '40 × 50 cm', widthCm: 40, heightCm: 50 },
  { id: '40x60', label: '40 × 60 cm', widthCm: 40, heightCm: 60 },
  { id: '60x80', label: '60 × 80 cm', widthCm: 60, heightCm: 80 },
]

export const DEFAULT_FRAME_SIZE_ID: FrameSizeId = '40x50'

const MOCK_DELAY_MS = 1400
const MAX_OUTPUT_EDGE = 2000
const EPSILON = 0.01

export function getFrameSizeOption(sizeId: FrameSizeId) {
  return FRAME_SIZE_OPTIONS.find((option) => option.id === sizeId) ?? FRAME_SIZE_OPTIONS[0]
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
      depthCm: 3,
    }
  }

  return {
    widthCm: option.widthCm,
    heightCm: option.heightCm,
    depthCm: 3,
  }
}

export function getClosestFrameSizeId(sourceRatio: number, orientation: FrameOrientation) {
  return FRAME_SIZE_OPTIONS.reduce<FrameSizeId>((closest, option) => {
    const currentDelta = Math.abs(getFrameRatio(option.id, orientation) - sourceRatio)
    const bestDelta = Math.abs(getFrameRatio(closest, orientation) - sourceRatio)
    return currentDelta < bestDelta ? option.id : closest
  }, DEFAULT_FRAME_SIZE_ID)
}

export function getCenteredCrop(sourceWidth: number, sourceHeight: number, targetRatio: number): CropDetails {
  const sourceRatio = sourceWidth / sourceHeight

  if (Math.abs(sourceRatio - targetRatio) <= EPSILON) {
    return {
      applied: false,
      sourceWidth,
      sourceHeight,
      cropWidth: sourceWidth,
      cropHeight: sourceHeight,
      offsetX: 0,
      offsetY: 0,
      targetRatio,
    }
  }

  if (sourceRatio > targetRatio) {
    const cropWidth = Math.round(sourceHeight * targetRatio)
    const offsetX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2))

    return {
      applied: true,
      sourceWidth,
      sourceHeight,
      cropWidth,
      cropHeight: sourceHeight,
      offsetX,
      offsetY: 0,
      targetRatio,
    }
  }

  const cropHeight = Math.round(sourceWidth / targetRatio)
  const offsetY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2))

  return {
    applied: true,
    sourceWidth,
    sourceHeight,
    cropWidth: sourceWidth,
    cropHeight,
    offsetX: 0,
    offsetY,
    targetRatio,
  }
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

// EXIF orientation tag (274) values and their transforms
// 1=normal, 3=180°, 6=90° CW (photo appears narrow/long when held sideways), 8=90° CCW (photo appears narrow/long when held sideways)
const EXIF_TRANSFORMS: Record<number, { rotation: number; flipH: boolean }> = {
  1: { rotation: 0, flipH: false },
  2: { rotation: 0, flipH: true },
  3: { rotation: 180, flipH: false },
  4: { rotation: 180, flipH: true },
  5: { rotation: 90, flipH: true },
  6: { rotation: -90, flipH: false },
  7: { rotation: -90, flipH: true },
  8: { rotation: 90, flipH: false },
}

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

  const transform = EXIF_TRANSFORMS[orientation] || EXIF_TRANSFORMS[1]
  if (!transform.rotation && !transform.flipH) {
    return URL.createObjectURL(file)
  }

  // Use createImageBitmap with imageOrientation: 'none' to get RAW pixels
  // This prevents the browser from auto-applying EXIF rotation before we draw,
  // which causes double-rotation issues when combined with manual canvas rotation.
  let imageBitmap: ImageBitmap
  try {
    imageBitmap = await createImageBitmap(file, { imageOrientation: 'none' })
  } catch {
    // Fallback: use Image() — may auto-rotate on some browsers
    return new Promise<string>((resolve) => {
      const tmpUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(tmpUrl); resolve(tmpUrl) }
      img.onerror = () => { URL.revokeObjectURL(tmpUrl); resolve(tmpUrl) }
      img.src = tmpUrl
    })
  }

  const w = imageBitmap.width
  const h = imageBitmap.height

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return URL.createObjectURL(file)
  }

  // Set canvas dimensions after rotation
  if (transform.rotation % 180 !== 0) {
    canvas.width = h
    canvas.height = w
  } else {
    canvas.width = w
    canvas.height = h
  }

  // Apply rotation/flip
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((transform.rotation * Math.PI) / 180)
  if (transform.flipH) {
    ctx.scale(-1, 1)
  }
  ctx.drawImage(imageBitmap, -w / 2, -h / 2)
  ctx.restore()

  // Return blob URL of the corrected canvas (no EXIF tag included)
  return new Promise<string>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(URL.createObjectURL(file)); return }
      resolve(URL.createObjectURL(blob))
    }, file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg')
  })
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

export const mockImageProcessor: ImageProcessor = async (file, options) => {
  await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS))

  const image = await loadExifAdjustedImage(file)
  const orientation = getOrientationFromDimensions(image.naturalWidth, image.naturalHeight)
  const sourceRatio = image.naturalWidth / image.naturalHeight
  const sizeId = options?.preferredSizeId ?? getClosestFrameSizeId(sourceRatio, orientation)
  const sizeLabel = getFrameSizeOption(sizeId).label
  const targetRatio = getFrameRatio(sizeId, orientation)
  const crop = getCenteredCrop(image.naturalWidth, image.naturalHeight, targetRatio)

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

  return {
    resultUrl,
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
