"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  fetchVerifiedIdentityPreviews,
  readVerifiedIdentity,
  type IdentityPreviewLibrary,
  type IdentityPreviewProject,
  type IdentityPreviewRow,
  type StoredIdentity,
} from "@/lib/identity/browser"
import {
  createPreviewClient,
  type BffPurchaseOptionsResult,
  type BffOrderDraftResult,
} from "@/lib/mgeveryday/browser-preview"
import {
  DEFAULT_EUR_TO_SGD_RATE,
  DOT_EXPRESS_OPTIONS_ENABLED,
  DOT_FRAME_OPTIONS_ENABLED,
  GST_RATE,
  TARGET_GROSS_MARGIN,
  isDottingoAdminEmail,
} from "@/lib/dottingo/project-settings"

type PurchaseOption = BffPurchaseOptionsResult["purchaseOptions"][number]

type DesignSelection = {
  purchaseOptionId: string
  quantity: number
}

type OptionState =
  | { status: "idle" | "loading"; options: PurchaseOption[]; error: null }
  | { status: "ready"; options: PurchaseOption[]; error: null }
  | { status: "error"; options: PurchaseOption[]; error: string }

const EMPTY_LIBRARY: IdentityPreviewLibrary = { previews: [], projects: [] }
const CART_DRAFT_STORAGE_KEY = "dottingo_cart_draft_id_v1"

export function MultiProjectCartPage() {
  const [identity, setIdentity] = useState<StoredIdentity | null>(null)
  const [library, setLibrary] = useState<IdentityPreviewLibrary>(EMPTY_LIBRARY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [optionStates, setOptionStates] = useState<Record<string, OptionState>>({})
  const [selections, setSelections] = useState<Record<string, DesignSelection>>({})
  const [orderDraftId, setOrderDraftId] = useState<string | null>(null)
  const [syncedDraft, setSyncedDraft] = useState<BffOrderDraftResult | null>(null)
  const [draftSyncing, setDraftSyncing] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [previewModal, setPreviewModal] = useState<{ url: string; label: string } | null>(null)

  useEffect(() => {
    setOrderDraftId(readStoredCartDraftId())
    const stored = readVerifiedIdentity()
    setIdentity(stored)
    if (!stored) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetchVerifiedIdentityPreviews(stored).then(
      (nextLibrary) => {
        setLibrary(nextLibrary)
        setError(null)
      },
      (err) => {
        setLibrary(EMPTY_LIBRARY)
        setError(err instanceof Error ? err.message : "Could not load saved designs")
      },
    ).finally(() => setLoading(false))
  }, [])

  const readyProjects = useMemo(
    () => library.projects
      .map((project) => ({
        ...project,
        previews: project.previews.filter(isReadyPreview),
      }))
      .filter((project) => project.previews.length > 0),
    [library.projects],
  )

  useEffect(() => {
    const client = createPreviewClient()
    if (!client) return

    readyProjects.flatMap((project) => project.previews).forEach((preview) => {
      if (optionStates[preview.previewId]) return
      setOptionStates((current) => ({
        ...current,
        [preview.previewId]: { status: "loading", options: [], error: null },
      }))
      client.pollPurchaseOptions(preview.previewId).then(
        (result) => {
          const orderableOptions = result.purchaseOptions.filter(isOrderablePurchaseOption)
          setOptionStates((current) => ({
            ...current,
            [preview.previewId]: { status: "ready", options: orderableOptions, error: null },
          }))
        },
        (err) => {
          setOptionStates((current) => ({
            ...current,
            [preview.previewId]: {
              status: "error",
              options: [],
              error: err instanceof Error ? err.message : "Could not load order options",
            },
          }))
        },
      )
    })
  }, [readyProjects, optionStates])

  const selectedLines = useMemo(
    () => Object.entries(selections).map(([previewId, selection]) => {
      const preview = readyProjects.flatMap((project) => project.previews).find((item) => item.previewId === previewId)
      const option = optionStates[previewId]?.options.find((item) => optionIdentity(item) === selection.purchaseOptionId) ?? null
      return preview && option ? { preview, option, quantity: selection.quantity } : null
    }).filter((line): line is { preview: IdentityPreviewRow; option: PurchaseOption; quantity: number } => Boolean(line)),
    [optionStates, readyProjects, selections],
  )

  const total = selectedLines.reduce((sum, line) => sum + quoteCents(line.option) * line.quantity, 0)
  const draftLineCount = syncedDraft?.lineItems?.length ?? syncedDraft?.itemCount ?? 0

  useEffect(() => {
    const validPreviewIds = new Set(readyProjects.flatMap((project) => project.previews.map((preview) => preview.previewId)))
    setSelections((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([previewId]) => validPreviewIds.has(previewId)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [readyProjects])

  useEffect(() => {
    setDraftDirty(true)
    setDraftError(null)
    setCheckoutError(null)
  }, [selections])

  const togglePreview = (preview: IdentityPreviewRow) => {
    const options = optionStates[preview.previewId]?.options ?? []
    if (!options.length) return
    setSelections((current) => {
      if (current[preview.previewId]) {
        const next = { ...current }
        delete next[preview.previewId]
        return next
      }
      return {
        ...current,
        [preview.previewId]: {
          purchaseOptionId: optionIdentity(options[0]),
          quantity: 1,
        },
      }
    })
  }

  const updateOption = (previewId: string, purchaseOptionId: string) => {
    setSelections((current) => current[previewId]
      ? { ...current, [previewId]: { ...current[previewId], purchaseOptionId } }
      : current)
  }

  const updateQuantity = (previewId: string, quantity: number) => {
    setSelections((current) => current[previewId]
      ? { ...current, [previewId]: { ...current[previewId], quantity: Math.max(1, Math.min(99, quantity)) } }
      : current)
  }

  const syncDraft = useCallback(async (lines = selectedLines) => {
    const client = createPreviewClient()
    if (!client) {
      setDraftError("Draft sync is not available in local fallback mode.")
      return
    }

    if (!lines.length && !orderDraftId) {
      setSyncedDraft(null)
      setDraftDirty(false)
      clearStoredCartDraftId()
      return
    }

    setDraftSyncing(true)
    setDraftError(null)
    try {
      const draft = await client.createOrderDraft({
        order_draft_id: orderDraftId,
        cart_lines: lines.map(({ preview, option, quantity }) => ({
          preview_id: preview.previewId,
          preview_option_id: option.previewOptionId,
          sku: optionSku(option),
          quantity,
          selected_size: preview.selectedSize ?? preview.preferredSize ?? null,
          source_group_id: preview.sourceGroupId ?? null,
          source_image_url: preview.sourceImageUrl ?? null,
          design_image_url: purchaseOptionImageUrl(option) ?? designImageUrl(preview),
          label: purchaseOptionLabel(option),
        })),
      })
      if (!lines.length) {
        setSyncedDraft(null)
        setOrderDraftId(null)
        clearStoredCartDraftId()
        setDraftDirty(false)
        return
      }
      setSyncedDraft(draft)
      setOrderDraftId(draft.orderDraftId)
      writeStoredCartDraftId(draft.orderDraftId)
      setDraftDirty(false)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not sync MGE draft")
    } finally {
      setDraftSyncing(false)
    }
  }, [orderDraftId, selectedLines])

  useEffect(() => {
    if (!draftDirty) return
    const timer = window.setTimeout(() => {
      void syncDraft()
    }, 550)
    return () => window.clearTimeout(timer)
  }, [draftDirty, orderDraftId, selectedLines, syncDraft])

  const handleCheckout = async () => {
    if (!identity) {
      setCheckoutError("Log in before payment.")
      return
    }
    if (!syncedDraft || draftDirty || draftSyncing) {
      setCheckoutError("Wait for the MGE draft to finish syncing before payment.")
      return
    }

    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_draft_id: syncedDraft.orderDraftId,
          order_draft: syncedDraft,
          identity_token: identity.identityToken,
        }),
      })
      const payload = await response.json().catch(() => null) as { url?: string; error?: string; detail?: string } | null
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.detail || payload?.error || `Checkout failed (${response.status})`)
      }
      window.location.assign(payload.url)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Could not start checkout")
      setCheckoutLoading(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#faf7ff] px-4 py-5 text-[#2e2d2c] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="text-4xl font-black text-[#9432c1]">dottingo</a>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {identity && isDottingoAdminEmail(identity.email) ? (
              <a href="/admin" className="rounded-full border border-[#9432c1]/16 bg-white px-4 py-2 text-sm font-extrabold text-[#9432c1] shadow-[0_18px_45px_rgba(148,50,193,0.10)]">
                Admin
              </a>
            ) : null}
            <div className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#9432c1] shadow-[0_18px_45px_rgba(148,50,193,0.12)]">
              {identity ? `Verified ${identity.email}` : "Account required"}
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="rounded-[1.5rem] border border-[#9432c1]/14 bg-white/82 p-4 shadow-[0_24px_80px_rgba(46,45,44,0.08)] sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase text-[#9432c1]/70">Checkout</p>
                <h1 className="mt-1 text-2xl font-black sm:text-3xl">Choose saved designs</h1>
              </div>
              <a href="/" className="rounded-full border border-[#9432c1]/18 bg-white px-4 py-2 text-sm font-extrabold text-[#9432c1]">
                Add image
              </a>
            </div>

            {loading ? <p className="mt-5 text-sm font-bold text-[#2e2d2c]/58">Loading saved designs...</p> : null}
            {error ? <p className="mt-5 rounded-[1rem] bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
            {!loading && !identity ? (
              <p className="mt-5 rounded-[1rem] bg-[#9432c1]/8 px-4 py-3 text-sm font-bold text-[#2e2d2c]/64">
                Log in from Account on the main page to load your saved designs.
              </p>
            ) : null}
            {!loading && identity && !readyProjects.length ? (
              <p className="mt-5 rounded-[1rem] bg-[#2e2d2c]/5 px-4 py-3 text-sm font-bold text-[#2e2d2c]/58">
                No ready saved designs yet. Add an image and save a generated DOT preview first.
              </p>
            ) : null}

            <div className="mt-5 space-y-4">
              {readyProjects.map((project) => (
                <ProjectDesigns
                  key={projectKey(project)}
                  project={project}
                  optionStates={optionStates}
                  selections={selections}
                  onToggle={togglePreview}
                  onOptionChange={updateOption}
                  onQuantityChange={updateQuantity}
                  onPreviewOpen={setPreviewModal}
                />
              ))}
            </div>
          </div>

          <aside className="h-fit rounded-[1.5rem] border border-[#9432c1]/14 bg-white p-4 shadow-[0_24px_80px_rgba(46,45,44,0.08)]">
            <p className="text-sm font-black uppercase text-[#9432c1]/70">Draft order</p>
            <p className="mt-2 text-2xl font-black">SGD {(total / 100).toFixed(2)}</p>
            <p className="mt-1 text-sm font-bold text-[#2e2d2c]/52">
              {selectedLines.length ? `${selectedLines.length} selected design${selectedLines.length === 1 ? "" : "s"}` : "Select designs to build your draft."}
            </p>
            {syncedDraft && selectedLines.length ? (
              <p className="mt-2 rounded-full bg-[#9432c1]/9 px-3 py-1.5 text-xs font-extrabold text-[#9432c1]">
                Draft saved · {draftLineCount} line{draftLineCount === 1 ? "" : "s"}
              </p>
            ) : null}
            <div className="mt-4 space-y-2">
              {selectedLines.map((line) => (
                <div key={line.preview.previewId} className="rounded-[1rem] bg-[#2e2d2c]/5 px-3 py-2 text-sm font-bold text-[#2e2d2c]/68">
                  <div className="flex justify-between gap-2">
                    <span>{sizeLabel(line.preview)}</span>
                    <span>x{line.quantity}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#2e2d2c]/45">{purchaseOptionLabel(line.option)}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-[1rem] bg-[#2e2d2c]/5 px-3 py-2 text-xs font-extrabold text-[#2e2d2c]/48">
              {draftSyncing ? "Saving draft..." : !selectedLines.length ? "Select designs to start a draft." : syncedDraft && !draftDirty ? "Draft saved" : "Draft will save automatically."}
            </p>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading || draftSyncing || !selectedLines.length || !syncedDraft || draftDirty}
              className="mt-2 w-full rounded-full border border-[#9432c1]/18 bg-white px-4 py-3 text-sm font-extrabold text-[#9432c1] transition hover:bg-[#9432c1]/6 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#2e2d2c]/6 disabled:text-[#2e2d2c]/32"
            >
              {checkoutLoading ? "Opening checkout..." : "Continue to payment"}
            </button>
            {draftError ? <p className="mt-2 text-xs font-bold text-red-700">{draftError}</p> : null}
            {checkoutError ? <p className="mt-2 text-xs font-bold text-red-700">{checkoutError}</p> : null}
          </aside>
        </section>
      </div>
      {previewModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2e2d2c]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={previewModal.label}>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close preview" onClick={() => setPreviewModal(null)} />
          <div className="relative max-h-[92dvh] w-full max-w-5xl rounded-[1.25rem] bg-white p-3 shadow-[0_30px_100px_rgba(46,45,44,0.28)]">
            <button
              type="button"
              onClick={() => setPreviewModal(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/92 px-4 py-2 text-sm font-extrabold text-[#2e2d2c]/62 shadow-[0_10px_30px_rgba(46,45,44,0.12)]"
            >
              Close
            </button>
            <img src={previewModal.url} alt={previewModal.label} className="max-h-[86dvh] w-full rounded-[0.9rem] object-contain" />
          </div>
        </div>
      ) : null}
    </main>
  )
}

function ProjectDesigns({
  project,
  optionStates,
  selections,
  onToggle,
  onOptionChange,
  onQuantityChange,
  onPreviewOpen,
}: {
  project: IdentityPreviewProject
  optionStates: Record<string, OptionState>
  selections: Record<string, DesignSelection>
  onToggle: (preview: IdentityPreviewRow) => void
  onOptionChange: (previewId: string, purchaseOptionId: string) => void
  onQuantityChange: (previewId: string, quantity: number) => void
  onPreviewOpen: (preview: { url: string; label: string }) => void
}) {
  return (
    <section className="rounded-[1.25rem] border border-[#9432c1]/12 bg-[#fbf8ff] p-3">
      <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
        {project.sourceImageUrl ? (
          <img
            src={project.sourceImageUrl}
            alt="Source image"
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-[1rem] object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-[1rem] bg-[#2e2d2c]/6 text-xs font-black uppercase text-[#2e2d2c]/35">Image</div>
        )}
        <div className="flex flex-col gap-3">
          {project.previews.map((preview) => {
            const optionState = optionStates[preview.previewId] ?? { status: "idle", options: [], error: null }
            const selection = selections[preview.previewId] ?? null
            const selectedOption = selection ? optionState.options.find((option) => optionIdentity(option) === selection.purchaseOptionId) ?? null : null
            const canSelect = optionState.status === "ready" && optionState.options.length > 0
            const hasMultipleOptions = optionState.options.length > 1
            const thumbnailUrl = selectedOption ? purchaseOptionImageUrl(selectedOption) ?? designImageUrl(preview) : designImageUrl(preview)
            return (
              <article
                key={preview.previewId}
                className={`rounded-[1rem] border bg-white p-3 transition ${selection ? "border-[#9432c1]/70 shadow-[0_0_0_2px_rgba(148,50,193,0.10)]" : "border-[#9432c1]/10"}`}
              >
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-4 flex items-center justify-center">
                    {thumbnailUrl ? (
                      <button
                        type="button"
                        onClick={() => onPreviewOpen({ url: thumbnailUrl, label: `${sizeLabel(preview)} DOT design` })}
                        className="flex h-36 w-full items-center justify-center rounded-[0.8rem] transition hover:bg-[#9432c1]/6"
                      >
                        <img
                          src={thumbnailUrl}
                          alt="Ready DOT design"
                          loading="lazy"
                          decoding="async"
                          className="h-36 w-auto max-w-full rounded-[0.45rem] object-contain"
                        />
                      </button>
                    ) : (
                      <div className="flex h-36 w-full items-center justify-center text-[10px] font-black uppercase text-[#2e2d2c]/35">Design</div>
                    )}
                  </div>
                  <div className="col-span-8 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="rounded-full bg-[#9432c1]/9 px-2 py-1 text-[11px] font-black text-[#9432c1]">{sizeLabel(preview)}</p>
                      <button
                        type="button"
                        onClick={() => onToggle(preview)}
                        disabled={!canSelect}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${
                          selection ? "bg-[#9432c1] text-white" : "bg-[#2e2d2c]/6 text-[#2e2d2c]/55 hover:bg-[#9432c1]/10 hover:text-[#9432c1]"
                        } disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/5 disabled:text-[#2e2d2c]/28`}
                      >
                        {selection ? "Selected" : "Select"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs font-bold text-[#2e2d2c]/48">{optionStatusLabel(optionState)}</p>
                    {selection && selectedOption ? (
                      <div className="mt-3 space-y-2">
                        {hasMultipleOptions ? (
                          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`${sizeLabel(preview)} order option`}>
                            {optionState.options.map((option) => {
                              const identity = optionIdentity(option)
                              const isSelected = identity === selection.purchaseOptionId
                              return (
                                <button
                                  key={identity}
                                  type="button"
                                  onClick={() => onOptionChange(preview.previewId, identity)}
                                  aria-pressed={isSelected}
                                  className={`min-h-10 rounded-full border px-3 py-2 text-xs font-extrabold transition ${
                                    isSelected
                                      ? "border-[#9432c1] bg-[#9432c1] text-white shadow-[0_12px_30px_rgba(148,50,193,0.20)]"
                                      : "border-[#9432c1]/14 bg-white text-[#2e2d2c]/66 hover:border-[#9432c1]/36 hover:bg-[#9432c1]/7 hover:text-[#9432c1]"
                                  }`}
                                >
                                  {purchaseOptionLabel(option)}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="rounded-full bg-[#2e2d2c]/5 px-3 py-2 text-xs font-extrabold text-[#2e2d2c]/55">
                            {purchaseOptionLabel(selectedOption)}
                          </p>
                        )}
                        <div className="flex items-end justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-extrabold text-[#2e2d2c]/50" htmlFor={`qty-${preview.previewId}`}>Quantity</label>
                            <input
                              id={`qty-${preview.previewId}`}
                              type="number"
                              min={1}
                              max={99}
                              value={selection.quantity}
                              onChange={(event) => onQuantityChange(preview.previewId, Number(event.target.value))}
                              className="h-9 w-16 rounded-full border border-[#9432c1]/14 px-3 text-center text-sm font-black outline-none"
                            />
                          </div>
                          <p className="text-right text-sm font-black text-[#2e2d2c]">SGD {(quoteCents(selectedOption) / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function isReadyPreview(preview: IdentityPreviewRow): boolean {
  const status = `${preview.status ?? ""}`.toUpperCase()
  return Boolean(preview.previewId && (!status || ["COMPLETED", "PARTIAL", "READY"].includes(status)))
}

function isOrderablePurchaseOption(option: PurchaseOption): boolean {
  return Boolean(
    option.previewOptionId &&
    option.orderLine &&
    option.unitPrice &&
    isAllowedFramePurchaseOption(option) &&
    (DOT_EXPRESS_OPTIONS_ENABLED || !isExpressPurchaseOption(option)),
  )
}

function isAllowedFramePurchaseOption(option: PurchaseOption): boolean {
  const frameCode = optionFrameCode(option)
  return Boolean(frameCode && DOT_FRAME_OPTIONS_ENABLED.includes(frameCode as (typeof DOT_FRAME_OPTIONS_ENABLED)[number]))
}

function isExpressPurchaseOption(option: PurchaseOption): boolean {
  const text = `${option.label ?? ""} ${option.description ?? ""} ${option.productionSpeedCode ?? ""} ${option.productionSpeedLabel ?? ""} ${option.sku ?? ""}`
  return /\b(express|rush|fast)\b/i.test(text)
}

function projectKey(project: IdentityPreviewProject): string {
  return project.projectId || project.sourceGroupId || project.sourceImageUrl || project.previews[0]?.previewId || "project"
}

function designImageUrl(preview: IdentityPreviewRow): string | null {
  return preview.imageUrl ?? preview.options.find((option) => option.orderable && option.imageUrl)?.imageUrl ?? preview.options.find((option) => option.imageUrl)?.imageUrl ?? null
}

function purchaseOptionImageUrl(option: PurchaseOption): string | null {
  return option.previewUrl ?? option.mockupUrl ?? null
}

function sizeLabel(preview: IdentityPreviewRow): string {
  return preview.selectedSize || preview.preferredSize || "Saved size"
}

function optionIdentity(option: PurchaseOption): string {
  return option.purchaseOptionId || `${option.previewOptionId}:${option.sku ?? option.productionSpeedCode ?? option.unitPrice ?? "option"}`
}

function optionSku(option: PurchaseOption): string {
  return typeof option.sku === "string" && option.sku ? option.sku : String(option.orderLine?.sku ?? option.purchaseOptionId)
}

function purchaseOptionLabel(option: PurchaseOption): string {
  const label = `${option.label ?? ""} ${option.description ?? ""} ${option.sku ?? ""}`
  const skuParts = `${option.sku ?? ""}`.split("/").map((part) => part.trim().toUpperCase()).filter(Boolean)
  const frameLabel = option.frameLabel?.trim() || frameLabelFromSkuParts(skuParts) || frameLabelFromText(label)
  const speedLabel = option.productionSpeedLabel?.trim() || option.productionSpeedCode?.trim() || ""
  if (frameLabel) return [frameLabel, DOT_EXPRESS_OPTIONS_ENABLED ? speedLabel : ""].filter(Boolean).join(" / ")

  if (/\b(no frame|unframed|without frame)\b/i.test(label) || skuParts.some((part) => ["NOFRAME", "NO-FRAME", "UNFRAMED", "WO"].includes(part))) {
    return "Without frame"
  }
  if (/\b(frame|framed)\b/i.test(label) || skuParts.some((part) => ["W", "FRAME"].includes(part))) return "With frame"
  return option.label || option.productionSpeedLabel || option.productionSpeedCode || option.sku || "Order option"
}

function optionFrameCode(option: PurchaseOption): string | null {
  if (option.frameCode?.trim()) return option.frameCode.trim().toUpperCase()
  const skuParts = `${option.sku ?? ""}`.split("/").map((part) => part.trim().toUpperCase()).filter(Boolean)
  return ["WDIYF", "WPM", "WW", "WO", "W"].find((code) => skuParts.includes(code)) ?? null
}

function frameLabelFromSkuParts(skuParts: string[]): string | null {
  if (skuParts.includes("WO")) return "Without frame"
  if (skuParts.includes("WPM")) return "Plastic mount"
  if (skuParts.includes("WDIYF")) return "DIY wooden frame"
  if (skuParts.includes("WW")) return "Wrapped wood"
  if (skuParts.includes("W")) return "With frame"
  return null
}

function frameLabelFromText(label: string): string | null {
  if (/\b(no frame|unframed|without frame)\b/i.test(label)) return "Without frame"
  if (/\b(plastic mount)\b/i.test(label)) return "Plastic mount"
  if (/\b(diy wooden frame)\b/i.test(label)) return "DIY wooden frame"
  if (/\b(wrapped wood)\b/i.test(label)) return "Wrapped wood"
  if (/\b(frame|framed)\b/i.test(label)) return "With frame"
  return null
}

function optionStatusLabel(state: OptionState): string {
  if (state.status === "loading" || state.status === "idle") return "Loading order options"
  if (state.status === "error") return state.error
  return state.options.length ? `${state.options.length} order option${state.options.length === 1 ? "" : "s"}` : "No orderable option"
}

function quoteCents(option: PurchaseOption): number {
  const sourceAmount = Number.parseFloat(option.unitPrice ?? "")
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) return 0
  const sourceCurrency = (option.currency ?? "EUR").toUpperCase()
  const costSgd = sourceCurrency === "SGD" ? sourceAmount : sourceAmount * DEFAULT_EUR_TO_SGD_RATE
  const total = (costSgd / TARGET_GROSS_MARGIN) * (1 + GST_RATE)
  return roundUpToNinetyNineCents(total)
}

function roundUpToNinetyNineCents(amount: number): number {
  const cents = Math.ceil(amount * 100)
  const dollars = Math.floor(cents / 100)
  const ninetyNine = dollars * 100 + 99
  return cents <= ninetyNine ? ninetyNine : (dollars + 1) * 100 + 99
}

function readStoredCartDraftId(): string | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(CART_DRAFT_STORAGE_KEY)
  return value?.trim() || null
}

function writeStoredCartDraftId(orderDraftId: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CART_DRAFT_STORAGE_KEY, orderDraftId)
}

function clearStoredCartDraftId() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CART_DRAFT_STORAGE_KEY)
}
