"use client"

import { Suspense } from "react"
import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"
import { PreviewOptionOverlay } from "./preview-option-overlay"
import { PurchasePanel } from "./purchase-panel"
import { AdCreativeExperimentTracker } from "@/components/ad-creative-experiment-tracker"

export function SingleScreenPreviewShell() {
  const { state, sceneModel, guidedModel, actions } = usePreviewFlow()
  const selectedPreview = state.selectedSize ? state.dotPreviews[state.selectedSize.id] : null

  return (
    <LayoutFrame>
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

      {/* Bottom Modal Zone */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 sm:px-4">
        <div className="pointer-events-auto mx-auto max-h-[min(62dvh,34rem)] max-w-md overflow-y-auto rounded-[2rem] border border-white/15 bg-black/82 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-4">
          <div className="flex min-h-[168px] flex-col items-center justify-center gap-3">
            <PurchasePanel selectedSize={state.selectedSize} selectedPreview={selectedPreview ?? null} />
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
