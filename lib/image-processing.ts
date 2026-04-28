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

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(sourceUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('The uploaded image could not be decoded.'))
    }

    image.src = sourceUrl
  })
}

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

  const image = await loadImageFromFile(file)
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
