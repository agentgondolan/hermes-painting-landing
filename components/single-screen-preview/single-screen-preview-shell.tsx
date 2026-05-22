"use client"

import { Suspense } from "react"
import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"
import { PreviewOptionOverlay } from "./preview-option-overlay"
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
        <PreviewOptionOverlay
          isProcessing={sceneModel.isProcessing}
          previewOptions={selectedPreview?.options ?? []}
          selectedPreviewOptionId={selectedPreview?.selectedOptionId ?? null}
          selectedSize={state.selectedSize}
          onSetPreviewOption={actions.setPreviewOption}
        />
      </div>

      {/* Guided Control Zone */}
      <div className="relative h-[174px] shrink-0 px-4 pb-safe pt-3 sm:h-[184px]">
        <div className="mx-auto flex h-full max-w-md items-start justify-center">
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
    </LayoutFrame>
  )
}
