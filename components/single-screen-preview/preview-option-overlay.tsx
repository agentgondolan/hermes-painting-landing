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
    <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+5.75rem)] z-30 flex w-[min(245px,72vw)] flex-col gap-2 sm:left-[12%] sm:top-[14%] sm:w-[min(270px,72vw)]">
      {isProcessing && (
        <div className="pointer-events-none flex w-fit items-center gap-2 rounded-full border border-[#9432c1]/15 bg-white/76 px-3 py-2 text-[11px] font-bold text-[#9432c1] shadow-[0_18px_44px_rgba(148,50,193,0.16)] backdrop-blur-md">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#9432c1]/18 border-t-[#9432c1]" />
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
                  ? "border-[#9432c1] bg-[#9432c1] text-white"
                  : "border-[#9432c1]/15 bg-white/76 text-[#2e2d2c]/64 hover:bg-[#f0dcfa] hover:text-[#9432c1]"
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
