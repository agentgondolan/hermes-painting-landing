'use client'

import { useReducer, useCallback, useRef, useEffect } from "react"
import {
  previewReducer,
  initialPreviewState,
  deriveSceneModel,
  deriveGuidedModel,
  type DotPreviewResult,
  type FrameSizeOption,
  type PreviewOptionChoice,
  type PreviewState,
} from "./preview-state"
import {
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
  cleanup?: () => void
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

function buildRestoredPreviewState(
  result: PreviewFlowResult,
  selectedSize: FrameSizeOption | null,
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
    (file: File, sessionToken: string, preferredSizeId: FrameSizeOption["id"]) => {
      const requestId = crypto.randomUUID()
      processingRequestRef.current[preferredSizeId] = requestId
      dispatch({ type: "START_PROCESSING", sessionToken, sizeId: preferredSizeId })

      prepareArtworkForFrame(file, { preferredSizeId }).then(
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

  const handleSetSize = useCallback(
    (size: FrameSizeOption) => {
      dispatch({ type: "SET_SIZE", size })

      const currentState = stateRef.current
      if (!currentState.selectedFile || !currentState.sessionToken) {
        return
      }

      const cachedPreview = currentState.dotPreviews[size.id]
      if (cachedPreview?.status === 'ready' || cachedPreview?.status === 'processing') {
        return
      }

      processDotPreviewForSize(currentState.selectedFile, currentState.sessionToken, size.id)
    },
    [processDotPreviewForSize],
  )

  const handleSetPreviewOption = useCallback((sizeId: string, optionId: string) => {
    dispatch({ type: "SET_PREVIEW_OPTION", sizeId, optionId })
    captureEvent('preview_option_selected', {
      selected_size: sizeId,
      preview_option_id: optionId,
    })
  }, [])

  useEffect(() => {
    const previewId = readPreviewIdFromUrl()
    const restored = restoreStoredPreviewState()
    const restoredPreviewId = restored?.selectedSize
      ? restored.dotPreviews[restored.selectedSize.id]?.previewId
      : null

    if (restored && (!previewId || restoredPreviewId === previewId)) {
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
    const urlSizeId = readPreviewSizeIdFromUrl()
    const selectedSize = urlSizeId ? getFrameSizeOption(urlSizeId) : stateRef.current.selectedSize

    previewClient
      .getPreview(previewId)
      .then((preview) =>
        isTerminalPreview(preview)
          ? preview
          : previewClient.pollPreview(preview.previewId || previewId),
      )
      .then((preview) => {
        if (cancelled) return
        const restoredFromUrl = buildRestoredPreviewState(preview, selectedSize)
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
    },
  }
}
