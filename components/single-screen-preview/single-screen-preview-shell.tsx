"use client"

import { Suspense, useEffect, useState } from "react"
import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"
import { PreviewOptionOverlay } from "./preview-option-overlay"
import { PurchasePanel } from "./purchase-panel"
import { AccountPanel } from "@/components/account/account-panel"
import { AdCreativeExperimentTracker } from "@/components/ad-creative-experiment-tracker"
import { captureEvent } from "@/lib/analytics/posthog"
import {
  consumeMagicTokenFromUrl,
  consumeVerifiedIdentityNoticeFromUrl,
  fetchVerifiedIdentityPreviews,
  readVerifiedIdentity,
  type StoredIdentity,
} from "@/lib/identity/browser"
import { isAccountPreviewSaved, upsertAccountPreview } from "@/lib/account/preview-registry"

type MagicLinkNotice = {
  kind: "success" | "error"
  message: string
} | null

export function SingleScreenPreviewShell() {
  const { state, sceneModel, guidedModel, actions } = usePreviewFlow()
  const { hydrateSourceImage } = actions
  const [magicLinkNotice, setMagicLinkNotice] = useState<MagicLinkNotice>(null)
  const [magicLinkIdentity, setMagicLinkIdentity] = useState<StoredIdentity | null>(null)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [saveEmailFlowNonce, setSaveEmailFlowNonce] = useState(0)
  const [currentPreviewSaved, setCurrentPreviewSaved] = useState(false)
  const selectedPreview = state.selectedSize ? state.dotPreviews[state.selectedSize.id] : null

  useEffect(() => {
    const restoredIdentity = consumeVerifiedIdentityNoticeFromUrl()
    if (restoredIdentity) {
      setMagicLinkIdentity(restoredIdentity)
      setMagicLinkNotice({
        kind: "success",
        message: `Verified ${restoredIdentity.email}. Your current preview is saved.`,
      })
      return
    }

    const storedIdentity = readVerifiedIdentity()
    if (storedIdentity) {
      setMagicLinkIdentity(storedIdentity)
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
  }, [])

  useEffect(() => {
    if (!magicLinkIdentity || !selectedPreview || selectedPreview.status !== "ready" || !state.selectedSize) {
      setCurrentPreviewSaved(false)
      return
    }

    const registered = upsertAccountPreview(magicLinkIdentity.email, selectedPreview, state.selectedSize)
    setCurrentPreviewSaved(Boolean(registered) || isAccountPreviewSaved(magicLinkIdentity.email, selectedPreview.previewId))
    if (!registered) return

    captureEvent("account_preview_registered", {
      preview_id: registered.previewId,
      selected_size: registered.sizeId,
    })
  }, [magicLinkIdentity, selectedPreview, state.selectedSize])

  useEffect(() => {
    if (!magicLinkIdentity || !selectedPreview?.previewId) return
    let cancelled = false

    fetchVerifiedIdentityPreviews(magicLinkIdentity).then(
      async (library) => {
        if (cancelled) return
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
        <button
          type="button"
          onClick={() => setAccountPanelOpen((open) => !open)}
          className="inline-flex max-w-[min(72vw,20rem)] items-center gap-2 rounded-[1.25rem] border border-[#9432c1]/15 bg-white/88 px-3.5 py-2 text-left text-[#9432c1] shadow-[0_14px_34px_rgba(148,50,193,0.16)] backdrop-blur-xl transition hover:bg-white"
          aria-label={magicLinkIdentity ? `Verified account ${magicLinkIdentity.email}` : "Account"}
          aria-expanded={accountPanelOpen}
        >
          {magicLinkIdentity ? (
            <span className="flex min-w-0 flex-col leading-none">
              <span className="font-black">Verified</span>
              <span className="mt-1 max-w-[12rem] truncate text-[10px] font-bold text-[#9432c1]/58 sm:max-w-[14rem]">
                {magicLinkIdentity.email}
              </span>
            </span>
          ) : (
            <span className="text-xs font-black">Account</span>
          )}
        </button>
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
          startEmailFlowNonce={saveEmailFlowNonce}
          onClose={() => setAccountPanelOpen(false)}
        />
      ) : null}

      {/* Bottom Modal Zone */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-4">
        <div className="pointer-events-auto mx-auto max-h-[min(62dvh,34rem)] max-w-md overflow-y-auto rounded-[2rem] border border-[#9432c1]/15 bg-white/82 p-3 text-[#2e2d2c] shadow-[0_28px_80px_rgba(148,50,193,0.22)] backdrop-blur-xl sm:p-4">
          <div className="flex min-h-[168px] flex-col items-center justify-center gap-3">
            <PurchasePanel
              selectedSize={state.selectedSize}
              selectedPreview={selectedPreview ?? null}
              verifiedIdentity={magicLinkIdentity}
              currentPreviewSaved={currentPreviewSaved}
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
              onSetSize={actions.setSize}
            />
          </div>
        </div>
      </div>
    </LayoutFrame>
  )
}
