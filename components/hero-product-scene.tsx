'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ProductSceneCanvas } from '@/components/product-scene-canvas'
import {
  DEFAULT_FRAME_SIZE_ID,
  FRAME_SIZE_OPTIONS,
  getFrameSizeOption,
  mockImageProcessor,
  type FrameSizeId,
  type ProcessedArtwork,
} from '@/lib/image-processing'

type UploadState = 'idle' | 'selected' | 'processing' | 'ready' | 'error'

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)

    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export function HeroProductScene({ compact = false }: { compact?: boolean }) {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [dragging, setDragging] = useState(false)
  const [rotationY, setRotationY] = useState(-0.18)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFrameSizeId, setSelectedFrameSizeId] = useState<FrameSizeId>(DEFAULT_FRAME_SIZE_ID)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [processedArtwork, setProcessedArtwork] = useState<ProcessedArtwork | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const dragXRef = useRef<number | null>(null)
  const velocityRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastMoveTimeRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const processingRequestRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (prefersReducedMotion) {
      velocityRef.current = 0
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [prefersReducedMotion])

  useEffect(() => {
    return () => {
      processedArtwork?.cleanup?.()
    }
  }, [processedArtwork])

  const stopInertia = () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }

  const startInertia = () => {
    if (prefersReducedMotion) {
      velocityRef.current = 0
      return
    }

    stopInertia()

    let lastTime = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = Math.min((now - lastTime) / 1000, 0.032)
      lastTime = now

      velocityRef.current *= Math.exp(-3.1 * deltaSeconds)

      if (Math.abs(velocityRef.current) < 0.00045) {
        velocityRef.current = 0
        animationFrameRef.current = null
        return
      }

      setRotationY((current) => current + velocityRef.current * deltaSeconds)
      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)
  }

  useEffect(() => {
    draggingRef.current = dragging
  }, [dragging])

  const finishDrag = (event?: { currentTarget: EventTarget & HTMLDivElement; pointerId: number }) => {
    setDragging(false)
    draggingRef.current = false
    dragXRef.current = null
    lastMoveTimeRef.current = null
    activePointerIdRef.current = null

    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    startInertia()
  }

  const stateLabel = useMemo(() => {
    switch (uploadState) {
      case 'selected':
        return 'Ready to process'
      case 'processing':
        return 'Processing artwork…'
      case 'ready':
        return 'Artwork attached to canvas'
      case 'error':
        return 'Upload failed'
      default:
        return 'Upload your photo'
    }
  }, [uploadState])

  const beginProcessing = async (file: File, preferredSizeId?: FrameSizeId) => {
    const requestId = processingRequestRef.current + 1
    processingRequestRef.current = requestId

    setSelectedFileName(file.name)
    setErrorMessage(null)
    setUploadState('selected')
    setUploadState('processing')

    try {
      const result = await mockImageProcessor(file, { preferredSizeId })

      if (processingRequestRef.current !== requestId) {
        result.cleanup?.()
        return
      }

      setSelectedFrameSizeId(result.sizeId)
      setProcessedArtwork((current) => {
        current?.cleanup?.()
        return result
      })
      setUploadState('ready')
    } catch (error) {
      if (processingRequestRef.current !== requestId) {
        return
      }

      setUploadState('error')
      setErrorMessage(error instanceof Error ? error.message : 'The artwork could not be processed.')
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      setUploadState('error')
      setErrorMessage('Please upload a PNG, JPG, WEBP, or SVG image file.')
      return
    }

    setOriginalFile(file)
    await beginProcessing(file)
  }

  const handleSizeChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSizeId = event.target.value as FrameSizeId
    setSelectedFrameSizeId(nextSizeId)

    if (!originalFile) {
      return
    }

    await beginProcessing(originalFile, nextSizeId)
  }

  const clearArtwork = () => {
    processingRequestRef.current += 1
    setUploadState('idle')
    setSelectedFileName(null)
    setOriginalFile(null)
    setErrorMessage(null)
    setSelectedFrameSizeId(DEFAULT_FRAME_SIZE_ID)
    setProcessedArtwork((current) => {
      current?.cleanup?.()
      return null
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const selectedSizeLabel = getFrameSizeOption(selectedFrameSizeId).label
  const orientationLabel = processedArtwork?.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'
  const badgeLabel = processedArtwork
    ? `${processedArtwork.sizeLabel} · ${orientationLabel.toLowerCase()}`
    : `${selectedSizeLabel} · vertical`

  return (
    <div
      className={`overflow-hidden rounded-[36px] border border-black/8 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_40px_120px_rgba(58,38,18,0.08)] ${compact ? 'flex h-full min-h-0 flex-col rounded-none border-0 shadow-none' : ''}`}
    >
      {!compact ? <div className="border-b border-black/6 bg-[linear-gradient(180deg,rgba(255,252,247,0.96),rgba(250,243,234,0.86))] px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)] lg:items-end">
          <div className="space-y-3 text-[#3b291c]">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.22em] text-[#8a6b52]">Live artwork preview</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e4736]">
                Upload a photo, keep the async processing step, then preview the cropped artwork on the correct canvas ratio.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#8a6b52]">
              <span className="rounded-full bg-[#f3e3d2] px-2.5 py-1">1. upload</span>
              <span className="rounded-full bg-[#f3e3d2] px-2.5 py-1">2. auto-crop</span>
              <span className="rounded-full bg-[#f3e3d2] px-2.5 py-1">3. preview on canvas</span>
            </div>
          </div>

          <div className="space-y-3">
            <label
              htmlFor="hero-artwork-upload"
              className="flex cursor-pointer flex-col gap-2 rounded-[20px] border border-dashed border-[#c9af96] bg-[#fffaf4] px-4 py-3 transition hover:border-[#b78d67] hover:bg-white"
            >
              <span className="text-[0.68rem] uppercase tracking-[0.22em] text-[#8a6b52]">{stateLabel}</span>
              <span className="text-sm font-medium text-[#3b291c]">PNG, JPG, WEBP, or SVG</span>
              <span className="text-sm leading-6 text-[#6d5441]">
                {selectedFileName ? selectedFileName : 'Choose an image to project onto the canvas.'}
              </span>
            </label>

            <input
              ref={fileInputRef}
              id="hero-artwork-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={handleFileChange}
            />

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-2">
                <span className="block text-[0.68rem] uppercase tracking-[0.22em] text-[#8a6b52]">Frame size</span>
                <select
                  value={selectedFrameSizeId}
                  onChange={handleSizeChange}
                  className="min-h-11 w-full rounded-[16px] border border-[#d8c3ae] bg-white px-3 text-sm font-medium text-[#3b291c] outline-none transition focus:border-[#b78d67]"
                >
                  {FRAME_SIZE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {uploadState === 'ready' && processedArtwork ? (
                <button
                  type="button"
                  onClick={clearArtwork}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-[#5e4736] transition hover:bg-white"
                >
                  Remove artwork
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {uploadState === 'processing' ? (
          <div className="mt-4 rounded-[18px] bg-[#f7eadb] px-4 py-3 text-sm text-[#6d5441]">
            Mock async processing is running now. The crop + ratio logic stays client-side for the moment, but the UI flow is ready for a backend job later.
          </div>
        ) : null}

        {uploadState === 'ready' && processedArtwork ? (
          <div className="mt-4 rounded-[18px] bg-[#eef7ef] px-4 py-3 text-sm text-[#44634b]">{processedArtwork.statusMessage}</div>
        ) : null}

        {uploadState === 'error' && errorMessage ? (
          <div className="mt-4 rounded-[18px] bg-[#fff1ef] px-4 py-3 text-sm text-[#8b453d]">{errorMessage}</div>
        ) : null}
      </div> : null}

      <div
        data-hero-product-scene
        className={`relative touch-pan-y select-none overflow-hidden bg-white ${compact ? 'flex-1 min-h-0' : ''}`}
        style={{ WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'pan-y' }}
        onPointerDown={(event) => {
          if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
            return
          }

          stopInertia()
          velocityRef.current = 0
          lastMoveTimeRef.current = event.timeStamp
          activePointerIdRef.current = event.pointerId
          draggingRef.current = true
          setDragging(true)
          dragXRef.current = event.clientX
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerUp={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return
          }

          finishDrag(event)
        }}
        onPointerCancel={(event) => {
          if (activePointerIdRef.current !== event.pointerId) {
            return
          }

          finishDrag(event)
        }}
        onPointerLeave={(event) => {
          if (!draggingRef.current || activePointerIdRef.current !== event.pointerId) {
            return
          }

          if (event.pointerType === 'mouse' && !event.currentTarget.hasPointerCapture(event.pointerId)) {
            finishDrag(event)
          }
        }}
        onPointerMove={(event) => {
          if (
            prefersReducedMotion ||
            !draggingRef.current ||
            activePointerIdRef.current !== event.pointerId
          ) {
            return
          }

          event.preventDefault()

          const previousX = dragXRef.current ?? event.clientX
          const delta = event.clientX - previousX
          dragXRef.current = event.clientX

          const previousTime = lastMoveTimeRef.current ?? event.timeStamp
          const deltaTime = Math.max((event.timeStamp - previousTime) / 1000, 1 / 240)
          lastMoveTimeRef.current = event.timeStamp

          const sensitivity = event.pointerType === 'touch' ? 0.0165 : 0.01
          const rotationDelta = delta * sensitivity
          velocityRef.current = rotationDelta / deltaTime
          setRotationY((current) => current + rotationDelta)
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(255,255,255,0.78),transparent_24%),radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.2),transparent_20%)]" />
        <div className="pointer-events-none absolute inset-x-[18%] top-[8%] h-[24%] rounded-full bg-white/55 blur-3xl" />

        <div className={`relative w-full ${compact ? 'h-full min-h-0' : 'aspect-[16/11] min-h-[380px] sm:min-h-[500px] lg:min-h-[620px]'}`}>
          <ProductSceneCanvas
            reducedMotion={prefersReducedMotion}
            rotationY={rotationY}
            artworkTextureUrl={processedArtwork?.resultUrl ?? null}
            frameSizeId={processedArtwork?.sizeId ?? selectedFrameSizeId}
            orientation={processedArtwork?.orientation ?? 'vertical'}
          />
        </div>

        <div className={`pointer-events-none absolute z-10 rounded-full border border-white/76 bg-white/82 px-3 py-1.5 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[#5e4736] shadow-[0_16px_32px_rgba(85,58,30,0.08)] backdrop-blur-md ${compact ? 'bottom-3 right-3' : 'bottom-4 right-4 sm:bottom-6 sm:right-6 sm:px-4'}`}>
          {badgeLabel}
        </div>
      </div>
    </div>
  )
}
