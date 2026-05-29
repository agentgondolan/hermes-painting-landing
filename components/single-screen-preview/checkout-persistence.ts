"use client"

import type { DotPreviewResult, FrameSizeOption, PreviewState } from "./preview-state"

const STORAGE_VERSION = 1
const CHECKOUT_STATE_KEY = "dottingo.checkout.restore.v1"
const CHECKOUT_TTL_MS = 1000 * 60 * 60 * 24

type StoredPreview = Pick<PreviewState, "selectedSize" | "dotPreviews" | "finalUrl">

export type StoredCheckoutState = {
  version: number
  updatedAt: number
  preview: StoredPreview
  selectedPurchaseOptionId?: string | null
  orderDraftId?: string | null
  checkoutInProgress?: boolean
}

export function restoreStoredPreviewState(): StoredPreview | null {
  return readStoredCheckoutState()?.preview ?? null
}

export function readStoredCheckoutState(): StoredCheckoutState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CHECKOUT_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCheckoutState
    if (parsed.version !== STORAGE_VERSION) return null
    if (!parsed.updatedAt || Date.now() - parsed.updatedAt > CHECKOUT_TTL_MS) {
      clearStoredCheckoutState()
      return null
    }
    if (!isRestorablePreview(parsed.preview)) return null
    return parsed
  } catch {
    return null
  }
}

export function persistPreviewState(state: PreviewState): void {
  if (typeof window === "undefined") return
  if (state.status !== "final-preview-ready") return
  const preview = toStoredPreview(state)
  if (!preview) return

  const current = readStoredCheckoutState()
  writeStoredCheckoutState({
    ...current,
    version: STORAGE_VERSION,
    updatedAt: Date.now(),
    preview,
  })
}

export function persistCheckoutSelection(values: {
  selectedPurchaseOptionId?: string | null
  orderDraftId?: string | null
  checkoutInProgress?: boolean
}): void {
  const current = readStoredCheckoutState()
  if (!current) return
  writeStoredCheckoutState({
    ...current,
    ...values,
    version: STORAGE_VERSION,
    updatedAt: Date.now(),
  })
}

export function clearStoredCheckoutState(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CHECKOUT_STATE_KEY)
  } catch {
    // ignore storage failures
  }
}

function writeStoredCheckoutState(state: StoredCheckoutState): void {
  try {
    window.localStorage.setItem(CHECKOUT_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore storage failures
  }
}

function toStoredPreview(state: PreviewState): StoredPreview | null {
  if (!state.selectedSize) return null
  const safeDotPreviews = Object.fromEntries(
    Object.entries(state.dotPreviews)
      .map(([sizeId, preview]) => [sizeId, toStoredDotPreview(preview)] as const)
      .filter(([, preview]) => Boolean(preview)),
  ) as Record<string, DotPreviewResult>

  if (!Object.keys(safeDotPreviews).length) return null
  return {
    selectedSize: state.selectedSize,
    finalUrl: state.finalUrl,
    dotPreviews: safeDotPreviews,
  }
}

function toStoredDotPreview(preview: DotPreviewResult): DotPreviewResult | null {
  if (preview.status !== "ready") return null
  if (!preview.previewId || !preview.selectedOptionId) return null
  const safeOptions = preview.options.filter((option) => option.previewOptionId && option.imageUrl)
  if (!safeOptions.length) return null
  return {
    ...preview,
    options: safeOptions,
    error: null,
  }
}

function isRestorablePreview(preview: StoredPreview | undefined): preview is StoredPreview {
  if (!preview?.selectedSize || !isFrameSize(preview.selectedSize)) return false
  const selectedPreview = preview.dotPreviews?.[preview.selectedSize.id]
  return Boolean(
    selectedPreview?.status === "ready" &&
    selectedPreview.previewId &&
    selectedPreview.selectedOptionId &&
    selectedPreview.options?.some((option) => option.previewOptionId === selectedPreview.selectedOptionId && option.imageUrl),
  )
}

function isFrameSize(value: unknown): value is FrameSizeOption {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string",
  )
}
