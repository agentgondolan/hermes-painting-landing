"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"
import { CropModal } from "./crop-modal"
import { PreviewOptionOverlay } from "./preview-option-overlay"
import { PurchasePanel } from "./purchase-panel"
import { AccountPanel } from "@/components/account/account-panel"
import { AdCreativeExperimentTracker } from "@/components/ad-creative-experiment-tracker"
import { captureEvent } from "@/lib/analytics/posthog"
import {
  attachVerifiedIdentityPreview,
  consumeMagicTokenFromUrl,
  consumeVerifiedIdentityNoticeFromUrl,
  createVerifiedIdentityProjectPreview,
  clearVerifiedIdentity,
  deleteVerifiedIdentityPreview,
  fetchVerifiedIdentityPreviews,
  readVerifiedIdentity,
  VERIFIED_IDENTITY_CHANGED_EVENT,
  type IdentityPreviewLibrary,
  type IdentityPreviewProject,
  type IdentityPreviewRow,
  type StoredIdentity,
} from "@/lib/identity/browser"
import { isAccountPreviewSaved, upsertAccountPreview } from "@/lib/account/preview-registry"
import { createPreviewClient, type BffPreviewCreateResult } from "@/lib/mgeveryday/browser-preview"
import type { CropDetails, FrameOrientation, FrameSizeOption } from "@/lib/image-processing"
import type { RestorablePreviewResult } from "./use-preview-flow"

type MagicLinkNotice = {
  kind: "success" | "error"
  message: string
} | null

const EMPTY_IDENTITY_LIBRARY: IdentityPreviewLibrary = { previews: [], projects: [] }

const SOURCE_THUMBNAIL_MAX_SIZE = 360
const SOURCE_THUMBNAIL_QUALITY = 0.82
const GENERATED_PREVIEW_IMAGE_WAIT_MS = 120_000
const GENERATED_PREVIEW_IMAGE_INTERVAL_MS = 2_000

async function createSourceThumbnailDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Could not load source image thumbnail"))
      img.src = objectUrl
    })

    const scale = Math.min(1, SOURCE_THUMBNAIL_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return null

    context.fillStyle = "#fff"
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL("image/jpeg", SOURCE_THUMBNAIL_QUALITY)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function identityPreviewRowToPreviewResult(row: IdentityPreviewRow, project?: IdentityPreviewProject | null): RestorablePreviewResult {
  return {
    previewId: row.previewId,
    status: row.status ?? "READY",
    imageUrl: row.imageUrl ?? row.options.find((option) => option.imageUrl)?.imageUrl ?? null,
    sourceImageUrl: project?.sourceImageUrl ?? row.sourceImageUrl ?? null,
    sourceGroupId: project?.sourceGroupId ?? row.sourceGroupId ?? null,
    orientation: row.orientation ?? null,
    options: row.options.map((option) => ({
      previewOptionId: option.previewOptionId,
      label: option.label,
      description: option.description,
      orderable: option.orderable,
      imageUrl: option.imageUrl,
      mockupUrl: option.mockupUrl,
    })),
  }
}

function previewResultImageUrl(result: Pick<RestorablePreviewResult, "imageUrl" | "options">): string | null {
  return result.imageUrl ?? result.options.find((option) => option.imageUrl)?.imageUrl ?? null
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeSizeId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x") ?? ""
  return normalized || null
}

async function waitForGeneratedPreviewImage(previewId: string): Promise<BffPreviewCreateResult | null> {
  const previewClient = createPreviewClient()
  if (!previewClient) return null

  const started = Date.now()
  let latest = await previewClient.getPreview(previewId)
  while (Date.now() - started <= GENERATED_PREVIEW_IMAGE_WAIT_MS) {
    const imageUrl = previewResultImageUrl(latest)
    if (imageUrl) {
      return {
        ...latest,
        imageUrl,
      }
    }

    await wait(GENERATED_PREVIEW_IMAGE_INTERVAL_MS)
    latest = await previewClient.getPreview(previewId)
  }

  const imageUrl = previewResultImageUrl(latest)
  return imageUrl
    ? {
        ...latest,
        imageUrl,
      }
    : latest as BffPreviewCreateResult
}

async function waitForGeneratedPreviewResult(
  identity: StoredIdentity,
  generated: IdentityPreviewRow,
  sourceGroupId: string,
  sizeId: string,
): Promise<{ previewResult: RestorablePreviewResult; library: IdentityPreviewLibrary | null } | null> {
  const previewClient = generated.previewId ? createPreviewClient() : null
  const started = Date.now()
  let latestIdentityMatch: { library: IdentityPreviewLibrary; project: IdentityPreviewProject | null; preview: IdentityPreviewRow } | null = null
  let latestPreviewResult: BffPreviewCreateResult | null = null

  while (Date.now() - started <= GENERATED_PREVIEW_IMAGE_WAIT_MS) {
    const [identityOutcome, previewOutcome] = await Promise.allSettled([
      fetchVerifiedIdentityPreviews(identity),
      previewClient && generated.previewId ? previewClient.getPreview(generated.previewId) : Promise.resolve(null),
    ])

    if (identityOutcome.status === "fulfilled") {
      const library = identityOutcome.value
      const project = findIdentityProjectBySourceGroup(library, sourceGroupId)
      const preview = findProjectPreviewForSize(project, generated.previewId, sizeId)
      if (preview) {
        latestIdentityMatch = { library, project, preview }
        const previewResult = identityPreviewRowToPreviewResult(preview, project)
        if (previewResultImageUrl(previewResult)) {
          return { previewResult, library }
        }
      }
    }

    if (previewOutcome.status === "fulfilled" && previewOutcome.value) {
      latestPreviewResult = previewOutcome.value
      const imageUrl = previewResultImageUrl(latestPreviewResult)
      if (imageUrl) {
        return {
          previewResult: {
            ...latestPreviewResult,
            imageUrl,
          },
          library: identityOutcome.status === "fulfilled" ? identityOutcome.value : null,
        }
      }
    }

    await wait(GENERATED_PREVIEW_IMAGE_INTERVAL_MS)
  }

  if (latestIdentityMatch) {
    const previewResult = identityPreviewRowToPreviewResult(latestIdentityMatch.preview, latestIdentityMatch.project)
    if (previewResultImageUrl(previewResult)) {
      return { previewResult, library: latestIdentityMatch.library }
    }
  }

  if (latestPreviewResult) {
    const imageUrl = previewResultImageUrl(latestPreviewResult)
    if (imageUrl) {
      return {
        previewResult: {
          ...latestPreviewResult,
          imageUrl,
        },
        library: null,
      }
    }
  }

  return null
}

function findIdentityProjectForPreview(library: IdentityPreviewLibrary, previewId: string | null | undefined): IdentityPreviewProject | null {
  if (!previewId) return null
  return library.projects.find((project) => project.previews.some((preview) => preview.previewId === previewId)) ?? null
}

function findIdentityProjectBySourceGroup(library: IdentityPreviewLibrary, sourceGroupId: string): IdentityPreviewProject | null {
  return library.projects.find((project) => project.sourceGroupId === sourceGroupId) ?? null
}

function sameSize(value: string | null | undefined, sizeId: string): boolean {
  return String(value ?? "").trim().toLowerCase() === sizeId.toLowerCase()
}

function findProjectPreviewForSize(
  project: IdentityPreviewProject | null,
  previewId: string | null | undefined,
  sizeId: string,
): IdentityPreviewRow | null {
  if (!project) return null
  return project.previews.find((preview) => preview.previewId === previewId)
    ?? project.previews.find((preview) => sameSize(preview.selectedSize ?? preview.preferredSize, sizeId))
    ?? null
}

async function waitForGeneratedIdentityPreview(
  identity: StoredIdentity,
  generated: IdentityPreviewRow,
  sourceGroupId: string,
  sizeId: string,
): Promise<{ library: IdentityPreviewLibrary; project: IdentityPreviewProject | null; preview: IdentityPreviewRow } | null> {
  const started = Date.now()
  let latestMatch: { library: IdentityPreviewLibrary; project: IdentityPreviewProject | null; preview: IdentityPreviewRow } | null = null

  while (Date.now() - started <= GENERATED_PREVIEW_IMAGE_WAIT_MS) {
    const library = await fetchVerifiedIdentityPreviews(identity)
    const project = findIdentityProjectBySourceGroup(library, sourceGroupId)
    const preview = findProjectPreviewForSize(project, generated.previewId, sizeId)

    if (preview) {
      latestMatch = { library, project, preview }
      const previewResult = identityPreviewRowToPreviewResult(preview, project)
      if (previewResultImageUrl(previewResult)) {
        return latestMatch
      }
    }

    await wait(GENERATED_PREVIEW_IMAGE_INTERVAL_MS)
  }

  if (!latestMatch) return null
  const latestResult = identityPreviewRowToPreviewResult(latestMatch.preview, latestMatch.project)
  return previewResultImageUrl(latestResult) ? latestMatch : null
}

async function generatedIdentityPreviewToPreviewResult(
  identity: StoredIdentity,
  generated: IdentityPreviewRow,
  project: IdentityPreviewProject | null,
  sourceGroupId: string,
  sizeId: string,
  orientationHint: RestorablePreviewResult["orientation"] = null,
): Promise<{ previewResult: RestorablePreviewResult; library: IdentityPreviewLibrary | null }> {
  const generatedResult = await waitForGeneratedPreviewResult(identity, generated, sourceGroupId, sizeId)
  if (generatedResult) {
    const sourcePreview = generatedResult.previewResult
    return {
      previewResult: {
        ...sourcePreview,
        sourceImageUrl: sourcePreview.sourceImageUrl ?? generated.sourceImageUrl ?? project?.sourceImageUrl ?? null,
        sourceGroupId: sourcePreview.sourceGroupId ?? generated.sourceGroupId ?? project?.sourceGroupId ?? sourceGroupId,
        orientation: sourcePreview.orientation ?? generated.orientation ?? orientationHint ?? null,
      },
      library: generatedResult.library,
    }
  }

  const completed = generated.previewId
    ? await waitForGeneratedPreviewImage(generated.previewId)
    : null
  const fallback = identityPreviewRowToPreviewResult(generated, project)

  return {
    previewResult: {
      previewId: completed?.previewId ?? fallback.previewId,
      status: completed?.status ?? fallback.status,
      imageUrl: previewResultImageUrl(completed ?? fallback),
      sourceImageUrl: generated.sourceImageUrl ?? project?.sourceImageUrl ?? completed?.sourceImageUrl ?? fallback.sourceImageUrl ?? null,
      sourceGroupId: generated.sourceGroupId ?? project?.sourceGroupId ?? completed?.sourceGroupId ?? fallback.sourceGroupId ?? sourceGroupId,
      orientation: generated.orientation ?? completed?.orientation ?? fallback.orientation ?? orientationHint ?? null,
      options: completed?.options?.length ? completed.options : fallback.options,
    },
    library: null,
  }
}

async function deleteOlderSameSizeIdentityPreviews(
  identity: StoredIdentity,
  library: IdentityPreviewLibrary,
  sourceGroupId: string | null | undefined,
  sizeId: string,
  currentPreviewId: string,
) {
  if (!identity.mgeIdentityToken || !sourceGroupId) return

  const project = library.projects.find((item) => item.sourceGroupId === sourceGroupId)
  const oldPreviews = project?.previews.filter((preview) => {
    if (preview.previewId === currentPreviewId) return false
    return sameSize(preview.selectedSize ?? preview.preferredSize, sizeId)
  }) ?? []

  await Promise.all(oldPreviews.map((preview) => deleteVerifiedIdentityPreview(identity, preview.previewId)))
}

function identityProjectCropParams(crop: CropDetails) {
  return {
    sourceWidth: crop.sourceWidth,
    source_width: crop.sourceWidth,
    sourceHeight: crop.sourceHeight,
    source_height: crop.sourceHeight,
    cropWidth: crop.cropWidth,
    crop_width: crop.cropWidth,
    cropHeight: crop.cropHeight,
    crop_height: crop.cropHeight,
    offsetX: crop.offsetX,
    offset_x: crop.offsetX,
    offsetY: crop.offsetY,
    offset_y: crop.offsetY,
    zoom: crop.zoom ?? null,
    normalized: crop.normalized,
  }
}

export function SingleScreenPreviewShell() {
  const { state, sceneModel, guidedModel, actions } = usePreviewFlow()
  const { hydrateSourceImage } = actions
  const [magicLinkNotice, setMagicLinkNotice] = useState<MagicLinkNotice>(null)
  const [magicLinkIdentity, setMagicLinkIdentity] = useState<StoredIdentity | null>(null)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [saveEmailFlowNonce, setSaveEmailFlowNonce] = useState(0)
  const [currentPreviewSaved, setCurrentPreviewSaved] = useState(false)
  const [localSourceThumbnailUrl, setLocalSourceThumbnailUrl] = useState<string | null>(null)
  const [identityPreviewLibrary, setIdentityPreviewLibrary] = useState<IdentityPreviewLibrary>(EMPTY_IDENTITY_LIBRARY)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const selectedPreview = state.selectedSize ? state.dotPreviews[state.selectedSize.id] : null
  const activeIdentityProject = findIdentityProjectForPreview(identityPreviewLibrary, selectedPreview?.previewId)
  const readySizeIds = Object.values(state.dotPreviews)
    .filter((preview) => preview.status === "ready")
    .map((preview) => preview.sizeId)

  const syncVerifiedIdentity = useCallback(() => {
    const storedIdentity = readVerifiedIdentity()
    setMagicLinkIdentity(storedIdentity)
    if (!storedIdentity) setIdentityPreviewLibrary(EMPTY_IDENTITY_LIBRARY)
  }, [])

  const handleLogout = useCallback(() => {
    clearVerifiedIdentity()
    setMagicLinkIdentity(null)
    setIdentityPreviewLibrary(EMPTY_IDENTITY_LIBRARY)
    setCurrentPreviewSaved(false)
    setAccountPanelOpen(false)
    setMagicLinkNotice(null)
  }, [])

  const handleSaveCurrentPreview = async () => {
    const currentPreviewId = selectedPreview?.previewId ?? null
    if (!magicLinkIdentity || !selectedPreview || selectedPreview.status !== "ready" || !state.selectedSize || !currentPreviewId) {
      setSaveEmailFlowNonce((nonce) => nonce + 1)
      setAccountPanelOpen(true)
      return
    }

    let attachedPreview: IdentityPreviewRow | null = null
    if (magicLinkIdentity.mgeIdentityToken) {
      attachedPreview = await attachVerifiedIdentityPreview(magicLinkIdentity, currentPreviewId)
      await deleteOlderSameSizeIdentityPreviews(
        magicLinkIdentity,
        identityPreviewLibrary,
        attachedPreview?.sourceGroupId ?? selectedPreview.sourceGroupId ?? activeIdentityProject?.sourceGroupId,
        state.selectedSize.id,
        currentPreviewId,
      )
    }

    const previewForRegistry = {
      ...selectedPreview,
      sourceImageUrl: attachedPreview?.sourceImageUrl ?? selectedPreview.sourceImageUrl ?? localSourceThumbnailUrl ?? null,
      sourceGroupId: attachedPreview?.sourceGroupId ?? selectedPreview.sourceGroupId ?? activeIdentityProject?.sourceGroupId ?? null,
    }
    const registered = upsertAccountPreview(magicLinkIdentity.email, previewForRegistry, state.selectedSize)
    const saved = Boolean(registered) || isAccountPreviewSaved(magicLinkIdentity.email, selectedPreview.previewId, state.selectedSize.id)
    setCurrentPreviewSaved(saved)
    if (!registered) return saved

    captureEvent("account_preview_registered", {
      preview_id: registered.previewId,
      selected_size: registered.sizeId,
      save_source: "bottom_save_button",
      attached_to_mge_identity: Boolean(magicLinkIdentity.mgeIdentityToken),
    })
    if (magicLinkIdentity.mgeIdentityToken) {
      fetchVerifiedIdentityPreviews(magicLinkIdentity).then(setIdentityPreviewLibrary, () => {})
    }
    return true
  }

  const handleDeletedCurrentPreview = useCallback(() => {
    actions.reset()
    setCurrentPreviewSaved(false)

    const url = new URL(window.location.href)
    url.searchParams.delete("preview_id")
    url.searchParams.delete("size_id")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)

    captureEvent("account_current_preview_deleted_reset", {
      preview_id: selectedPreview?.previewId ?? undefined,
      selected_size: state.selectedSize?.id,
    })
  }, [actions, selectedPreview?.previewId, state.selectedSize?.id])

  const handleSetSize = useCallback(async (size: FrameSizeOption) => {
    const cachedPreview = state.dotPreviews[size.id]
    if (cachedPreview?.status === "ready") {
      actions.setSize(size)
      return
    }

    let project = activeIdentityProject
    if (!project && magicLinkIdentity?.mgeIdentityToken && selectedPreview?.previewId) {
      const library = await fetchVerifiedIdentityPreviews(magicLinkIdentity)
      setIdentityPreviewLibrary(library)
      project = findIdentityProjectForPreview(library, selectedPreview.previewId)
    }

    const sourceGroupId = project?.sourceGroupId ?? selectedPreview?.sourceGroupId ?? null
    if (!magicLinkIdentity?.mgeIdentityToken || !sourceGroupId) {
      actions.setSize(size)
      return
    }

    actions.markSizeProcessing(size, {
      sourceImageUrl: project?.sourceImageUrl ?? selectedPreview?.sourceImageUrl ?? null,
      sourceGroupId,
      orientation: selectedPreview?.orientation ?? null,
      crop: selectedPreview?.crop ?? null,
    })
    try {
      const generated = await createVerifiedIdentityProjectPreview(magicLinkIdentity, sourceGroupId, size.id.toUpperCase())
      if (!generated) throw new Error("MGE did not return a generated preview")
      const generatedResult = await generatedIdentityPreviewToPreviewResult(
        magicLinkIdentity,
        generated,
        project,
        sourceGroupId,
        size.id,
        selectedPreview?.orientation ?? null,
      )

      const restored = actions.restorePreviewResult(
        generatedResult.previewResult,
        size,
        selectedPreview?.orientation ?? null,
      )
      if (!restored) throw new Error("Generated preview was not restorable")

      setCurrentPreviewSaved(true)
      const nextLibrary = generatedResult.library ?? await fetchVerifiedIdentityPreviews(magicLinkIdentity)
      setIdentityPreviewLibrary(nextLibrary)
      captureEvent("identity_project_size_variant_generated", {
        source_group_id: sourceGroupId,
        preview_id: generated.previewId,
        selected_size: size.id,
      })
    } catch (error) {
      actions.setSize(size)
      captureEvent("identity_project_size_variant_failed", {
        source_group_id: sourceGroupId,
        selected_size: size.id,
        error_message: error instanceof Error ? error.message : "Could not generate saved size variant",
      })
    }
  }, [
    actions,
    activeIdentityProject,
    magicLinkIdentity,
    selectedPreview?.crop,
    selectedPreview?.orientation,
    selectedPreview?.previewId,
    selectedPreview?.sourceGroupId,
    selectedPreview?.sourceImageUrl,
    state.dotPreviews,
  ])

  const handleApplyCrop = useCallback(async (orientation: FrameOrientation, crop: CropDetails) => {
    const size = state.selectedSize
    if (!size) return

    let project = activeIdentityProject
    if (!project && magicLinkIdentity?.mgeIdentityToken && selectedPreview?.previewId) {
      const library = await fetchVerifiedIdentityPreviews(magicLinkIdentity)
      setIdentityPreviewLibrary(library)
      project = findIdentityProjectForPreview(library, selectedPreview.previewId)
    }

    const sourceGroupId = project?.sourceGroupId ?? selectedPreview?.sourceGroupId ?? null
    if (!magicLinkIdentity?.mgeIdentityToken || !sourceGroupId) {
      actions.applyCrop(size.id, orientation, crop)
      return
    }

    actions.markSizeProcessing(size, {
      sourceImageUrl: project?.sourceImageUrl ?? selectedPreview?.sourceImageUrl ?? null,
      sourceGroupId,
      orientation,
      crop,
    })

    try {
      const generated = await createVerifiedIdentityProjectPreview(
        magicLinkIdentity,
        sourceGroupId,
        size.id.toUpperCase(),
        {
          orientation,
          crop: identityProjectCropParams(crop),
        },
      )
      if (!generated) throw new Error("MGE did not return a generated preview")

      const generatedResult = await generatedIdentityPreviewToPreviewResult(
        magicLinkIdentity,
        generated,
        project,
        sourceGroupId,
        size.id,
        orientation,
      )
      const restored = actions.restorePreviewResult(
        {
          ...generatedResult.previewResult,
          orientation,
          crop,
        },
        size,
        orientation,
      )
      if (!restored) throw new Error("Generated preview was not restorable")

      setCurrentPreviewSaved(true)
      const nextLibrary = generatedResult.library ?? await fetchVerifiedIdentityPreviews(magicLinkIdentity)
      setIdentityPreviewLibrary(nextLibrary)
      await deleteOlderSameSizeIdentityPreviews(
        magicLinkIdentity,
        nextLibrary,
        sourceGroupId,
        size.id,
        generated.previewId,
      )
      captureEvent("identity_project_crop_variant_generated", {
        source_group_id: sourceGroupId,
        preview_id: generated.previewId,
        selected_size: size.id,
        orientation,
      })
    } catch (error) {
      captureEvent("identity_project_crop_variant_failed", {
        source_group_id: sourceGroupId,
        selected_size: size.id,
        orientation,
        error_message: error instanceof Error ? error.message : "Could not generate saved crop variant",
      })
    }
  }, [
    actions,
    activeIdentityProject,
    magicLinkIdentity,
    selectedPreview?.previewId,
    selectedPreview?.sourceGroupId,
    selectedPreview?.sourceImageUrl,
    state.selectedSize,
  ])

  useEffect(() => {
    const restoredIdentity = consumeVerifiedIdentityNoticeFromUrl()
    if (restoredIdentity) {
      setMagicLinkIdentity(restoredIdentity)
      setMagicLinkNotice({
        kind: "success",
        message: `Verified ${restoredIdentity.email}. You can now save the current preview.`,
      })
    }

    const storedIdentity = restoredIdentity ?? readVerifiedIdentity()
    if (storedIdentity) {
      setMagicLinkIdentity(storedIdentity)
    } else {
      setIdentityPreviewLibrary(EMPTY_IDENTITY_LIBRARY)
    }

    consumeMagicTokenFromUrl().then(
      (identity) => {
        if (!identity) return
        setMagicLinkIdentity(identity)
      },
      (error) => {
        setMagicLinkNotice({
          kind: "error",
          message: error instanceof Error ? error.message : "Magic link verification failed",
        })
      },
    )

    window.addEventListener("storage", syncVerifiedIdentity)
    window.addEventListener("focus", syncVerifiedIdentity)
    window.addEventListener(VERIFIED_IDENTITY_CHANGED_EVENT, syncVerifiedIdentity)
    document.addEventListener("visibilitychange", syncVerifiedIdentity)

    return () => {
      window.removeEventListener("storage", syncVerifiedIdentity)
      window.removeEventListener("focus", syncVerifiedIdentity)
      window.removeEventListener(VERIFIED_IDENTITY_CHANGED_EVENT, syncVerifiedIdentity)
      document.removeEventListener("visibilitychange", syncVerifiedIdentity)
    }
  }, [syncVerifiedIdentity])

  useEffect(() => {
    let cancelled = false
    const file = state.selectedFile

    if (!file) {
      setLocalSourceThumbnailUrl(null)
      return
    }

    createSourceThumbnailDataUrl(file).then((thumbnailUrl) => {
      if (!cancelled) setLocalSourceThumbnailUrl(thumbnailUrl)
    })

    return () => {
      cancelled = true
    }
  }, [state.selectedFile])

  useEffect(() => {
    const refreshCurrentPreviewSaved = () => {
      if (!magicLinkIdentity || !selectedPreview?.previewId || selectedPreview.status !== "ready" || !state.selectedSize?.id) {
        setCurrentPreviewSaved(false)
        return
      }

      const savedInIdentityLibrary = [
        ...identityPreviewLibrary.previews,
        ...identityPreviewLibrary.projects.flatMap((project) => project.previews ?? []),
      ].some((preview) => (
        preview.previewId === selectedPreview.previewId &&
        normalizeSizeId(preview.selectedSize ?? preview.preferredSize) === state.selectedSize?.id
      ))
      setCurrentPreviewSaved(
        savedInIdentityLibrary ||
        isAccountPreviewSaved(magicLinkIdentity.email, selectedPreview.previewId, state.selectedSize.id),
      )
    }

    refreshCurrentPreviewSaved()
    window.addEventListener("storage", refreshCurrentPreviewSaved)
    window.addEventListener("dottingo_preview_registry_changed", refreshCurrentPreviewSaved)
    return () => {
      window.removeEventListener("storage", refreshCurrentPreviewSaved)
      window.removeEventListener("dottingo_preview_registry_changed", refreshCurrentPreviewSaved)
    }
  }, [identityPreviewLibrary, magicLinkIdentity, selectedPreview?.previewId, selectedPreview?.status, state.selectedSize?.id])

  useEffect(() => {
    if (!magicLinkIdentity || !selectedPreview?.previewId) return
    let cancelled = false

    fetchVerifiedIdentityPreviews(magicLinkIdentity).then(
      async (library) => {
        if (cancelled) return
        setIdentityPreviewLibrary(library)
        const previews = [
          ...library.previews,
          ...library.projects.flatMap((project) => project.previews ?? []),
        ]
        const identityPreview = previews.find((preview) => preview.previewId === selectedPreview.previewId)
        if (!identityPreview?.sourceImageUrl) return
        await hydrateSourceImage(identityPreview.sourceImageUrl, identityPreview.previewId)
      },
      (error) => {
        if (cancelled) return
        captureEvent('identity_preview_library_failed', {
          preview_id: selectedPreview.previewId,
          error_message: error instanceof Error ? error.message : 'Identity preview library failed',
        })
      },
    )

    return () => {
      cancelled = true
    }
  }, [hydrateSourceImage, magicLinkIdentity, selectedPreview?.previewId])

  return (
    <LayoutFrame
      headerAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAccountPanelOpen((open) => !open)}
            className="inline-flex max-w-[min(64vw,20rem)] items-center gap-2 rounded-[1.25rem] border border-[#9432c1]/15 bg-white/88 px-3.5 py-2 text-left text-[#9432c1] shadow-[0_14px_34px_rgba(148,50,193,0.16)] backdrop-blur-xl transition hover:bg-white"
            aria-label={magicLinkIdentity ? `Verified account ${magicLinkIdentity.email}` : "Account"}
            aria-expanded={accountPanelOpen}
          >
            {magicLinkIdentity ? (
              <span className="flex min-w-0 flex-col leading-none">
                <span className="font-black">Verified</span>
                <span className="mt-1 max-w-[9rem] truncate text-[10px] font-bold text-[#9432c1]/58 sm:max-w-[14rem]">
                  {magicLinkIdentity.email}
                </span>
              </span>
            ) : (
              <span className="text-xs font-black">Account</span>
            )}
          </button>
          {magicLinkIdentity ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-[#9432c1]/12 bg-white/80 px-3 py-2 text-xs font-black text-[#2e2d2c]/55 shadow-[0_12px_30px_rgba(46,45,44,0.10)] backdrop-blur-xl transition hover:bg-white hover:text-[#9432c1]"
            >
              Logout
            </button>
          ) : null}
        </div>
      }
    >
      <Suspense fallback={null}>
        <AdCreativeExperimentTracker />
      </Suspense>

      {/* Scene Zone: anchored independently so bottom panel height never moves the 3D view. */}
      <div className="absolute inset-0">
        <PreviewScenePanel sceneModel={sceneModel} />
        <PreviewOptionOverlay
          isProcessing={sceneModel.isProcessing}
          previewOptions={selectedPreview?.options ?? []}
          selectedPreviewOptionId={selectedPreview?.selectedOptionId ?? null}
          selectedSize={state.selectedSize}
          onSetPreviewOption={actions.setPreviewOption}
        />
      </div>

      {magicLinkNotice ? (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-40 px-4">
          <div
            className={`pointer-events-auto mx-auto max-w-md rounded-2xl border px-4 py-3 text-center text-sm font-extrabold shadow-[0_18px_54px_rgba(46,45,44,0.16)] backdrop-blur-xl ${
              magicLinkNotice.kind === "success"
                ? "border-[#9432c1]/15 bg-white/88 text-[#2e2d2c]"
                : "border-red-300/60 bg-red-50/90 text-red-800"
            }`}
            role="status"
          >
            {magicLinkNotice.message}
          </div>
        </div>
      ) : null}

      {accountPanelOpen ? (
        <AccountPanel
          selectedPreview={selectedPreview ?? null}
          selectedSize={state.selectedSize}
          verifiedIdentity={magicLinkIdentity}
          sourceImageUrlFallback={localSourceThumbnailUrl}
          startEmailFlowNonce={saveEmailFlowNonce}
          onDeletedCurrentPreview={handleDeletedCurrentPreview}
          onClose={() => setAccountPanelOpen(false)}
        />
      ) : null}

      <CropModal
        open={cropModalOpen}
        sourceFile={state.selectedFile}
        selectedSize={state.selectedSize}
        currentOrientation={selectedPreview?.orientation ?? null}
        currentCrop={selectedPreview?.crop ?? null}
        onApply={(orientation, crop) => {
          handleApplyCrop(orientation, crop)
        }}
        onClose={() => setCropModalOpen(false)}
      />

      {/* Bottom Modal Zone */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-4">
        <div className="pointer-events-auto mx-auto max-h-[min(62dvh,34rem)] max-w-md overflow-y-auto rounded-[2rem] border border-[#9432c1]/15 bg-white/82 p-3 text-[#2e2d2c] shadow-[0_28px_80px_rgba(148,50,193,0.22)] backdrop-blur-xl sm:p-4">
          <div className="flex min-h-[168px] flex-col items-center justify-center gap-3">
            <PurchasePanel
              selectedSize={state.selectedSize}
              selectedPreview={selectedPreview ?? null}
              verifiedIdentity={magicLinkIdentity}
              currentPreviewSaved={currentPreviewSaved}
              onSaveCurrentPreview={handleSaveCurrentPreview}
              onOpenAccountPanel={() => {
                setSaveEmailFlowNonce((nonce) => nonce + 1)
                setAccountPanelOpen(true)
              }}
            />
            <GuidedControls
              guidedModel={guidedModel}
              selectedSize={state.selectedSize}
              selectedPreviewOptionId={selectedPreview?.selectedOptionId ?? null}
              onSelectImage={actions.selectImage}
              onRetry={actions.retry}
              onReset={actions.reset}
              onSetSize={handleSetSize}
              onEditCrop={() => setCropModalOpen(true)}
              canEditCrop={Boolean(state.selectedFile && state.selectedSize)}
              isVerified={Boolean(magicLinkIdentity)}
              readySizeIds={readySizeIds}
            />
          </div>
        </div>
      </div>
    </LayoutFrame>
  )
}
