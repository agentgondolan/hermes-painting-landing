"use client"

import { useRef, useEffect } from "react"
import type { GuidedControlModel } from "./preview-state"
import type { FrameSizeOption } from "@/lib/image-processing"
import { FRAME_SIZE_OPTIONS } from "@/lib/image-processing"
import { UX_COPY, ACCEPTED_MIME_TYPES } from "./constants"

interface GuidedControlsProps {
  guidedModel: GuidedControlModel
  onSelectImage: (file: File) => void
  onRetry: () => void
  onReset: () => void
  onSetSize: (size: FrameSizeOption) => void
}

export function GuidedControls({
  guidedModel,
  onSelectImage,
  onRetry,
  onReset,
  onSetSize,
}: GuidedControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const mimeCheck = ACCEPTED_MIME_TYPES.includes(
        file.type as (typeof ACCEPTED_MIME_TYPES)[number],
      )
      if (mimeCheck) {
        onSelectImage(file)
      }
    }
  }

  const triggerUpload = () => fileInputRef.current?.click()

  return (
    <div className="flex flex-col items-center gap-3 transition-all duration-300">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Upload */}
      {guidedModel.showUpload && (
        <button
          onClick={triggerUpload}
          className="rounded-full bg-white/10 border border-white/20 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/20"
        >
          {UX_COPY.upload}
        </button>
      )}

      {/* Progress */}
      {guidedModel.showProgress && (
        <div className="flex flex-col items-center gap-2">
          <div className="h-1 w-24 animate-pulse rounded-full bg-white/20" />
          <p className="text-xs text-white/40">{guidedModel.helperText}</p>
        </div>
      )}

      {/* Replace */}
      {guidedModel.showReplace && (
        <button
          onClick={triggerUpload}
          className="text-xs text-white/30 underline hover:text-white/60"
        >
          {UX_COPY.replaceImage}
        </button>
      )}

      {/* Size selector */}
      {guidedModel.showSizeSelector && (
        <div className="flex gap-2">
          {FRAME_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onSetSize(opt)}
              className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 transition hover:bg-white/10"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Buy CTA */}
      {guidedModel.showBuyCta && (
        <button className="rounded-full bg-[#2d6a4f] border-none px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#40916c]">
          {UX_COPY.buyCta}
        </button>
      )}

      {/* Error */}
      {guidedModel.showError && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-red-300/80">{guidedModel.helperText}</p>
          <button
            onClick={onRetry}
            className="text-xs text-white/50 underline hover:text-white/80"
          >
            {UX_COPY.retry}
          </button>
        </div>
      )}

      {/* Helper text when idle */}
      {guidedModel.showUpload && (
        <p className="text-xs text-white/20">{guidedModel.helperText}</p>
      )}
    </div>
  )
}
