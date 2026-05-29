"use client"

import { useRef } from "react"
import type { GuidedControlModel } from "./preview-state"
import type { FrameSizeOption } from "@/lib/image-processing"
import { FRAME_SIZE_OPTIONS } from "@/lib/image-processing"
import { captureEvent } from "@/lib/analytics/posthog"
import { UX_COPY, ACCEPTED_MIME_TYPES } from "./constants"

interface GuidedControlsProps {
  guidedModel: GuidedControlModel
  selectedSize: FrameSizeOption | null
  selectedPreviewOptionId: string | null
  onSelectImage: (file: File) => void
  onRetry: () => void
  onReset: () => void
  onSetSize: (size: FrameSizeOption) => void
}

export function GuidedControls({
  guidedModel,
  selectedSize,
  selectedPreviewOptionId,
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

      captureEvent('preview_file_selected', {
        accepted: mimeCheck,
        file_type: file.type || 'unknown',
        file_size_mb: Number((file.size / 1024 / 1024).toFixed(2)),
        selected_size: selectedSize?.id,
      })

      if (mimeCheck) {
        onSelectImage(file)
      }
    }
  }

  const triggerUpload = (source: 'initial_upload' | 'replace_photo') => {
    captureEvent('preview_upload_clicked', {
      source,
      selected_size: selectedSize?.id,
    })
    fileInputRef.current?.click()
  }

  const handleSetSize = (size: FrameSizeOption) => {
    captureEvent('preview_size_selected', {
      size_id: size.id,
      size_label: size.label,
    })
    onSetSize(size)
  }

  const handleRetry = () => {
    captureEvent('preview_retry_clicked', {
      selected_size: selectedSize?.id,
    })
    onRetry()
  }

  const handleBuyClick = () => {
    captureEvent('preview_order_clicked', {
      selected_size: selectedSize?.id,
      preview_option_id: selectedPreviewOptionId ?? undefined,
    })
  }

  return (
    <div className="flex min-h-0 w-full flex-col items-center gap-2 transition-all duration-300">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Upload */}
      {guidedModel.showUpload && (
        <div className="flex max-w-[22rem] flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#9432c1]/70">Dottingo custom kit</p>
          <h1 className="text-balance text-2xl font-black leading-[0.95] tracking-[-0.04em] text-[#2e2d2c] sm:text-3xl">
            Turn your favorite photo into calming dot art.
          </h1>
        </div>
      )}

      {guidedModel.showUpload && (
        <button
          onClick={() => triggerUpload('initial_upload')}
          className="rounded-full border border-[#9432c1]/15 bg-[#9432c1] px-6 py-3 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.28)] transition hover:bg-[#7f28aa]"
        >
          {UX_COPY.upload}
        </button>
      )}

      {/* Replace */}
      {guidedModel.showReplace && (
        <button
          onClick={() => triggerUpload('replace_photo')}
          className="text-xs font-semibold text-[#9432c1]/55 underline hover:text-[#9432c1]"
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
              onClick={() => handleSetSize(opt)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                selectedSize?.id === opt.id
                  ? "border-[#9432c1] bg-[#9432c1] text-white shadow-[0_10px_26px_rgba(148,50,193,0.22)]"
                  : "border-[#9432c1]/18 bg-white/60 text-[#2e2d2c]/70 hover:bg-[#f0dcfa] hover:text-[#9432c1]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Buy CTA */}
      {guidedModel.showBuyCta && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleBuyClick}
            className="rounded-full border-none bg-[#9432c1] px-8 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.28)] transition hover:bg-[#7f28aa]"
          >
            {UX_COPY.buyCta}
          </button>
        </div>
      )}

      {/* Error */}
      {guidedModel.showError && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-[#b42318]">{guidedModel.helperText}</p>
          <button
            onClick={handleRetry}
            className="text-xs font-semibold text-[#9432c1]/65 underline hover:text-[#9432c1]"
          >
            {UX_COPY.retry}
          </button>
        </div>
      )}

    </div>
  )
}
