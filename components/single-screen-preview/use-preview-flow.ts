'use client'

import { useReducer, useCallback, useRef, useEffect } from "react"
import {
  previewReducer,
  initialPreviewState,
  deriveSceneModel,
  deriveGuidedModel,
  type FrameSizeOption,
} from "./preview-state"
import {
  mockImageProcessor,
  getExifCorrectedPreviewUrl,
} from "@/lib/image-processing"
import { captureEvent } from "@/lib/analytics/posthog"
import { createPreviewClient } from "@/lib/mgeveryday/browser-preview"
import { ACCEPTED_MIME_TYPES, DEFAULT_SIZE_ID, UX_COPY } from "./constants"

export function usePreviewFlow() {
  const [state, dispatch] = useReducer(previewReducer, initialPreviewState)
  const stateRef = useRef(state)
  const processingRequestRef = useRef<string | null>(null)
  stateRef.current = state

  const revokePreviewUrls = useCallback((temporaryUrl: string | null, finalUrl: string | null) => {
    if (temporaryUrl) {
      URL.revokeObjectURL(temporaryUrl)
    }

    if (finalUrl && finalUrl !== temporaryUrl) {
      URL.revokeObjectURL(finalUrl)
    }
  }, [])

  const processSelectedFile = useCallback(
    (file: File, sessionToken: string, preferredSizeId?: FrameSizeOption["id"]) => {
      const requestId = crypto.randomUUID()
      processingRequestRef.current = requestId
      dispatch({ type: "START_PROCESSING", sessionToken })

      const previewClient = createPreviewClient()
      const previewPromise = previewClient
        ? previewClient
            .createPreview(file, preferredSizeId?.toUpperCase())
            .then((created) =>
              created.imageUrl
                ? created
                : previewClient.pollPreview(created.previewId),
            )
        : mockImageProcessor(file, { preferredSizeId })

      previewPromise.then(
        (result) => {
          if (
            processingRequestRef.current !== requestId ||
            stateRef.current.sessionToken !== sessionToken
          ) {
            if ('cleanup' in result) {
              result.cleanup?.()
            }
            return
          }

          const previousFinalUrl = stateRef.current.finalUrl
          const currentTemporaryUrl = stateRef.current.temporaryUrl
          const resultUrl = 'imageUrl' in result ? result.imageUrl : result.resultUrl

          if (!resultUrl) {
            const errorMessage = 'MGE preview finished without a preview image URL'
            captureEvent(previewClient ? 'mge_preview_processing_failed' : 'preview_processing_failed', {
              selected_size: stateRef.current.selectedSize?.id,
              source_file_type: file.type || 'unknown',
              error_message: errorMessage,
            })
            dispatch({ type: "PROCESSING_FAILURE", error: errorMessage, sessionToken })
            return
          }

          dispatch({
            type: "PROCESSING_SUCCESS",
            url: resultUrl,
            sessionToken,
          })

          captureEvent(previewClient ? 'mge_preview_processing_completed' : 'preview_processing_completed', {
            selected_size: preferredSizeId,
            selected_size_label: 'sizeLabel' in result ? result.sizeLabel : preferredSizeId,
            preview_id: 'previewId' in result ? result.previewId : undefined,
            source_file_type: file.type || 'unknown',
            source_file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
          })

          if (
            previousFinalUrl &&
            previousFinalUrl !== currentTemporaryUrl &&
            previousFinalUrl !== resultUrl &&
            previousFinalUrl.startsWith('blob:')
          ) {
            URL.revokeObjectURL(previousFinalUrl)
          }
        },
        (err) => {
          if (
            processingRequestRef.current === requestId &&
            stateRef.current.sessionToken === sessionToken
          ) {
            const errorMessage = err?.message ?? UX_COPY.errorBadFile

            captureEvent(previewClient ? 'mge_preview_processing_failed' : 'preview_processing_failed', {
              selected_size: stateRef.current.selectedSize?.id,
              source_file_type: file.type || 'unknown',
              error_message: errorMessage,
            })

            dispatch({
              type: "PROCESSING_FAILURE",
              error: errorMessage,
              sessionToken,
            })
          }
        },
      )
    },
    [],
  )

  const handleSelectImage = useCallback(
    (file: File) => {
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
        file_type: file.type || 'unknown',
        file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
      })

      getExifCorrectedPreviewUrl(file)
        .then((previewUrl) => {
          if (stateRef.current.sessionToken !== sessionToken) {
            URL.revokeObjectURL(previewUrl)
            return
          }

          dispatch({ type: "TEMP_PREVIEW_READY", url: previewUrl, sessionToken })
          processSelectedFile(file, sessionToken, preferredSizeId)
        })
        .catch(() => {
          const previewUrl = URL.createObjectURL(file)

          if (stateRef.current.sessionToken !== sessionToken) {
            URL.revokeObjectURL(previewUrl)
            return
          }

          dispatch({ type: "TEMP_PREVIEW_READY", url: previewUrl, sessionToken })
          processSelectedFile(file, sessionToken, preferredSizeId)
        })
    },
    [processSelectedFile, revokePreviewUrls],
  )

  const handleRetry = useCallback(() => {
    const currentState = stateRef.current
    if (!currentState.selectedFile || !currentState.sessionToken) {
      dispatch({ type: "RETRY" })
      return
    }

    processSelectedFile(
      currentState.selectedFile,
      currentState.sessionToken,
      currentState.selectedSize?.id ?? DEFAULT_SIZE_ID,
    )
  }, [processSelectedFile])

  const handleReset = useCallback(() => {
    captureEvent('preview_reset_clicked', {
      selected_size: state.selectedSize?.id,
      status: state.status,
    })
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

      processSelectedFile(currentState.selectedFile, currentState.sessionToken, size.id)
    },
    [processSelectedFile],
  )

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
    },
  }
}
