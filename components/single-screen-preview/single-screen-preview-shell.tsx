"use client"

import { Suspense } from "react"
import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"
import { AdCreativeExperimentTracker } from "@/components/ad-creative-experiment-tracker"

export function SingleScreenPreviewShell() {
  const { state, sceneModel, guidedModel, actions } = usePreviewFlow()

  return (
    <LayoutFrame>
      <Suspense fallback={null}>
        <AdCreativeExperimentTracker />
      </Suspense>

      {/* Scene Zone */}
      <div className="relative flex-1">
        <PreviewScenePanel sceneModel={sceneModel} />
      </div>

      {/* Guided Control Zone */}
      <div className="relative h-[224px] shrink-0 px-4 pb-safe pt-4 sm:h-[214px]">
        <div className="mx-auto flex h-full max-w-md items-start justify-center">
          <GuidedControls
            guidedModel={guidedModel}
            selectedSize={state.selectedSize}
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
