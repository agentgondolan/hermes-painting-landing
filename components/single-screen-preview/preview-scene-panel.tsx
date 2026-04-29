"use client"

import { Suspense } from "react"
import { ProductSceneCanvas } from "@/components/product-scene-canvas"
import type { SceneDisplayModel } from "./preview-state"

interface PreviewScenePanelProps {
  sceneModel: SceneDisplayModel
}

export function PreviewScenePanel({ sceneModel }: PreviewScenePanelProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Suspense fallback={<div className="text-white/30 text-sm">Loading scene…</div>}>
        <ProductSceneCanvas
          imageSrc={sceneModel.imageSrc}
          previewKind={sceneModel.previewKind}
          selectedSize={sceneModel.selectedSize}
          isProcessing={sceneModel.isProcessing}
        />
      </Suspense>
    </div>
  )
}
