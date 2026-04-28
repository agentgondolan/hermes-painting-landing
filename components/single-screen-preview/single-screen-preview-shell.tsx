"use client"

import { LayoutFrame } from "./layout-frame"
import { usePreviewFlow } from "./use-preview-flow"
import { PreviewScenePanel } from "./preview-scene-panel"
import { GuidedControls } from "./guided-controls"

export function SingleScreenPreviewShell() {
  const { state, sceneModel, guidedModel, actions } = usePreviewFlow()

  return (
    <LayoutFrame>
      {/* Scene Zone */}
      <div className="relative flex-1">
        <PreviewScenePanel sceneModel={sceneModel} />
      </div>

      {/* Guided Control Zone */}
      <div className="relative px-4 pb-safe pt-4">
        <div className="mx-auto max-w-md">
          <GuidedControls
            guidedModel={guidedModel}
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
