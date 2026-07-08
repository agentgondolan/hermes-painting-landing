"use client"

import { Suspense } from "react"
import { ProductSceneCanvas } from "@/components/product-scene-canvas"
import type { SceneDisplayModel } from "./preview-state"

interface PreviewScenePanelProps {
  sceneModel: SceneDisplayModel
}

export function PreviewScenePanel({ sceneModel }: PreviewScenePanelProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <Suspense fallback={<div className="text-white/30 text-sm">Loading scene…</div>}>
        <ProductSceneCanvas
          imageSrc={sceneModel.imageSrc}
          previewKind={sceneModel.previewKind}
          selectedSize={sceneModel.selectedSize}
          orientation={sceneModel.orientation ?? undefined}
          isProcessing={sceneModel.isProcessing}
          presentationScale={0.82}
          presentationOffsetY={0.82}
        />
      </Suspense>
    </div>
  )
}
