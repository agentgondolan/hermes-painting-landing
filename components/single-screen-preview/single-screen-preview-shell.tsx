"use client"

import { LayoutFrame } from "@/components/single-screen-preview/layout-frame"

export function SingleScreenPreviewShell() {
  return (
    <LayoutFrame>
      {/* Scene Zone - primary visual */}
      <div className="relative flex-1">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/10 px-6 py-3 text-sm text-white/30">
            3D Canvas Scene
          </div>
        </div>
      </div>

      {/* Guided Control Zone - anchored below */}
      <div className="relative px-4 pb-safe">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
          <p className="text-center text-sm text-white/50">
            Upload control zone
          </p>
        </div>
      </div>
    </LayoutFrame>
  )
}
