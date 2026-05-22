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

export type DotPreviewStatus = "idle" | "processing" | "ready" | "error"

/** A single preview option variant (DOT uses 'variant' key) */
export interface PreviewOptionChoice {
  previewOptionId: string
  label: string
  description: string | null
  imageUrl: string
  mockupUrl: string | null
  orderable: boolean
}

export interface DotPreviewResult {
  sizeId: string
  status: DotPreviewStatus
  previewId: string | null
  /** Fallback main image URL (from response top-level) */
  imageUrl: string | null
  productCode: "DOT"
  orderable: boolean | null
  error: string | null
  /** All preview option variants for this size */
  options: PreviewOptionChoice[]
  /** ID of the currently selected option, or null */
  selectedOptionId: string | null
}

export interface PreviewState {
  status: PreviewStatus
  sessionToken: string | null
  temporaryUrl: string | null
  finalUrl: string | null
  selectedFile: File | null
  selectedSize: FrameSizeOption | null
  dotPreviews: Record<string, DotPreviewResult>
  error: string | null
}

export type PreviewEvent =
  | { type: "SELECT_IMAGE"; file: File; sessionToken: string }
  | { type: "TEMP_PREVIEW_READY"; url: string; sessionToken: string }
  | { type: "START_PROCESSING"; sessionToken: string; sizeId?: string }
  | { type: "PROCESSING_SUCCESS"; url: string; sessionToken: string; sizeId?: string; previewId?: string | null; status?: string; orderable?: boolean | null; options?: PreviewOptionChoice[] }
  | { type: "PROCESSING_FAILURE"; error: string; sessionToken: string; sizeId?: string }
  | { type: "RETRY" }
  | { type: "RESET" }
  | { type: "SET_SIZE"; size: FrameSizeOption }
  | { type: "SET_PREVIEW_OPTION"; sizeId: string; optionId: string }

export const initialPreviewState: PreviewState = {
  status: "idle",
  sessionToken: null,
  temporaryUrl: null,
  finalUrl: null,
  selectedFile: null,
  selectedSize: getFrameSizeOption(DEFAULT_FRAME_SIZE_ID),
  dotPreviews: {},
  error: null,
}

function createProcessingDotPreview(sizeId: string): DotPreviewResult {
  return {
    sizeId,
    status: "processing",
    previewId: null,
    imageUrl: null,
    productCode: "DOT",
    orderable: null,
    error: null,
    options: [],
    selectedOptionId: null,
  }
}

function pickDefaultSelectedOption(options: PreviewOptionChoice[]): string | null {
  // Prefer first orderable option with a valid image
  const firstOrderable = options.find((o) => o.orderable && o.imageUrl)
  if (firstOrderable) return firstOrderable.previewOptionId
  // Fallback: first option with an image
  const firstImage = options.find((o) => o.imageUrl)
  if (firstImage) return firstImage.previewOptionId
  return null
}

function getSelectedDotPreview(state: PreviewState): DotPreviewResult | null {
  const sizeId = state.selectedSize?.id
  return sizeId ? state.dotPreviews[sizeId] ?? null : null
}

/** Resolve the active image URL: selected option URL > preview's own imageUrl > fallback */
function resolveActiveUrl(dot: DotPreviewResult): string | null {
  if (!dot.selectedOptionId || dot.status !== 'ready') return null
  const opt = dot.options.find((o) => o.previewOptionId === dot.selectedOptionId)
  if (opt && opt.imageUrl) return opt.imageUrl
  return dot.imageUrl
}

function deriveStatusForSelectedSize(state: PreviewState): PreviewStatus {
  const selectedPreview = getSelectedDotPreview(state)

  if (!state.selectedFile) return "idle"
  if (selectedPreview?.status === "ready") return "final-preview-ready"
  if (selectedPreview?.status === "error") return "error"
  if (selectedPreview?.status === "processing") return "processing"
  if (state.temporaryUrl) return "temporary-preview-ready"
  return "image-selected"
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
        dotPreviews: {},
        error: null,
      }

    case "TEMP_PREVIEW_READY":
      if (state.sessionToken !== event.sessionToken) return state
      return {
        ...state,
        status: state.status === "processing" ? "processing" : "temporary-preview-ready",
        temporaryUrl: event.url,
      }

    case "START_PROCESSING": {
      if (state.sessionToken !== event.sessionToken) return state
      const sizeId = event.sizeId ?? state.selectedSize?.id
      return {
        ...state,
        status: "processing",
        dotPreviews: sizeId
          ? {
              ...state.dotPreviews,
              [sizeId]: createProcessingDotPreview(sizeId),
            }
          : state.dotPreviews,
        error: null,
      }
    }

    case "PROCESSING_SUCCESS": {
      if (state.sessionToken !== event.sessionToken) return state
      const sizeId = event.sizeId ?? state.selectedSize?.id
      const options = event.options ?? []
      const selectedOptionId = pickDefaultSelectedOption(options)
      const selectedOptionUrl = selectedOptionId
        ? options.find((o) => o.previewOptionId === selectedOptionId)?.imageUrl ?? null
        : null
      const finalUrl = sizeId === state.selectedSize?.id
        ? (selectedOptionUrl ?? event.url)
        : state.finalUrl

      const nextState: PreviewState = {
        ...state,
        finalUrl,
        dotPreviews: sizeId
          ? {
              ...state.dotPreviews,
              [sizeId]: {
                sizeId,
                status: "ready",
                previewId: event.previewId ?? null,
                imageUrl: event.url,
                productCode: "DOT",
                orderable: event.orderable ?? null,
                error: null,
                options,
                selectedOptionId,
              },
            }
          : state.dotPreviews,
        error: null,
      }
      return {
        ...nextState,
        status: deriveStatusForSelectedSize(nextState),
      }
    }

    case "PROCESSING_FAILURE": {
      if (state.sessionToken !== event.sessionToken) return state
      const sizeId = event.sizeId ?? state.selectedSize?.id
      const nextState: PreviewState = {
        ...state,
        dotPreviews: sizeId
          ? {
              ...state.dotPreviews,
              [sizeId]: {
                sizeId,
                status: "error",
                previewId: null,
                imageUrl: null,
                productCode: "DOT",
                orderable: null,
                error: event.error,
                options: [],
                selectedOptionId: null,
              },
            }
          : state.dotPreviews,
        error: event.error,
      }
      return {
        ...nextState,
        status: deriveStatusForSelectedSize(nextState),
      }
    }

    case "RETRY": {
      const selectedSizeId = state.selectedSize?.id
      return {
        ...state,
        status: "processing",
        error: null,
        dotPreviews: selectedSizeId
          ? {
              ...state.dotPreviews,
              [selectedSizeId]: createProcessingDotPreview(selectedSizeId),
            }
          : state.dotPreviews,
      }
    }

    case "RESET":
      return {
        ...initialPreviewState,
        temporaryUrl: null,
        finalUrl: null,
        dotPreviews: {},
      }

    case "SET_SIZE": {
      const dp = state.dotPreviews[event.size.id]
      const resolvedUrl = dp?.status === 'ready' ? resolveActiveUrl(dp) ?? dp.imageUrl ?? null : null
      const nextState = {
        ...state,
        selectedSize: event.size,
        finalUrl: resolvedUrl,
      }
      return {
        ...nextState,
        status: deriveStatusForSelectedSize(nextState),
      }
    }

    case "SET_PREVIEW_OPTION": {
      const dp = state.dotPreviews[event.sizeId]
      if (!dp || dp.status !== 'ready') return state
      const opt = dp.options.find((o) => o.previewOptionId === event.optionId)
      if (!opt) return state
      const isActiveSize = event.sizeId === state.selectedSize?.id
      const nextState = {
        ...state,
        finalUrl: isActiveSize ? opt.imageUrl : state.finalUrl,
        dotPreviews: {
          ...state.dotPreviews,
          [event.sizeId]: {
            ...dp,
            selectedOptionId: event.optionId,
          },
        },
      }
      return {
        ...nextState,
        status: deriveStatusForSelectedSize(nextState),
      }
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
  productCode: "DOT" | null
}

export function deriveSceneModel(state: PreviewState): SceneDisplayModel {
  const selectedPreview = getSelectedDotPreview(state)
  const activeUrl = selectedPreview?.status === "ready" ? resolveActiveUrl(selectedPreview) : null
  const fallbackUrl = activeUrl ?? (selectedPreview?.status === "ready" ? selectedPreview.imageUrl : null)
  const imageSrc = fallbackUrl ?? state.temporaryUrl ?? state.finalUrl

  return {
    imageSrc,
    previewKind:
      activeUrl !== null || (selectedPreview?.status === "ready" && selectedPreview.imageUrl !== null)
        ? "final"
        : state.temporaryUrl !== null
          ? "temporary"
          : "none",
    selectedSize: state.selectedSize,
    isProcessing: selectedPreview?.status === "processing" || state.status === "processing",
    productCode: selectedPreview?.status === "ready" || selectedPreview?.status === "processing" ? "DOT" : null,
  }
}

// Guided control visibility model (ADR-05)
export interface GuidedControlModel {
  showUpload: boolean
  showProgress: boolean
  showSizeSelector: boolean
  showPreviewOptions: boolean
  showBuyCta: boolean
  showError: boolean
  showReplace: boolean
  helperText: string
  productDetail: string | null
}

function productDetailFor(state: PreviewState): string | null {
  const selectedSize = state.selectedSize
  const selectedPreview = getSelectedDotPreview(state)
  if (!selectedSize || !selectedPreview) return null
  return `Product: DOT · Size: ${selectedSize.label}`
}

export function deriveGuidedModel(state: PreviewState): GuidedControlModel {
  const selectedSize = state.selectedSize
  const selectedPreview = getSelectedDotPreview(state)
  const productDetail = productDetailFor(state)

  switch (state.status) {
    case "idle":
      return {
        showUpload: true,
        showProgress: false,
        showSizeSelector: false,
        showPreviewOptions: false,
        showBuyCta: false,
        showError: false,
        showReplace: false,
        helperText: "Upload a photo to begin",
        productDetail: null,
      }
    case "image-selected":
      return {
        showUpload: false,
        showProgress: true,
        showSizeSelector: false,
        showPreviewOptions: false,
        showBuyCta: false,
        showError: false,
        showReplace: false,
        helperText: "Preparing preview…",
        productDetail,
      }
    case "temporary-preview-ready":
      return {
        showUpload: false,
        showProgress: true,
        showSizeSelector: true,
        showPreviewOptions: false,
        showBuyCta: false,
        showError: false,
        showReplace: true,
        helperText: `Generating DOT preview${selectedSize ? ` for ${selectedSize.label}` : ''}…`,
        productDetail,
      }
    case "processing":
      return {
        showUpload: false,
        showProgress: true,
        showSizeSelector: true,
        showPreviewOptions: false,
        showBuyCta: false,
        showError: false,
        showReplace: true,
        helperText: `Generating DOT preview${selectedSize ? ` for ${selectedSize.label}` : ''}…`,
        productDetail,
      }
    case "final-preview-ready":
      return {
        showUpload: false,
        showProgress: false,
        showSizeSelector: true,
        showPreviewOptions: (selectedPreview?.options.length ?? 0) > 1,
        showBuyCta: true,
        showError: false,
        showReplace: true,
        helperText: selectedPreview?.status === "ready" ? "DOT preview ready" : "Your preview is ready",
        productDetail,
      }
    case "error":
      return {
        showUpload: false,
        showProgress: false,
        showSizeSelector: true,
        showPreviewOptions: false,
        showBuyCta: false,
        showError: true,
        showReplace: true,
        helperText: selectedPreview?.error ?? state.error ?? "Something went wrong",
        productDetail,
      }
    default:
      return deriveGuidedModel({ status: "idle" } as PreviewState)
  }
}
