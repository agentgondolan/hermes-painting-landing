// ADR-02: Async Preview State Model

export type PreviewStatus =
  | "idle"
  | "image-selected"
  | "temporary-preview-ready"
  | "processing"
  | "final-preview-ready"
  | "error"

import {
  DEFAULT_FRAME_SIZE_ID,
  getFrameSizeOption,
  type FrameSizeOption,
} from '@/lib/image-processing'
export type { FrameSizeOption }

export interface PreviewState {
  status: PreviewStatus
  sessionToken: string | null
  temporaryUrl: string | null
  finalUrl: string | null
  selectedFile: File | null
  selectedSize: FrameSizeOption | null
  error: string | null
}

export type PreviewEvent =
  | { type: "SELECT_IMAGE"; file: File; sessionToken: string }
  | { type: "TEMP_PREVIEW_READY"; url: string; sessionToken: string }
  | { type: "START_PROCESSING"; sessionToken: string }
  | { type: "PROCESSING_SUCCESS"; url: string; sessionToken: string }
  | { type: "PROCESSING_FAILURE"; error: string; sessionToken: string }
  | { type: "RETRY" }
  | { type: "RESET" }
  | { type: "SET_SIZE"; size: FrameSizeOption }

export const initialPreviewState: PreviewState = {
  status: "idle",
  sessionToken: null,
  temporaryUrl: null,
  finalUrl: null,
  selectedFile: null,
  selectedSize: getFrameSizeOption(DEFAULT_FRAME_SIZE_ID),
  error: null,
}

export function previewReducer(
  state: PreviewState,
  event: PreviewEvent,
): PreviewState {
  switch (event.type) {
    case "SELECT_IMAGE":
      return {
        ...state,
        status: "image-selected",
        selectedFile: event.file,
        sessionToken: event.sessionToken,
        temporaryUrl: null,
        finalUrl: null,
        error: null,
      }

    case "TEMP_PREVIEW_READY":
      if (state.sessionToken !== event.sessionToken) return state
      return {
        ...state,
        status: "temporary-preview-ready",
        temporaryUrl: event.url,
      }

    case "START_PROCESSING":
      if (state.sessionToken !== event.sessionToken) return state
      return {
        ...state,
        status: "processing",
        finalUrl: null,
      }

    case "PROCESSING_SUCCESS":
      if (state.sessionToken !== event.sessionToken) return state
      return {
        ...state,
        status: "final-preview-ready",
        finalUrl: event.url,
        error: null,
      }

    case "PROCESSING_FAILURE": {
      if (state.sessionToken !== event.sessionToken) return state
      return {
        ...state,
        status: "error",
        error: event.error,
      }
    }

    case "RETRY": {
      return {
        ...state,
        status: "processing",
        error: null,
      }
    }

    case "RESET":
      return {
        ...initialPreviewState,
        temporaryUrl: null,
        finalUrl: null,
      }

    case "SET_SIZE":
      return {
        ...state,
        selectedSize: event.size,
      }

    default:
      return state
  }
}

// Display model for the 3D scene
export interface SceneDisplayModel {
  imageSrc: string | null
  previewKind: "none" | "temporary" | "final"
  selectedSize: FrameSizeOption | null
  isProcessing: boolean
}

export function deriveSceneModel(state: PreviewState): SceneDisplayModel {
  return {
    imageSrc: state.finalUrl,
    previewKind:
      state.finalUrl !== null
        ? "final"
        : state.temporaryUrl !== null
          ? "temporary"
          : "none",
    selectedSize: state.selectedSize,
    isProcessing: state.status === "processing",
  }
}

// Guided control visibility model (ADR-05)
export interface GuidedControlModel {
  showUpload: boolean
  showProgress: boolean
  showSizeSelector: boolean
  showBuyCta: boolean
  showError: boolean
  showReplace: boolean
  helperText: string
}

export function deriveGuidedModel(state: PreviewState): GuidedControlModel {
  switch (state.status) {
    case "idle":
      return {
        showUpload: true,
        showProgress: false,
        showSizeSelector: false,
        showBuyCta: false,
        showError: false,
        showReplace: false,
        helperText: "Upload a photo to begin",
      }
    case "image-selected":
      return {
        showUpload: false,
        showProgress: true,
        showSizeSelector: false,
        showBuyCta: false,
        showError: false,
        showReplace: false,
        helperText: "Preparing preview…",
      }
    case "temporary-preview-ready":
      return {
        showUpload: false,
        showProgress: true,
        showSizeSelector: false,
        showBuyCta: false,
        showError: false,
        showReplace: false,
        helperText: "Generating your preview…",
      }
    case "processing":
      return {
        showUpload: false,
        showProgress: true,
        showSizeSelector: false,
        showBuyCta: false,
        showError: false,
        showReplace: true,
        helperText: "Transforming your image…",
      }
    case "final-preview-ready":
      return {
        showUpload: false,
        showProgress: false,
        showSizeSelector: true,
        showBuyCta: true,
        showError: false,
        showReplace: true,
        helperText: "Your preview is ready",
      }
    case "error":
      return {
        showUpload: false,
        showProgress: false,
        showSizeSelector: false,
        showBuyCta: false,
        showError: true,
        showReplace: true,
        helperText: state.error ?? "Something went wrong",
      }
    default:
      return deriveGuidedModel({ status: "idle" } as PreviewState)
  }
}
