"use client"

import { useRef } from "react"
import type { GuidedControlModel, PreviewOptionChoice } from "./preview-state"
import type { FrameSizeOption } from "@/lib/image-processing"
import { FRAME_SIZE_OPTIONS } from "@/lib/image-processing"
import { captureEvent } from "@/lib/analytics/posthog"
import { UX_COPY, ACCEPTED_MIME_TYPES } from "./constants"

interface GuidedControlsProps {
  guidedModel: GuidedControlModel
  selectedSize: FrameSizeOption | null
  previewOptions: PreviewOptionChoice[]
  selectedPreviewOptionId: string | null
  onSelectImage: (file: File) => void
  onRetry: () => void
  onReset: () => void
  onSetSize: (size: FrameSizeOption) => void
  onSetPreviewOption: (sizeId: string, optionId: string) => void
}

export function GuidedControls({
  guidedModel,
  selectedSize,
  previewOptions,
  selectedPreviewOptionId,
  onSelectImage,
  onRetry,
  onReset,
  onSetSize,
  onSetPreviewOption,
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

  const handleSetPreviewOption = (option: PreviewOptionChoice) => {
    if (!selectedSize) return
    captureEvent('preview_option_selected_clicked', {
      selected_size: selectedSize.id,
      preview_option_id: option.previewOptionId,
      preview_option_label: option.label,
      orderable: option.orderable,
    })
    onSetPreviewOption(selectedSize.id, option.previewOptionId)
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
    <div className="flex min-h-[190px] w-full flex-col items-center gap-3 transition-all duration-300">
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
          onClick={() => triggerUpload('initial_upload')}
          className="rounded-full bg-white/10 border border-white/20 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/20"
        >
          {UX_COPY.upload}
        </button>
      )}

      {/* Replace */}
      {guidedModel.showReplace && (
        <button
          onClick={() => triggerUpload('replace_photo')}
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
              onClick={() => handleSetSize(opt)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                selectedSize?.id === opt.id
                  ? "bg-white/20 border-white/40 text-white"
                  : "border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}


      {/* Preview option selector */}
      {guidedModel.showPreviewOptions && (
        <div className="flex max-w-full flex-wrap justify-center gap-2">
          {previewOptions.map((option, index) => (
            <button
              key={option.previewOptionId}
              onClick={() => handleSetPreviewOption(option)}
              title={option.description ?? option.label}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                selectedPreviewOptionId === option.previewOptionId
                  ? "border-[#95d5b2]/70 bg-[#2d6a4f]/45 text-white"
                  : "border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.label || `Option ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Buy CTA */}
      {guidedModel.showBuyCta && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-white/55">{guidedModel.helperText}</p>
          {guidedModel.productDetail && (
            <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/50">
              {guidedModel.productDetail}
            </p>
          )}
          <button
            onClick={handleBuyClick}
            className="rounded-full bg-[#2d6a4f] border-none px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#40916c]"
          >
            {UX_COPY.buyCta}
          </button>
        </div>
      )}

      {/* Error */}
      {guidedModel.showError && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-red-300/80">{guidedModel.helperText}</p>
          <button
            onClick={handleRetry}
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
