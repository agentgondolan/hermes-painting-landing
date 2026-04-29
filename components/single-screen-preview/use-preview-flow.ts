"use client"

import { useReducer, useCallback, useRef, useEffect } from "react"
import {
  previewReducer,
  initialPreviewState,
  deriveSceneModel,
  deriveGuidedModel,
  type PreviewEvent,
  type PreviewState,
  type FrameSizeOption,
} from "./preview-state"
import { mockImageProcessor } from "@/lib/image-processing"
import { ACCEPTED_MIME_TYPES, DEFAULT_SIZE_ID, UX_COPY } from "./constants"

export function usePreviewFlow() {
  const [state, dispatch] = useReducer(previewReducer, initialPreviewState)
  const stateRef = useRef(state)
  stateRef.current = state

  const handleSelectImage = useCallback((file: File) => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
      dispatch({ type: "RESET" })
      return
    }

    const sessionToken = crypto.randomUUID()

    const startTime = Date.now()

    dispatch({type: "SELECT_IMAGE", file, sessionToken})

    // Create temp preview URL from EXIF-corrected image
    import('@/lib/image-processing').then(({ getExifCorrectedPreviewUrl }) => {
      getExifCorrectedPreviewUrl(file).then((previewUrl) => {
        dispatch({ type: "TEMP_PREVIEW_READY", url: previewUrl, sessionToken })
        dispatch({ type: "START_PROCESSING", sessionToken })
      }).catch(() => {
        // Fallback: use raw file URL
        const url = URL.createObjectURL(file)
        dispatch({ type: "TEMP_PREVIEW_READY", url, sessionToken })
        dispatch({ type: "START_PROCESSING", sessionToken })
      })
    })

    // Run mock processor (simulates server-side transform)
    mockImageProcessor(file).then(
      (result) => {
        if (stateRef.current.sessionToken === sessionToken) {
          dispatch({
            type: "PROCESSING_SUCCESS",
            url: result.resultUrl,
            sessionToken,
          })
        } else {
          result.cleanup?.()
        }
      },
      (err) => {
        if (stateRef.current.sessionToken === sessionToken) {
          dispatch({
            type: "PROCESSING_FAILURE",
            error: err?.message ?? UX_COPY.errorBadFile,
            sessionToken,
          })
        }
      },
    )
  }, [])

  const handleRetry = useCallback(() => {
    dispatch({ type: "RETRY" })
  }, [])

  const handleReset = useCallback(() => {
    if (state.temporaryUrl) URL.revokeObjectURL(state.temporaryUrl)
    if (state.finalUrl && state.finalUrl !== state.temporaryUrl)
      URL.revokeObjectURL(state.finalUrl)
    dispatch({ type: "RESET" })
  }, [state])

  const handleSetSize = useCallback((size: FrameSizeOption) => {
    dispatch({ type: "SET_SIZE", size })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.temporaryUrl) URL.revokeObjectURL(state.temporaryUrl)
      if (state.finalUrl && state.finalUrl !== state.temporaryUrl)
        URL.revokeObjectURL(state.finalUrl)
    }
  }, [state.temporaryUrl, state.finalUrl])

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
