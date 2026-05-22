"use client"

import { Suspense } from "react"
import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"
import { AdCreativeExperimentTracker } from "@/components/ad-creative-experiment-tracker"

export function SingleScreenPreviewShell() {
  const { state, sceneModel, guidedModel, actions } = usePreviewFlow()
  const selectedPreview = state.selectedSize ? state.dotPreviews[state.selectedSize.id] : null

  return (
    <LayoutFrame>
      <Suspense fallback={null}>
        <AdCreativeExperimentTracker />
      </Suspense>

      {/* Scene Zone */}
      <div className="relative flex-1">
        <PreviewScenePanel sceneModel={sceneModel} />
        {sceneModel.isProcessing && (
          <div className="pointer-events-none absolute right-[14%] top-[18%] z-20 flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-medium text-white/70 shadow-2xl shadow-black/20 backdrop-blur-md sm:right-[18%] sm:top-[16%]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <span>Building DOT preview</span>
          </div>
        )}
      </div>

      {/* Guided Control Zone */}
      <div className="relative h-[224px] shrink-0 px-4 pb-safe pt-4 sm:h-[214px]">
        <div className="mx-auto flex h-full max-w-md items-start justify-center">
          <GuidedControls
            guidedModel={guidedModel}
            selectedSize={state.selectedSize}
            previewOptions={selectedPreview?.options ?? []}
            selectedPreviewOptionId={selectedPreview?.selectedOptionId ?? null}
            onSelectImage={actions.selectImage}
            onRetry={actions.retry}
            onReset={actions.reset}
            onSetSize={actions.setSize}
            onSetPreviewOption={actions.setPreviewOption}
          />
        </div>
      </div>
    </LayoutFrame>
  )
}
