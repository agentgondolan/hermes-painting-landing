"use client"

import { useEffect, useMemo, useState } from "react"
import { captureEvent } from "@/lib/analytics/posthog"
import {
  attachVerifiedIdentityPreview,
  deleteVerifiedIdentityPreview,
  deleteVerifiedIdentityProject,
  fetchVerifiedIdentityPreviews,
  pollMagicLinkRequestStatus,
  readVerifiedIdentity,
  requestDesignMagicLink,
  VERIFIED_IDENTITY_CHANGED_EVENT,
  type IdentityPreviewLibrary,
  type IdentityPreviewProject,
  type IdentityPreviewRow,
  type StoredIdentity,
} from "@/lib/identity/browser"
import {
  buildPreviewOpenPath,
  hideAccountPreview,
  ACCOUNT_PREVIEW_REGISTRY_CHANGED_EVENT,
  isAccountPreviewSaved,
  normalizeRegistryEmail,
  readAccountPreviews,
  upsertAccountPreview,
  type AccountPreviewRecord,
} from "@/lib/account/preview-registry"
import type { DotPreviewResult } from "@/components/single-screen-preview/preview-state"
import type { FrameSizeOption } from "@/components/single-screen-preview/preview-state"

type AccountPanelProps = {
  selectedPreview: DotPreviewResult | null
  selectedSize?: Pick<FrameSizeOption, "id" | "label"> | null
  verifiedIdentity: StoredIdentity | null
  sourceImageUrlFallback?: string | null
  startEmailFlowNonce?: number
  onDeletedCurrentPreview?: () => void
  onClose: () => void
}

type EmailFlowIntent = "save" | "login"

type SavedPreviewCard = AccountPreviewRecord & {
  projectId?: string | null
  sourceGroupId?: string | null
  sourceImageUrl?: string | null
  sourceThumbnailUrl?: string | null
  sourceAvailable?: boolean
  isCurrent?: boolean
  fromIdentityProject?: boolean
  fixedSize?: boolean
  sizeChangeMode?: string | null
  refreshAvailable?: boolean
  refreshUnavailableReason?: string | null
  purchaseOptionsAvailable?: boolean | null
  purchaseOptionsUnavailableReason?: string | null
}

type SavedPreviewGroup = {
  key: string
  projectId?: string | null
  sourceGroupId?: string | null
  sourceImageUrl: string | null
  sourceThumbnailUrl: string | null
  sourceAvailable: boolean
  previews: SavedPreviewCard[]
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
}

function previewImage(row: IdentityPreviewRow): string | null {
  const selectedOption = row.options?.find((option) => option.orderable && option.imageUrl) ?? row.options?.find((option) => option.imageUrl)
  return selectedOption?.imageUrl ?? row.imageUrl ?? null
}

function previewSizeLabel(row: IdentityPreviewRow): string | null {
  return asString(row.preferredSize) || asString(row.selectedSize) || null
}

function previewOrientation(row: IdentityPreviewRow): "horizontal" | "vertical" | null {
  return row.orientation === "horizontal" || row.orientation === "vertical" ? row.orientation : null
}

function buildProjectPreviewCard(row: IdentityPreviewRow, project?: IdentityPreviewProject | null): SavedPreviewCard | null {
  const previewId = asString(row.previewId)
  if (!previewId) return null
  const sizeId = asString(row.selectedSize) || asString(row.preferredSize) || "unknown"
  return {
    email: "",
    previewId,
    sizeId,
    sizeLabel: previewSizeLabel(row),
    imageUrl: previewImage(row),
    orientation: previewOrientation(row),
    selectedPreviewOptionId: asString(row.options?.find((option) => option.orderable)?.previewOptionId) || null,
    orderable: row.purchaseOptionsAvailable ?? row.options?.some((option) => option.orderable) ?? null,
    updatedAt: Date.now(),
    projectId: (project?.projectId ?? (asString(row.projectId) || null)),
    sourceGroupId: project?.sourceGroupId ?? row.sourceGroupId ?? null,
    sourceImageUrl: project?.sourceImageUrl ?? row.sourceImageUrl ?? null,
    sourceThumbnailUrl: project?.sourceThumbnailUrl ?? row.sourceThumbnailUrl ?? project?.sourceImageUrl ?? row.sourceImageUrl ?? null,
    sourceAvailable: row.sourceAvailable ?? project?.sourceAvailable ?? Boolean(project?.sourceImageUrl ?? row.sourceImageUrl),
    isCurrent: Boolean(row.isCurrent),
    fromIdentityProject: Boolean(project),
    fixedSize: row.fixedSize,
    sizeChangeMode: row.sizeChangeMode ?? null,
    refreshAvailable: row.refreshAvailable,
    refreshUnavailableReason: row.refreshUnavailableReason ?? null,
    purchaseOptionsAvailable: row.purchaseOptionsAvailable ?? null,
    purchaseOptionsUnavailableReason: row.purchaseOptionsUnavailableReason ?? null,
  }
}

function identityProjectPreviewGroups(library: IdentityPreviewLibrary): SavedPreviewGroup[] {
  const groups: SavedPreviewGroup[] = []

  for (const project of library.projects ?? []) {
    const previews = (project.previews ?? [])
      .map((preview) => buildProjectPreviewCard(preview, project))
      .filter((card): card is SavedPreviewCard => Boolean(card))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.updatedAt - a.updatedAt)

    if (!previews.length) continue

    const projectId = asString(project.projectId)
    const sourceGroupId = asString(project.sourceGroupId)
    const sourceImageUrl = project.sourceImageUrl ?? previews.find((preview) => preview.sourceImageUrl)?.sourceImageUrl ?? null
    const sourceThumbnailUrl = project.sourceThumbnailUrl ?? previews.find((preview) => preview.sourceThumbnailUrl)?.sourceThumbnailUrl ?? sourceImageUrl

    groups.push({
      key: projectId ? `project:${projectId}` : sourceGroupId ? `source:${sourceGroupId}` : `preview:${previews[0].previewId}`,
      projectId: projectId || null,
      sourceGroupId: sourceGroupId || null,
      sourceImageUrl,
      sourceThumbnailUrl,
      sourceAvailable: Boolean(project.sourceAvailable ?? sourceImageUrl ?? previews.some((preview) => preview.sourceAvailable || preview.sourceImageUrl)),
      previews,
    })
  }

  return groups.sort((a, b) => Number(b.previews.some((item) => item.isCurrent)) - Number(a.previews.some((item) => item.isCurrent)))
}

function previewBadgeLabel(record: SavedPreviewCard): string {
  return record.sizeLabel || record.sizeId || "Saved size"
}

function isSameSize(left?: string | null, right?: string | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

function sourceGroupingKey(record: SavedPreviewCard): string {
  const projectId = asString(record.projectId)
  if (projectId) return `project:${projectId}`
  const sourceGroupId = asString(record.sourceGroupId)
  const sourceImageUrl = asString(record.sourceImageUrl)
  if (sourceGroupId && sourceGroupId !== projectId) return `source:${sourceGroupId}`
  if (sourceImageUrl) return `image:${sourceImageUrl}`
  return `preview:${record.previewId}`
}

function groupSavedPreviews(records: SavedPreviewCard[]): SavedPreviewGroup[] {
  const groups = new Map<string, SavedPreviewGroup>()
  records.forEach((record) => {
    const key = sourceGroupingKey(record)
    const existing = groups.get(key)
    const group: SavedPreviewGroup = existing ?? {
      key,
      projectId: asString(record.projectId) || null,
      sourceGroupId: asString(record.sourceGroupId) || null,
      sourceImageUrl: record.sourceImageUrl || null,
      sourceThumbnailUrl: record.sourceThumbnailUrl || record.sourceImageUrl || null,
      sourceAvailable: Boolean(record.sourceAvailable || record.sourceImageUrl),
      previews: [],
    }
    if (!group.projectId && record.projectId) group.projectId = record.projectId
    if (!group.sourceGroupId && record.sourceGroupId) group.sourceGroupId = record.sourceGroupId
    if (!group.sourceImageUrl && record.sourceImageUrl) group.sourceImageUrl = record.sourceImageUrl
    if (!group.sourceThumbnailUrl && (record.sourceThumbnailUrl || record.sourceImageUrl)) group.sourceThumbnailUrl = record.sourceThumbnailUrl || record.sourceImageUrl || null
    group.sourceAvailable = group.sourceAvailable || Boolean(record.sourceAvailable || record.sourceImageUrl)
    group.previews.push(record)
    group.previews.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.updatedAt - a.updatedAt)
    groups.set(key, group)
  })
  return Array.from(groups.values()).sort((a, b) => Number(b.previews.some((item) => item.isCurrent)) - Number(a.previews.some((item) => item.isCurrent)))
}

export function AccountPanel({ selectedPreview, selectedSize = null, verifiedIdentity, sourceImageUrlFallback = null, startEmailFlowNonce = 0, onDeletedCurrentPreview, onClose }: AccountPanelProps) {
  const previewId = selectedPreview?.previewId ?? null
  const [identity, setIdentity] = useState<StoredIdentity | null>(verifiedIdentity)
  const [email, setEmail] = useState(verifiedIdentity?.email ?? "")
  const [isChangingEmail, setIsChangingEmail] = useState(false)
  const [emailFlowIntent, setEmailFlowIntent] = useState<EmailFlowIntent | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [localSavedPreviews, setLocalSavedPreviews] = useState<SavedPreviewCard[]>([])
  const [identityPreviewGroups, setIdentityPreviewGroups] = useState<SavedPreviewGroup[]>([])
  const [hiddenPreviewIds, setHiddenPreviewIds] = useState<Set<string>>(() => new Set())
  const [previewPage, setPreviewPage] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(900)
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null)

  const refreshSavedPreviews = (nextIdentity: StoredIdentity | null) => {
    if (!nextIdentity) {
      setLocalSavedPreviews([])
      setIdentityPreviewGroups([])
      return
    }

    const normalizedEmail = normalizeRegistryEmail(nextIdentity.email)
    const localRecords = readAccountPreviews(normalizedEmail)
      .filter((record) => !hiddenPreviewIds.has(record.previewId))
      .map((record) => ({ ...record, email: normalizedEmail }))
    setLocalSavedPreviews(localRecords)

    if (!nextIdentity.mgeIdentityToken) {
      setIdentityPreviewGroups([])
      return
    }

    fetchVerifiedIdentityPreviews(nextIdentity).then(
      (library) => {
        const fetchedAt = Date.now()
        const groups = identityProjectPreviewGroups(library)
          .map((group) => ({
            ...group,
            previews: group.previews
              .map((card) => ({ ...card, email: normalizedEmail, updatedAt: fetchedAt }))
              .filter((card) => !hiddenPreviewIds.has(card.previewId)),
          }))
          .filter((group) => group.previews.length > 0)
        setIdentityPreviewGroups(groups)
      },
      (error) => {
        captureEvent("identity_preview_library_failed", {
          preview_id: previewId,
          error_message: error instanceof Error ? error.message : "Identity preview library failed",
        })
      },
    )
  }

  useEffect(() => {
    const storedIdentity = verifiedIdentity ?? readVerifiedIdentity()
    setIdentity(storedIdentity)
    setEmail(storedIdentity?.email ?? "")
    setIsChangingEmail(false)
    setEmailFlowIntent(null)
    setStatus(null)
    setMagicLinkSent(false)

    refreshSavedPreviews(storedIdentity)
  }, [previewId, selectedPreview, selectedSize, verifiedIdentity])

  useEffect(() => {
    if (!startEmailFlowNonce) return
    setEmailFlowIntent(selectedPreview?.status === "ready" ? "save" : "login")
    setIsChangingEmail(true)
    setMagicLinkSent(false)
    setStatus(null)
  }, [startEmailFlowNonce, selectedPreview?.status])

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight || 900)
    updateViewportHeight()
    window.addEventListener("resize", updateViewportHeight)
    return () => window.removeEventListener("resize", updateViewportHeight)
  }, [])

  useEffect(() => {
    setPreviewPage(0)
  }, [identityPreviewGroups.length, localSavedPreviews.length])

  useEffect(() => {
    const syncVerifiedIdentity = () => {
      const storedIdentity = readVerifiedIdentity()
      if (!storedIdentity) return
      const identityChanged = storedIdentity.identityToken !== identity?.identityToken

      setIdentity(storedIdentity)
      setEmail(storedIdentity.email)
      if (identityChanged) {
        setIsChangingEmail(false)
        setEmailFlowIntent(null)
        setStatus(null)
        setMagicLinkSent(false)
      }
      refreshSavedPreviews(storedIdentity)
    }

    const syncPreviewRegistry = () => refreshSavedPreviews(identity ?? readVerifiedIdentity())

    window.addEventListener("focus", syncVerifiedIdentity)
    window.addEventListener("storage", syncVerifiedIdentity)
    window.addEventListener(VERIFIED_IDENTITY_CHANGED_EVENT, syncVerifiedIdentity)
    window.addEventListener(ACCOUNT_PREVIEW_REGISTRY_CHANGED_EVENT, syncPreviewRegistry)
    document.addEventListener("visibilitychange", syncVerifiedIdentity)
    return () => {
      window.removeEventListener("focus", syncVerifiedIdentity)
      window.removeEventListener("storage", syncVerifiedIdentity)
      window.removeEventListener(VERIFIED_IDENTITY_CHANGED_EVENT, syncVerifiedIdentity)
      window.removeEventListener(ACCOUNT_PREVIEW_REGISTRY_CHANGED_EVENT, syncPreviewRegistry)
      document.removeEventListener("visibilitychange", syncVerifiedIdentity)
    }
  }, [identity, identity?.identityToken, selectedPreview, selectedSize])

  const isVerifiedGlobally = Boolean(identity)
  const savedPreviewGroups = useMemo(
    () => (identityPreviewGroups.length ? identityPreviewGroups : groupSavedPreviews(localSavedPreviews)),
    [identityPreviewGroups, localSavedPreviews],
  )
  const savedPreviews = useMemo(() => savedPreviewGroups.flatMap((group) => group.previews), [savedPreviewGroups])
  const isSavedCurrentPreview = Boolean(
    identity &&
      (savedPreviews.some((record) => record.previewId === previewId && (!selectedSize?.id || record.sizeId === selectedSize.id)) ||
        isAccountPreviewSaved(identity.email, previewId, selectedSize?.id)),
  )
  const hasCurrentDesign = Boolean(previewId && selectedPreview?.status === "ready")
  const emailFormTitle = emailFlowIntent === "login" ? "Log in to your saved designs." : "Save your design and continue later."
  const showEmailForm = Boolean((!isVerifiedGlobally || isChangingEmail) && emailFlowIntent)
  const previewGroupsPerPage = Math.max(1, Math.min(6, Math.floor((viewportHeight - 360) / 96)))
  const previewPageCount = Math.max(1, Math.ceil(savedPreviewGroups.length / previewGroupsPerPage))
  const safePreviewPage = Math.min(previewPage, previewPageCount - 1)
  const visiblePreviewGroups = useMemo(
    () => savedPreviewGroups.slice(safePreviewPage * previewGroupsPerPage, (safePreviewPage + 1) * previewGroupsPerPage),
    [safePreviewPage, previewGroupsPerPage, savedPreviewGroups],
  )

  const sendMagicLinkForEmail = async (targetEmail: string) => {
    if (!targetEmail.trim()) return

    setLoading(true)
    setMagicLinkSent(false)
    setStatus("Sending link…")

    try {
      const result = await requestDesignMagicLink(targetEmail, previewId, selectedSize?.id ?? null)
      const confirmed = result.delivery === "email_sent"
      setStatus(confirmed ? "Please check your emails to verify." : "Sending link…")
      setMagicLinkSent(confirmed)
      setEmail(targetEmail)
      setEmailFlowIntent(emailFlowIntent ?? (hasCurrentDesign ? "save" : "login"))
      if (confirmed) setIsChangingEmail(false)
      captureEvent("account_magic_link_requested", {
        preview_id: previewId,
        delivery: result.delivery,
        email_status: result.emailStatus,
        request_id: result.requestId,
      })

      if (confirmed || !result.requestId) return

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await wait(1500)
        const deliveryStatus = await pollMagicLinkRequestStatus(result.requestId)
        captureEvent("account_magic_link_delivery_poll", {
          preview_id: previewId,
          attempt,
          delivery: deliveryStatus.delivery,
          email_status: deliveryStatus.emailStatus,
          terminal: deliveryStatus.terminal,
          request_id: result.requestId,
        })

        if (deliveryStatus.delivery === "email_sent") {
          setStatus("Please check your emails to verify.")
          setMagicLinkSent(true)
          setIsChangingEmail(false)
          captureEvent("account_magic_link_delivery_confirmed", {
            preview_id: previewId,
            attempt,
            email_status: deliveryStatus.emailStatus,
            request_id: result.requestId,
          })
          return
        }

        if (deliveryStatus.terminal) {
          setStatus("Could not send link. Try again.")
          setMagicLinkSent(false)
          captureEvent("account_magic_link_delivery_failed", {
            preview_id: previewId,
            attempt,
            email_status: deliveryStatus.emailStatus,
            request_id: result.requestId,
          })
          return
        }
      }

      setStatus("Still sending. You can send again in a moment.")
      captureEvent("account_magic_link_delivery_pending", {
        preview_id: previewId,
        request_id: result.requestId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send magic link"
      setMagicLinkSent(false)
      setStatus(message)
      captureEvent("account_magic_link_failed", {
        preview_id: previewId,
        error_message: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCurrentPreview = async () => {
    const currentPreviewId = selectedPreview?.previewId ?? null
    if (!identity || selectedPreview?.status !== "ready" || !currentPreviewId) return
    setLoading(true)
    setStatus("Saving preview…")
    try {
      let attachedPreview: IdentityPreviewRow | null = null
      if (identity.mgeIdentityToken) {
        attachedPreview = await attachVerifiedIdentityPreview(identity, currentPreviewId)
        const attachedSourceGroupId = attachedPreview?.sourceGroupId ?? selectedPreview.sourceGroupId ?? null
        const oldSameSizePreviewIds = identityPreviewGroups
          .filter((group) => group.sourceGroupId && group.sourceGroupId === attachedSourceGroupId)
          .flatMap((group) => group.previews)
          .filter((record) => record.previewId !== currentPreviewId && isSameSize(record.sizeId, selectedSize?.id))
          .map((record) => record.previewId)
        await Promise.all(oldSameSizePreviewIds.map((oldPreviewId) => deleteVerifiedIdentityPreview(identity, oldPreviewId)))
      }
      const previewForRegistry: DotPreviewResult = {
        ...selectedPreview,
        sourceImageUrl: attachedPreview?.sourceImageUrl ?? selectedPreview.sourceImageUrl ?? sourceImageUrlFallback ?? null,
        sourceGroupId: attachedPreview?.sourceGroupId ?? selectedPreview.sourceGroupId ?? null,
      }
      const registered = upsertAccountPreview(identity.email, previewForRegistry, selectedSize)
      refreshSavedPreviews(identity)
      setStatus(registered ? null : "Create a ready preview first.")
      captureEvent("account_current_preview_saved", {
        preview_id: currentPreviewId,
        attached_to_mge_identity: Boolean(identity.mgeIdentityToken),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save current preview"
      setStatus(message)
      captureEvent("account_current_preview_save_failed", {
        preview_id: currentPreviewId,
        error_message: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSendMagicLink = async () => {
    await sendMagicLinkForEmail(email)
  }

  const removeGroupFromPanel = (group: SavedPreviewGroup) => {
    const deletedPreviewIds = new Set(group.previews.map((record) => record.previewId))
    setHiddenPreviewIds((current) => new Set([...current, ...deletedPreviewIds]))
    setLocalSavedPreviews((current) => current.filter((item) => !deletedPreviewIds.has(item.previewId)))
    setIdentityPreviewGroups((current) => current.filter((item) => item.key !== group.key))
    if (identity) {
      group.previews.forEach((record) => hideAccountPreview(identity.email, record.previewId))
    }
  }

  const handleDeleteGroup = async (group: SavedPreviewGroup) => {
    if (!identity) return
    setDeletingGroupKey(group.key)
    setStatus("Deleting saved design…")

    try {
      if (identity.mgeIdentityToken) {
        if (group.sourceGroupId) {
          await deleteVerifiedIdentityProject(identity, group.sourceGroupId)
        } else {
          await Promise.all(group.previews.map((record) => deleteVerifiedIdentityPreview(identity, record.previewId)))
        }
      }

      const deletedCurrentPreview = group.previews.some((record) => record.previewId === previewId)
      removeGroupFromPanel(group)
      if (deletedCurrentPreview) onDeletedCurrentPreview?.()
      setStatus("Saved design deleted.")
      captureEvent("account_preview_deleted", {
        source_group_id: group.sourceGroupId,
        preview_count: group.previews.length,
        deleted_current_preview: deletedCurrentPreview,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete saved design"
      setStatus(message)
      captureEvent("account_preview_delete_failed", {
        source_group_id: group.sourceGroupId,
        preview_count: group.previews.length,
        error_message: message,
      })
    } finally {
      setDeletingGroupKey(null)
    }
  }

  return (
    <section className="absolute right-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-5rem)] w-[min(calc(100vw-1.5rem),24rem)] flex-col overflow-hidden rounded-[1.75rem] border border-[#9432c1]/15 bg-white/92 p-4 text-[#2e2d2c] shadow-[0_26px_80px_rgba(46,45,44,0.18)] backdrop-blur-xl sm:right-8 sm:top-24 sm:max-h-[calc(100dvh-7rem)]" aria-label="Account">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9432c1]/65">Account</p>
          <h2 className="mt-1 text-lg font-black">Your saved designs</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#2e2d2c]/7 px-3 py-1.5 text-xs font-extrabold text-[#2e2d2c]/55 transition hover:bg-[#2e2d2c]/12 hover:text-[#2e2d2c]"
        >
          Close
        </button>
      </div>

      {hasCurrentDesign && !isVerifiedGlobally && !showEmailForm ? (
        <button
          type="button"
          onClick={() => {
            setEmailFlowIntent("save")
            setIsChangingEmail(true)
            setStatus(null)
          }}
          className="mt-4 w-full rounded-full bg-[#9432c1] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#7f28aa]"
        >
          Save and get back later
        </button>
      ) : null}

      {!hasCurrentDesign && !isVerifiedGlobally && !showEmailForm ? (
        <button
          type="button"
          onClick={() => {
            setEmailFlowIntent("login")
            setIsChangingEmail(true)
            setStatus(null)
          }}
          className="mt-4 w-full rounded-full bg-[#9432c1] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#7f28aa]"
        >
          Log in to saved designs
        </button>
      ) : null}

      {isVerifiedGlobally && identity && hasCurrentDesign && !isSavedCurrentPreview ? (
        <button
          type="button"
          onClick={handleSaveCurrentPreview}
          className="mt-3 w-full rounded-full bg-[#9432c1] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#7f28aa]"
        >
          Save current preview
        </button>
      ) : null}

      {showEmailForm ? (
        <div className="mt-3 rounded-[1.25rem] border border-[#9432c1]/12 bg-white/78 p-3">
          <p className="text-xs font-extrabold text-[#2e2d2c]">{emailFormTitle}</p>
          {magicLinkSent ? (
            <div className="mt-2">
              <button
                type="button"
                disabled
                className="w-full rounded-full bg-[#2e2d2c]/10 px-4 py-2 text-center text-xs font-extrabold text-[#2e2d2c]/42 disabled:cursor-not-allowed"
              >
                Email sent to {email}
              </button>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-[#2e2d2c]/58">{status ?? "Please check your emails to verify."}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMagicLinkSent(false)
                    setStatus(null)
                    setIsChangingEmail(true)
                  }}
                  className="shrink-0 text-[11px] font-bold text-[#2e2d2c]/45 underline-offset-2 transition hover:text-[#9432c1] hover:underline"
                >
                  Send again
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setMagicLinkSent(false)
                    if (identity) setIsChangingEmail(true)
                  }}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-full border border-[#9432c1]/15 bg-white px-3 py-2 text-sm font-semibold text-[#2e2d2c] outline-none transition placeholder:text-[#2e2d2c]/35 focus:border-[#9432c1]/45"
                />
                <button
                  type="button"
                  onClick={handleSendMagicLink}
                  disabled={loading || !email.trim()}
                  className="rounded-full bg-[#2e2d2c] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#111] disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/15 disabled:text-[#2e2d2c]/35"
                >
                  {loading ? "Sending…" : "Send link"}
                </button>
              </div>
              {status ? <p className="mt-2 text-xs font-medium text-[#2e2d2c]/58">{status}</p> : null}
            </>
          )}
        </div>
      ) : null}

      {!showEmailForm && status ? <p className="mt-3 text-xs font-bold text-[#2e2d2c]/58">{status}</p> : null}

      <div className="mt-4 min-h-0 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2e2d2c]/45">Verified previews</p>
          {savedPreviewGroups.length > previewGroupsPerPage ? (
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#2e2d2c]/35">
              {safePreviewPage + 1}/{previewPageCount}
            </p>
          ) : null}
        </div>
        {savedPreviewGroups.length ? (
          <>
            <div className="space-y-2">
              {visiblePreviewGroups.map((group) => {
                const isCurrentPreviewGroup = group.previews.some((record) => record.previewId === previewId)
                return (
                  <div
                    key={group.key}
                    className={`min-h-20 rounded-[1.25rem] border p-0 transition ${
                      isCurrentPreviewGroup
                        ? "border-[#9432c1]/55 bg-white shadow-[0_0_0_2px_rgba(148,50,193,0.12)]"
                        : "border-[#9432c1]/12 bg-white/78"
                    }`}
                  >
                    <div className="flex min-h-20 gap-3">
                      {group.sourceThumbnailUrl ? (
                        <img
                          src={group.sourceThumbnailUrl}
                          alt="Saved design image"
                          width={80}
                          height={80}
                          loading="lazy"
                          decoding="async"
                          className="h-20 w-20 shrink-0 rounded-[1.25rem] object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.25rem] bg-[#2e2d2c]/6 text-[10px] font-black uppercase tracking-[0.12em] text-[#2e2d2c]/35">
                          Image
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pr-2">
                        <div className="min-w-0 flex-1">
                          <div className="grid w-fit min-w-[3.7rem] grid-cols-1 gap-1">
                            {group.previews.map((record) => (
                              <a
                                key={record.previewId}
                                href={buildPreviewOpenPath(record.previewId, record.sizeId, record.orientation)}
                                aria-label={`Open ${previewBadgeLabel(record)} saved preview`}
                                className={`inline-flex h-5 items-center justify-center whitespace-nowrap rounded-full px-2 text-[10px] font-black leading-none transition ${record.previewId === previewId ? "bg-[#9432c1] text-white" : "bg-[#9432c1]/9 text-[#9432c1] hover:bg-[#9432c1]/16"}`}
                              >
                                {previewBadgeLabel(record)}
                              </a>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isCurrentPreviewGroup ? (
                            <span
                              aria-current="true"
                              className="rounded-full bg-[#9432c1]/12 px-3 py-1.5 text-[11px] font-extrabold text-[#9432c1]"
                            >
                              Opened
                            </span>
                          ) : (
                            <a
                              href={buildPreviewOpenPath(group.previews[0].previewId, group.previews[0].sizeId, group.previews[0].orientation)}
                              className="rounded-full bg-[#9432c1] px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-[#7f28aa]"
                            >
                              Open
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group)}
                            disabled={deletingGroupKey === group.key}
                            className="rounded-full bg-[#2e2d2c]/5 px-2.5 py-1.5 text-[11px] font-extrabold text-[#2e2d2c]/45 transition hover:bg-[#2e2d2c]/10 hover:text-[#2e2d2c]"
                          >
                            {deletingGroupKey === group.key ? "Deleting" : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {savedPreviewGroups.length > previewGroupsPerPage ? (
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}
                  disabled={safePreviewPage === 0}
                  className="rounded-full bg-[#2e2d2c]/6 px-3 py-1.5 text-[11px] font-extrabold text-[#2e2d2c]/50 transition hover:bg-[#2e2d2c]/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPage((page) => Math.min(previewPageCount - 1, page + 1))}
                  disabled={safePreviewPage >= previewPageCount - 1}
                  className="rounded-full bg-[#2e2d2c]/6 px-3 py-1.5 text-[11px] font-extrabold text-[#2e2d2c]/50 transition hover:bg-[#2e2d2c]/10 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-[1.1rem] bg-[#2e2d2c]/5 px-3 py-2 text-xs font-semibold text-[#2e2d2c]/52">
            Log in by email to load saved designs, or save a ready preview from this device.
          </p>
        )}
      </div>
    </section>
  )
}
