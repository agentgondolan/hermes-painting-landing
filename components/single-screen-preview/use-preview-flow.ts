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

      mockImageProcessor(file, { preferredSizeId }).then(
        (result) => {
          if (
            processingRequestRef.current !== requestId ||
            stateRef.current.sessionToken !== sessionToken
          ) {
            result.cleanup?.()
            return
          }

          const previousFinalUrl = stateRef.current.finalUrl
          const currentTemporaryUrl = stateRef.current.temporaryUrl

          dispatch({
            type: "PROCESSING_SUCCESS",
            url: result.resultUrl,
            sessionToken,
          })

          if (
            previousFinalUrl &&
            previousFinalUrl !== currentTemporaryUrl &&
            previousFinalUrl !== result.resultUrl
          ) {
            URL.revokeObjectURL(previousFinalUrl)
          }
        },
        (err) => {
          if (
            processingRequestRef.current === requestId &&
            stateRef.current.sessionToken === sessionToken
          ) {
            dispatch({
              type: "PROCESSING_FAILURE",
              error: err?.message ?? UX_COPY.errorBadFile,
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
        dispatch({ type: "RESET" })
        return
      }

      const previousState = stateRef.current
      revokePreviewUrls(previousState.temporaryUrl, previousState.finalUrl)

      const sessionToken = crypto.randomUUID()
      const preferredSizeId = previousState.selectedSize?.id ?? DEFAULT_SIZE_ID

      dispatch({ type: "SELECT_IMAGE", file, sessionToken })

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
    revokePreviewUrls(state.temporaryUrl, state.finalUrl)
    dispatch({ type: "RESET" })
  }, [revokePreviewUrls, state.finalUrl, state.temporaryUrl])

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
