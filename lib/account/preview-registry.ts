import type { DotPreviewResult, FrameSizeOption } from "@/components/single-screen-preview/preview-state"

const PREVIEW_REGISTRY_STORAGE_KEY = "dottingo_preview_registry_v1"
const MAX_ACCOUNT_PREVIEWS = 12

export type AccountPreviewRecord = {
  email: string
  previewId: string
  sizeId: string
  sizeLabel: string | null
  imageUrl: string | null
  sourceImageUrl?: string | null
  sourceGroupId?: string | null
  selectedPreviewOptionId: string | null
  orderable: boolean | null
  updatedAt: number
  hidden?: boolean
}

type PreviewRegistry = Record<string, AccountPreviewRecord[]>

export function normalizeRegistryEmail(email: string): string {
  return email.trim().toLowerCase()
}

function readPreviewRegistry(): PreviewRegistry {
  if (typeof window === "undefined") return {}

  const raw = window.localStorage.getItem(PREVIEW_REGISTRY_STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as PreviewRegistry
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    window.localStorage.removeItem(PREVIEW_REGISTRY_STORAGE_KEY)
    return {}
  }
}

function writePreviewRegistry(registry: PreviewRegistry) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PREVIEW_REGISTRY_STORAGE_KEY, JSON.stringify(registry))
}

function resolvePreviewImage(preview: DotPreviewResult): string | null {
  const selectedOption = preview.selectedOptionId
    ? preview.options.find((option) => option.previewOptionId === preview.selectedOptionId)
    : null
  return selectedOption?.imageUrl ?? preview.imageUrl ?? null
}

export function upsertAccountPreview(
  email: string,
  preview: DotPreviewResult,
  selectedSize?: Pick<FrameSizeOption, "id" | "label"> | null,
): AccountPreviewRecord | null {
  const normalizedEmail = normalizeRegistryEmail(email)
  if (!normalizedEmail || !preview.previewId || preview.status !== "ready") return null

  const registry = readPreviewRegistry()
  const existingRecords = registry[normalizedEmail] ?? []
  const existing = existingRecords.find((record) => record.previewId === preview.previewId)
  const record: AccountPreviewRecord = {
    email: normalizedEmail,
    previewId: preview.previewId,
    sizeId: preview.sizeId || selectedSize?.id || "unknown",
    sizeLabel: selectedSize?.label ?? preview.sizeId ?? null,
    imageUrl: resolvePreviewImage(preview),
    sourceImageUrl: preview.sourceImageUrl ?? null,
    sourceGroupId: preview.sourceImageUrl ?? null,
    selectedPreviewOptionId: preview.selectedOptionId,
    orderable: preview.orderable,
    updatedAt: Date.now(),
    hidden: existing?.hidden ?? false,
  }

  registry[normalizedEmail] = [
    record,
    ...existingRecords.filter((item) => item.previewId !== preview.previewId),
  ].slice(0, MAX_ACCOUNT_PREVIEWS)

  writePreviewRegistry(registry)
  return record
}

export function readAccountPreviews(email?: string | null): AccountPreviewRecord[] {
  const normalizedEmail = email ? normalizeRegistryEmail(email) : ""
  if (!normalizedEmail) return []

  return (readPreviewRegistry()[normalizedEmail] ?? [])
    .filter((record) => !record.hidden)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function isAccountPreviewSaved(email: string | null | undefined, previewId: string | null | undefined): boolean {
  const normalizedEmail = email ? normalizeRegistryEmail(email) : ""
  if (!normalizedEmail || !previewId) return false

  return (readPreviewRegistry()[normalizedEmail] ?? []).some((record) => record.previewId === previewId && !record.hidden)
}

export function hideAccountPreview(email: string, previewId: string): boolean {
  const normalizedEmail = normalizeRegistryEmail(email)
  if (!normalizedEmail || !previewId) return false

  const registry = readPreviewRegistry()
  const records = registry[normalizedEmail] ?? []
  let changed = false

  registry[normalizedEmail] = records.map((record) => {
    if (record.previewId !== previewId) return record
    changed = true
    return { ...record, hidden: true, updatedAt: Date.now() }
  })

  if (changed) writePreviewRegistry(registry)
  return changed
}

export function buildPreviewOpenPath(previewId: string, sizeId?: string | null): string {
  const params = new URLSearchParams({ preview_id: previewId })
  if (sizeId) params.set("size_id", sizeId)
  return `/?${params.toString()}`
}
