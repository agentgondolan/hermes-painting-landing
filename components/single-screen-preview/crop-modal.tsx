"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  getCenteredCrop,
  getFrameRatio,
  getManualCrop,
  type CropDetails,
  type FrameOrientation,
  type FrameSizeOption,
} from "@/lib/image-processing"
import { captureEvent } from "@/lib/analytics/posthog"

type NormalizedCropBox = {
  x: number
  y: number
  width: number
  height: number
}

type CropModalProps = {
  open: boolean
  sourceFile: File | null
  selectedSize: FrameSizeOption | null
  currentOrientation?: FrameOrientation | null
  currentCrop?: CropDetails | null
  onApply: (orientation: FrameOrientation, crop: CropDetails) => void
  onClose: () => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3

export function CropModal({
  open,
  sourceFile,
  selectedSize,
  currentOrientation,
  currentCrop,
  onApply,
  onClose,
}: CropModalProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [orientation, setOrientation] = useState<FrameOrientation>("vertical")
  const [zoom, setZoom] = useState(1)
  const [cropBox, setCropBox] = useState<NormalizedCropBox | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    crop: NormalizedCropBox
    rect: DOMRect
  } | null>(null)

  useEffect(() => {
    if (!open || !sourceFile) {
      setSourceUrl(null)
      setImageSize(null)
      setCropBox(null)
      return
    }

    const nextUrl = URL.createObjectURL(sourceFile)
    setSourceUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [open, sourceFile])

  useEffect(() => {
    if (!open || !selectedSize) return
    const nextOrientation = currentOrientation ?? defaultOrientationForSize(selectedSize)
    setOrientation(nextOrientation)
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentCrop?.zoom ?? 1)))
  }, [currentCrop?.zoom, currentOrientation, open, selectedSize])

  useEffect(() => {
    if (!open || !imageSize || !selectedSize) return
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))

    if (
      currentCrop &&
      currentCrop.sourceWidth === imageSize.width &&
      currentCrop.sourceHeight === imageSize.height &&
      currentCrop.normalized.width > 0 &&
      currentCrop.normalized.height > 0
    ) {
      setCropBox(clampCropBox(currentCrop.normalized))
      return
    }

    setCropBox(createCenteredNormalizedCrop(imageSize.width, imageSize.height, selectedSize.id, orientation, nextZoom))
    // Seed the editor when a modal/source is opened. Drag, zoom, and orientation
    // handlers own subsequent crop changes while the modal remains open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCrop, imageSize, open, selectedSize])

  const ratioLabel = useMemo(() => {
    if (!selectedSize) return "Selected size"
    return orientation === "horizontal"
      ? `${selectedSize.heightCm} x ${selectedSize.widthCm} cm`
      : selectedSize.label
  }, [orientation, selectedSize])

  const canApply = Boolean(sourceFile && selectedSize && imageSize && cropBox)

  const handleZoom = (value: number) => {
    if (!imageSize || !selectedSize) return
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
    setZoom(nextZoom)
    setCropBox((current) => resizeCropAroundCenter(
      current ?? createCenteredNormalizedCrop(imageSize.width, imageSize.height, selectedSize.id, orientation, 1),
      imageSize.width,
      imageSize.height,
      selectedSize.id,
      orientation,
      nextZoom,
    ))
  }

  const handleOrientation = (nextOrientation: FrameOrientation) => {
    if (!imageSize || !selectedSize) {
      setOrientation(nextOrientation)
      return
    }

    setOrientation(nextOrientation)
    setCropBox((current) => resizeCropAroundCenter(
      current ?? createCenteredNormalizedCrop(imageSize.width, imageSize.height, selectedSize.id, nextOrientation, zoom),
      imageSize.width,
      imageSize.height,
      selectedSize.id,
      nextOrientation,
      zoom,
    ))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropBox) return
    const imageRect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!imageRect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop: cropBox,
      rect: imageRect,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = (event.clientX - drag.startX) / drag.rect.width
    const deltaY = (event.clientY - drag.startY) / drag.rect.height
    setCropBox(clampCropBox({
      ...drag.crop,
      x: drag.crop.x + deltaX,
      y: drag.crop.y + deltaY,
    }))
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  const handleApply = () => {
    if (!canApply || !selectedSize || !imageSize || !cropBox) return
    const targetRatio = getFrameRatio(selectedSize.id, orientation)
    const crop = getManualCrop(
      imageSize.width,
      imageSize.height,
      targetRatio,
      {
        x: cropBox.x * imageSize.width,
        y: cropBox.y * imageSize.height,
        width: cropBox.width * imageSize.width,
        height: cropBox.height * imageSize.height,
      },
      zoom,
    )

    captureEvent("preview_crop_applied", {
      selected_size: selectedSize.id,
      orientation,
      crop_source: crop.source,
    })
    onApply(orientation, crop)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2e2d2c]/34 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-8 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-[34rem] overflow-hidden rounded-[1.5rem] border border-[#9432c1]/14 bg-white text-[#2e2d2c] shadow-[0_28px_90px_rgba(46,45,44,0.24)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#9432c1]/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9432c1]/62">Crop</p>
            <h2 className="truncate text-lg font-black leading-tight">{ratioLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#2e2d2c]/7 px-4 py-2 text-xs font-extrabold text-[#2e2d2c]/58 transition hover:bg-[#2e2d2c]/12"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <div className="flex rounded-full bg-[#2e2d2c]/6 p-1">
            {(["vertical", "horizontal"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleOrientation(option)}
                className={`min-w-0 flex-1 rounded-full px-3 py-2 text-xs font-extrabold capitalize transition ${
                  orientation === option
                    ? "bg-[#9432c1] text-white shadow-[0_10px_24px_rgba(148,50,193,0.22)]"
                    : "text-[#2e2d2c]/58 hover:bg-white/70"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex min-h-[18rem] items-center justify-center rounded-[1rem] bg-[#f6f0fa] p-2">
            {sourceUrl ? (
              <div className="relative max-h-[52dvh] max-w-full overflow-hidden rounded-[0.9rem] bg-white shadow-[inset_0_0_0_1px_rgba(148,50,193,0.12)]">
                <img
                  src={sourceUrl}
                  alt=""
                  className="block max-h-[52dvh] max-w-full select-none object-contain"
                  draggable={false}
                  onLoad={(event) => {
                    const image = event.currentTarget
                    setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
                  }}
                />
                {cropBox ? (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-[#2e2d2c]/36" />
                    <div
                      role="slider"
                      aria-label="Crop area"
                      aria-valuetext={ratioLabel}
                      tabIndex={0}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerEnd}
                      onPointerCancel={handlePointerEnd}
                      className="absolute cursor-move touch-none rounded-[0.55rem] border-2 border-white bg-transparent shadow-[0_0_0_9999px_rgba(46,45,44,0.34),0_0_0_1px_rgba(148,50,193,0.6)] outline-none ring-[#9432c1]/35 focus:ring-4"
                      style={{
                        left: `${cropBox.x * 100}%`,
                        top: `${cropBox.y * 100}%`,
                        width: `${cropBox.width * 100}%`,
                        height: `${cropBox.height * 100}%`,
                      }}
                    >
                      <span className="absolute left-1/3 top-0 h-full w-px bg-white/45" />
                      <span className="absolute left-2/3 top-0 h-full w-px bg-white/45" />
                      <span className="absolute left-0 top-1/3 h-px w-full bg-white/45" />
                      <span className="absolute left-0 top-2/3 h-px w-full bg-white/45" />
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm font-bold text-[#2e2d2c]/48">Upload a photo before editing crop.</p>
            )}
          </div>

          <label className="block">
            <span className="mb-2 flex items-center justify-between text-xs font-extrabold text-[#2e2d2c]/62">
              <span>Zoom</span>
              <span>{zoom.toFixed(1)}x</span>
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(event) => handleZoom(Number(event.currentTarget.value))}
              className="w-full accent-[#9432c1]"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#9432c1]/16 bg-white px-4 py-3 text-sm font-extrabold text-[#9432c1] transition hover:bg-[#f6f0fa]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="rounded-full bg-[#9432c1] px-4 py-3 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.24)] transition hover:bg-[#7f28aa] disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/10 disabled:text-[#2e2d2c]/35"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function defaultOrientationForSize(size: FrameSizeOption): FrameOrientation {
  return size.widthCm >= size.heightCm ? "horizontal" : "vertical"
}

function clampCropBox(crop: NormalizedCropBox): NormalizedCropBox {
  const width = clamp(crop.width, 0.02, 1)
  const height = clamp(crop.height, 0.02, 1)
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  }
}

function createCenteredNormalizedCrop(
  sourceWidth: number,
  sourceHeight: number,
  sizeId: string,
  orientation: FrameOrientation,
  zoom: number,
): NormalizedCropBox {
  const targetRatio = getFrameRatio(sizeId, orientation)
  const centered = getCenteredCrop(sourceWidth, sourceHeight, targetRatio)
  return resizeCropAroundCenter(centered.normalized, sourceWidth, sourceHeight, sizeId, orientation, zoom)
}

function resizeCropAroundCenter(
  current: NormalizedCropBox,
  sourceWidth: number,
  sourceHeight: number,
  sizeId: string,
  orientation: FrameOrientation,
  zoom: number,
): NormalizedCropBox {
  const targetRatio = getFrameRatio(sizeId, orientation)
  const base = getCenteredCrop(sourceWidth, sourceHeight, targetRatio).normalized
  const nextWidth = base.width / zoom
  const nextHeight = base.height / zoom
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2

  return clampCropBox({
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight,
  })
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
