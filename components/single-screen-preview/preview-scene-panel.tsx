"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { SceneDisplayModel } from "./preview-state"

const ProductSceneCanvas = dynamic(
  () => import("@/components/product-scene-canvas").then((m) => ({ default: m.ProductSceneCanvas })),
  { ssr: false },
)

interface PreviewScenePanelProps {
  sceneModel: SceneDisplayModel
}

export function PreviewScenePanel({ sceneModel }: PreviewScenePanelProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {sceneModel.imageSrc && sceneModel.previewKind !== "none" ? (
        <Suspense fallback={<div className="text-white/30 text-sm">Loading scene…</div>}>
          <ProductSceneCanvas
            imageSrc={sceneModel.imageSrc}
            previewKind={sceneModel.previewKind}
            selectedSize={sceneModel.selectedSize}
            isProcessing={sceneModel.isProcessing}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="text-white/30 text-sm">Loading scene…</div>}>
          <ProductSceneCanvas
            imageSrc={null}
            previewKind="none"
            selectedSize={null}
            isProcessing={false}
          />
        </Suspense>
      )}
    </div>
  )
}
