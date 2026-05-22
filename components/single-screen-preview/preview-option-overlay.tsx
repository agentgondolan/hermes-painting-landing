"use client"

import type { FrameSizeOption, PreviewOptionChoice } from "./preview-state"
import { captureEvent } from "@/lib/analytics/posthog"

interface PreviewOptionOverlayProps {
  isProcessing: boolean
  previewOptions: PreviewOptionChoice[]
  selectedPreviewOptionId: string | null
  selectedSize: FrameSizeOption | null
  onSetPreviewOption: (sizeId: string, optionId: string) => void
}

export function PreviewOptionOverlay({
  isProcessing,
  previewOptions,
  selectedPreviewOptionId,
  selectedSize,
  onSetPreviewOption,
}: PreviewOptionOverlayProps) {
  const showOptions = !isProcessing && previewOptions.length > 1

  if (!isProcessing && !showOptions) return null

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

  return (
    <div className="absolute left-4 top-5 z-20 flex w-[min(245px,72vw)] flex-col gap-2 sm:left-[12%] sm:top-[14%] sm:w-[min(270px,72vw)]">
      {isProcessing && (
        <div className="pointer-events-none flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-2 text-[11px] font-medium text-white/70 shadow-2xl shadow-black/20 backdrop-blur-md">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          <span>Building DOT preview</span>
        </div>
      )}

      {showOptions && (
        <div className="flex max-w-full flex-col items-start gap-2">
          {previewOptions.map((option, index) => (
            <button
              key={option.previewOptionId}
              onClick={() => handleSetPreviewOption(option)}
              title={option.description ?? option.label}
              className={`rounded-full border px-3.5 py-2 text-xs font-medium shadow-2xl shadow-black/20 backdrop-blur-md transition ${
                selectedPreviewOptionId === option.previewOptionId
                  ? "border-[#95d5b2]/70 bg-[#2d6a4f]/60 text-white"
                  : "border-white/20 bg-black/25 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.label || `Option ${index + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
