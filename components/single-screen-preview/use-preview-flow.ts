'use client'

import { useReducer, useCallback, useRef, useEffect } from "react"
import {
  previewReducer,
  initialPreviewState,
  deriveSceneModel,
  deriveGuidedModel,
  type DotPreviewResult,
  type CropDetails,
  type FrameOrientation,
  type FrameSizeOption,
  type PreviewOptionChoice,
  type PreviewState,
} from "./preview-state"
import {
  FRAME_SIZE_OPTIONS,
  prepareArtworkForFrame,
  getFrameSizeOption,
} from "@/lib/image-processing"
import { captureEvent } from "@/lib/analytics/posthog"
import { createPreviewClient, isTerminalPreview, type BffPreviewCreateResult } from "@/lib/mgeveryday/browser-preview"
import { ACCEPTED_MIME_TYPES, DEFAULT_SIZE_ID, UX_COPY } from "./constants"
import {
  clearStoredCheckoutState,
  persistPreviewState,
  restoreStoredPreviewState,
} from "./checkout-persistence"

type PreviewFlowResult = Omit<BffPreviewCreateResult, 'previewId'> & {
  previewId: string | null
  sourceImageUrl?: string | null
  sourceGroupId?: string | null
  orientation?: FrameOrientation | null
  crop?: CropDetails | null
  cleanup?: () => void
}

type PreviewGenerationOptions = {
  orientation?: FrameOrientation | null
  crop?: CropDetails | null
}

export type RestorablePreviewResult = PreviewFlowResult

type HydratedSourceImage = {
  file: File
  sessionToken: string
}

function pickOrderable(result: Pick<PreviewFlowResult, 'options'>): boolean | null {
  const firstOrderable = result.options.find((option) => option.orderable)
  if (firstOrderable) return true
  if (result.options.length > 0) return false
  return null
}

function normalizePreviewOptions(result: Pick<PreviewFlowResult, 'options'>): PreviewOptionChoice[] {
  return result.options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => option.imageUrl && option.previewOptionId)
    .sort((a, b) => previewOptionPriority(a.option) - previewOptionPriority(b.option) || a.index - b.index)
    .map(({ option }, index) => ({
      previewOptionId: String(option.previewOptionId),
      label: option.label ?? `Option ${index + 1}`,
      description: option.description ?? null,
      imageUrl: option.imageUrl as string,
      mockupUrl: option.mockupUrl ?? null,
      orderable: option.orderable,
    }))
}

function previewOptionPriority(option: { label?: string | null; description?: string | null }): number {
  const text = `${option.label ?? ''} ${option.description ?? ''}`.toLowerCase()
  if (/\bdrama\b/.test(text)) return 0
  if (/\bsource\b/.test(text)) return 1
  return 2
}

export function readPreviewIdFromUrl(): string | null {
  if (typeof window === "undefined") return null
  const previewId = new URL(window.location.href).searchParams.get("preview_id")?.trim()
  return previewId || null
}

export function readPreviewSizeIdFromUrl(): string | null {
  if (typeof window === "undefined") return null
  const sizeId = new URL(window.location.href).searchParams.get("size_id")?.trim()
  return sizeId || null
}

function normalizePreviewSizeIdFromUrl(): string | null {
  const sizeId = readPreviewSizeIdFromUrl()?.toLowerCase() ?? null
  return sizeId && FRAME_SIZE_OPTIONS.some((option) => option.id === sizeId) ? sizeId : null
}

function readPreviewOrientationFromUrl(): FrameOrientation | null {
  if (typeof window === "undefined") return null
  const orientation = new URL(window.location.href).searchParams.get("orientation")?.trim().toLowerCase()
  return orientation === "horizontal" || orientation === "vertical" ? orientation : null
}

function buildRestoredPreviewState(
  result: PreviewFlowResult,
  selectedSize: FrameSizeOption | null,
  orientationHint: FrameOrientation | null = null,
): Pick<PreviewState, "selectedSize" | "dotPreviews" | "finalUrl"> | null {
  if (!result.previewId || !result.imageUrl) return null
  const size = selectedSize ?? initialPreviewState.selectedSize
  if (!size) return null

  const options = normalizePreviewOptions(result)
  const selectedOptionId = options.find((option) => /\bdrama\b/i.test(`${option.label} ${option.description ?? ''}`) && option.orderable)?.previewOptionId
    ?? options.find((option) => option.orderable)?.previewOptionId
    ?? options.find((option) => /\bdrama\b/i.test(`${option.label} ${option.description ?? ''}`))?.previewOptionId
    ?? options[0]?.previewOptionId
    ?? null
  const selectedOptionUrl = selectedOptionId
    ? options.find((option) => option.previewOptionId === selectedOptionId)?.imageUrl ?? null
    : null

  const dotPreview: DotPreviewResult = {
    sizeId: size.id,
    status: "ready",
    previewId: result.previewId,
    imageUrl: result.imageUrl,
    productCode: "DOT",
    orderable: pickOrderable(result),
    error: null,
    options,
    selectedOptionId,
    sourceImageUrl: result.sourceImageUrl ?? null,
    sourceGroupId: result.sourceGroupId ?? null,
    orientation: result.orientation ?? orientationHint ?? null,
    crop: result.crop ?? null,
  }

  return {
    selectedSize: size,
    finalUrl: selectedOptionUrl ?? result.imageUrl,
    dotPreviews: {
      [size.id]: dotPreview,
    },
  }
}

export function usePreviewFlow() {
  const [state, dispatch] = useReducer(previewReducer, initialPreviewState)
  const stateRef = useRef(state)
  const processingRequestRef = useRef<Record<string, string>>({})
  stateRef.current = state

  const revokePreviewUrls = useCallback((temporaryUrl: string | null, finalUrl: string | null) => {
    if (temporaryUrl) {
      URL.revokeObjectURL(temporaryUrl)
    }

    if (finalUrl && finalUrl !== temporaryUrl && finalUrl.startsWith('blob:')) {
      URL.revokeObjectURL(finalUrl)
    }
  }, [])

  const processDotPreviewForSize = useCallback(
    (file: File, sessionToken: string, preferredSizeId: FrameSizeOption["id"], generationOptions?: PreviewGenerationOptions) => {
      const requestId = crypto.randomUUID()
      processingRequestRef.current[preferredSizeId] = requestId
      dispatch({
        type: "START_PROCESSING",
        sessionToken,
        sizeId: preferredSizeId,
        orientation: generationOptions?.orientation ?? null,
        crop: generationOptions?.crop ?? null,
      })

      const manualCrop = generationOptions?.crop
        ? {
            x: generationOptions.crop.offsetX,
            y: generationOptions.crop.offsetY,
            width: generationOptions.crop.cropWidth,
            height: generationOptions.crop.cropHeight,
          }
        : null

      prepareArtworkForFrame(file, {
        preferredSizeId,
        orientation: generationOptions?.orientation ?? null,
        crop: manualCrop,
        zoom: generationOptions?.crop?.zoom ?? null,
      }).then(
        (preparedArtwork) => {
          if (
            processingRequestRef.current[preferredSizeId] !== requestId ||
            stateRef.current.sessionToken !== sessionToken
          ) {
            preparedArtwork.cleanup?.()
            return
          }

          const previousTemporaryUrl = stateRef.current.temporaryUrl
          if (previousTemporaryUrl && previousTemporaryUrl !== preparedArtwork.resultUrl) {
            URL.revokeObjectURL(previousTemporaryUrl)
          }

          dispatch({ type: "TEMP_PREVIEW_READY", url: preparedArtwork.resultUrl, sessionToken })

          const previewClient = createPreviewClient()
          const previewPromise = previewClient
            ? previewClient
                .createPreview(preparedArtwork.file, preferredSizeId.toUpperCase(), true)
                .then((created) =>
                  isTerminalPreview(created)
                    ? created
                    : previewClient.pollPreview(created.previewId),
                )
            : Promise.resolve<PreviewFlowResult>({
                imageUrl: preparedArtwork.resultUrl,
                previewId: null,
                status: 'LOCAL_FALLBACK',
                options: [],
                sourceImageUrl: null,
                sourceGroupId: null,
                orientation: preparedArtwork.orientation,
                crop: preparedArtwork.crop,
              })

          previewPromise.then(
            (result) => {
              if (
                processingRequestRef.current[preferredSizeId] !== requestId ||
                stateRef.current.sessionToken !== sessionToken
              ) {
                if ('cleanup' in result) {
                  result.cleanup?.()
                }
                return
              }

              const resultUrl = result.imageUrl

              if (!resultUrl) {
                const errorMessage = 'MGE preview finished without a preview_url image'
                captureEvent(previewClient ? 'mge_preview_processing_failed' : 'preview_processing_failed', {
                  selected_size: preferredSizeId,
                  source_file_type: preparedArtwork.file.type || file.type || 'unknown',
                  error_message: errorMessage,
                })
                dispatch({ type: "PROCESSING_FAILURE", error: errorMessage, sessionToken, sizeId: preferredSizeId })
                return
              }

              dispatch({
                type: "PROCESSING_SUCCESS",
                url: resultUrl,
                sessionToken,
                sizeId: preferredSizeId,
                previewId: result.previewId,
                status: result.status,
                orderable: pickOrderable(result),
                options: normalizePreviewOptions(result),
                sourceImageUrl: result.sourceImageUrl ?? null,
                sourceGroupId: result.sourceGroupId ?? null,
                orientation: preparedArtwork.orientation,
                crop: preparedArtwork.crop,
              })

              captureEvent(previewClient ? 'mge_dot_preview_completed' : 'preview_processing_completed', {
                selected_size: preferredSizeId,
                selected_size_label: stateRef.current.selectedSize?.id === preferredSizeId ? stateRef.current.selectedSize?.label : preferredSizeId,
                preview_id: result.previewId ?? undefined,
                preview_status: result.status,
                preview_option_count: result.options.length,
                product: 'DOT',
                source_file_type: preparedArtwork.file.type || file.type || 'unknown',
                source_file_size_mb: Number((preparedArtwork.file.size / 1024 / 1024).toFixed(2)),
              })
            },
            (err) => {
              if (
                processingRequestRef.current[preferredSizeId] === requestId &&
                stateRef.current.sessionToken === sessionToken
              ) {
                const errorMessage = err instanceof Error ? err.message : 'MGE preview request failed'

                captureEvent('mge_preview_processing_failed', {
                  selected_size: preferredSizeId,
                  source_file_type: preparedArtwork.file.type || file.type || 'unknown',
                  error_message: errorMessage,
                })

                dispatch({
                  type: "PROCESSING_FAILURE",
                  error: errorMessage,
                  sessionToken,
                  sizeId: preferredSizeId,
                })
              }
            },
          )
        },
        (err) => {
          if (
            processingRequestRef.current[preferredSizeId] === requestId &&
            stateRef.current.sessionToken === sessionToken
          ) {
            const errorMessage = err instanceof Error ? err.message : UX_COPY.errorBadFile

            captureEvent('preview_processing_failed', {
              selected_size: preferredSizeId,
              source_file_type: file.type || 'unknown',
              error_message: errorMessage,
            })

            dispatch({
              type: "PROCESSING_FAILURE",
              error: errorMessage,
              sessionToken,
              sizeId: preferredSizeId,
            })
          }
        },
      )
    },
    [],
  )

  const handleSelectImage = useCallback(
    (file: File) => {
      clearStoredCheckoutState()

      if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
        captureEvent('preview_file_rejected', {
          file_type: file.type || 'unknown',
          file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
        })
        dispatch({ type: "RESET" })
        return
      }

      const previousState = stateRef.current
      revokePreviewUrls(previousState.temporaryUrl, previousState.finalUrl)

      const sessionToken = crypto.randomUUID()
      const preferredSizeId = previousState.selectedSize?.id ?? DEFAULT_SIZE_ID

      dispatch({ type: "SELECT_IMAGE", file, sessionToken })
      captureEvent('preview_image_selected', {
        selected_size: preferredSizeId,
        product: 'DOT',
        file_type: file.type || 'unknown',
        file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
      })

      processDotPreviewForSize(file, sessionToken, preferredSizeId)
    },
    [processDotPreviewForSize, revokePreviewUrls],
  )

  const handleRetry = useCallback(() => {
    const currentState = stateRef.current
    if (!currentState.selectedFile || !currentState.sessionToken) {
      dispatch({ type: "RETRY" })
      return
    }

    const sizeId = currentState.selectedSize?.id ?? DEFAULT_SIZE_ID
    processDotPreviewForSize(currentState.selectedFile, currentState.sessionToken, sizeId)
  }, [processDotPreviewForSize])

  const handleReset = useCallback(() => {
    captureEvent('preview_reset_clicked', {
      selected_size: state.selectedSize?.id,
      status: state.status,
    })
    clearStoredCheckoutState()
    revokePreviewUrls(state.temporaryUrl, state.finalUrl)
    dispatch({ type: "RESET" })
  }, [revokePreviewUrls, state.finalUrl, state.selectedSize?.id, state.status, state.temporaryUrl])

  const fetchSourceImageFile = useCallback(async (sourceImageUrl: string, previewId?: string | null): Promise<HydratedSourceImage | null> => {
    try {
      const response = await fetch(sourceImageUrl, { credentials: 'omit' })
      if (!response.ok) throw new Error(`Source image fetch failed: ${response.status}`)
      const blob = await response.blob()
      const contentType = blob.type || response.headers.get('Content-Type') || 'image/jpeg'
      const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      return {
        file: new File([blob], `restored-preview-${previewId ?? 'source'}.${extension}`, { type: contentType }),
        sessionToken: crypto.randomUUID(),
      }
    } catch (error) {
      captureEvent('preview_source_image_hydration_failed', {
        preview_id: previewId ?? undefined,
        selected_size: stateRef.current.selectedSize?.id,
        error_message: error instanceof Error ? error.message : 'Source image hydration failed',
      })
      return null
    }
  }, [])

  const handleSetSize = useCallback(
    async (size: FrameSizeOption) => {
      const currentState = stateRef.current
      const cachedPreview = currentState.dotPreviews[size.id]
      const activePreview = currentState.selectedSize
        ? currentState.dotPreviews[currentState.selectedSize.id] ?? null
        : null

      dispatch({ type: "SET_SIZE", size })

      if (cachedPreview?.status === 'ready' || cachedPreview?.status === 'processing') {
        return
      }

      if (!currentState.selectedFile || !currentState.sessionToken) {
        if (!activePreview?.sourceImageUrl) return

        const hydrated = await fetchSourceImageFile(activePreview.sourceImageUrl, activePreview.previewId)
        if (!hydrated) return

        dispatch({ type: "HYDRATE_SOURCE_IMAGE", file: hydrated.file, sessionToken: hydrated.sessionToken })
        captureEvent('preview_source_image_hydrated', {
          preview_id: activePreview.previewId ?? undefined,
          selected_size: size.id,
          hydration_reason: 'size_switch',
        })
        processDotPreviewForSize(hydrated.file, hydrated.sessionToken, size.id, {
          orientation: activePreview.orientation ?? null,
        })
        return
      }

      processDotPreviewForSize(currentState.selectedFile, currentState.sessionToken, size.id)
    },
    [fetchSourceImageFile, processDotPreviewForSize],
  )

  const handleSetPreviewOption = useCallback((sizeId: string, optionId: string) => {
    dispatch({ type: "SET_PREVIEW_OPTION", sizeId, optionId })
    captureEvent('preview_option_selected', {
      selected_size: sizeId,
      preview_option_id: optionId,
    })
  }, [])

  const handleRestorePreviewResult = useCallback((result: RestorablePreviewResult, selectedSize: FrameSizeOption, orientationHint: FrameOrientation | null = null) => {
    const restored = buildRestoredPreviewState(result, selectedSize, orientationHint)
    if (!restored) return false

    dispatch({ type: "UPSERT_RESTORED_PREVIEW", state: restored })
    captureEvent('checkout_preview_restored', {
      selected_size: restored.selectedSize?.id,
      preview_id: result.previewId ?? undefined,
      restore_source: 'identity_project_variant',
      preview_status: result.status,
      preview_option_count: result.options.length,
    })
    return true
  }, [])

  const handleMarkSizeProcessing = useCallback((
    size: FrameSizeOption,
    source?: {
      sourceImageUrl?: string | null
      sourceGroupId?: string | null
      orientation?: FrameOrientation | null
      crop?: CropDetails | null
    },
  ) => {
    dispatch({
      type: "MARK_SIZE_PROCESSING",
      size,
      sourceImageUrl: source?.sourceImageUrl ?? null,
      sourceGroupId: source?.sourceGroupId ?? null,
      orientation: source?.orientation ?? null,
      crop: source?.crop ?? null,
    })
  }, [])

  const handleApplyCrop = useCallback((sizeId: string, orientation: FrameOrientation, crop: CropDetails) => {
    const currentState = stateRef.current
    if (!currentState.selectedFile || !currentState.sessionToken) {
      dispatch({ type: "SET_PREVIEW_CROP", sizeId, orientation, crop })
      return
    }

    captureEvent('preview_crop_metadata_updated', {
      selected_size: sizeId,
      orientation,
      crop_source: crop.source,
    })
    processDotPreviewForSize(currentState.selectedFile, currentState.sessionToken, sizeId, { orientation, crop })
  }, [processDotPreviewForSize])

  const hydrateSourceImage = useCallback(async (sourceImageUrl: string, previewId?: string | null): Promise<boolean> => {
    if (!sourceImageUrl) return false
    const currentState = stateRef.current
    if (currentState.selectedFile && currentState.sessionToken) return true

    const hydrated = await fetchSourceImageFile(sourceImageUrl, previewId)
    if (!hydrated) return false

    dispatch({ type: "HYDRATE_SOURCE_IMAGE", file: hydrated.file, sessionToken: hydrated.sessionToken })
    captureEvent('preview_source_image_hydrated', {
      preview_id: previewId ?? undefined,
      selected_size: currentState.selectedSize?.id,
      hydration_reason: 'account_restore',
    })
    return true
  }, [fetchSourceImageFile])

  useEffect(() => {
    const previewId = readPreviewIdFromUrl()
    const normalizedUrlSizeId = normalizePreviewSizeIdFromUrl()
    const urlOrientation = readPreviewOrientationFromUrl()
    const restored = restoreStoredPreviewState()
    const restoredPreviewId = restored?.selectedSize
      ? restored.dotPreviews[restored.selectedSize.id]?.previewId
      : null
    const restoredMatchesPreview = !previewId || restoredPreviewId === previewId
    const restoredMatchesUrlSize = !normalizedUrlSizeId || restored?.selectedSize?.id === normalizedUrlSizeId

    if (restored && restoredMatchesPreview && restoredMatchesUrlSize) {
      dispatch({ type: "RESTORE_PREVIEW", state: restored })
      captureEvent('checkout_preview_restored', {
        selected_size: restored.selectedSize?.id,
        preview_id: restoredPreviewId ?? undefined,
        restore_source: 'local_storage',
      })
      return
    }

    if (!previewId) return

    const previewClient = createPreviewClient()
    if (!previewClient) return

    let cancelled = false
    const selectedSize = normalizedUrlSizeId ? getFrameSizeOption(normalizedUrlSizeId) : stateRef.current.selectedSize

    previewClient
      .getPreview(previewId)
      .then((preview) =>
        isTerminalPreview(preview)
          ? preview
          : previewClient.pollPreview(preview.previewId || previewId),
      )
      .then((preview) => {
        if (cancelled) return
        const restoredFromUrl = buildRestoredPreviewState(preview, selectedSize, urlOrientation)
        if (!restoredFromUrl) {
          captureEvent('checkout_preview_restore_failed', {
            preview_id: previewId,
            restore_source: 'preview_id_url',
            preview_status: preview.status,
            error_message: 'Preview response had no restorable image',
          })
          return
        }

        dispatch({ type: "RESTORE_PREVIEW", state: restoredFromUrl })
        captureEvent('checkout_preview_restored', {
          selected_size: restoredFromUrl.selectedSize?.id,
          preview_id: previewId,
          restore_source: 'preview_id_url',
          preview_status: preview.status,
          preview_option_count: preview.options.length,
        })
      })
      .catch((err) => {
        if (cancelled) return
        captureEvent('checkout_preview_restore_failed', {
          preview_id: previewId,
          restore_source: 'preview_id_url',
          error_message: err instanceof Error ? err.message : 'Preview restore failed',
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    persistPreviewState(state)
  }, [state])

  useEffect(() => {
    return () => {
      revokePreviewUrls(stateRef.current.temporaryUrl, stateRef.current.finalUrl)
    }
  }, [revokePreviewUrls])

  return {
    state,
    sceneModel: deriveSceneModel(state),
    guidedModel: deriveGuidedModel(state),
    actions: {
      selectImage: handleSelectImage,
      retry: handleRetry,
      reset: handleReset,
      setSize: handleSetSize,
      setPreviewOption: handleSetPreviewOption,
      restorePreviewResult: handleRestorePreviewResult,
      markSizeProcessing: handleMarkSizeProcessing,
      applyCrop: handleApplyCrop,
      hydrateSourceImage,
    },
  }
}
