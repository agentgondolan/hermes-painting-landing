"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createPreviewClient,
  type BffPurchaseOptionsResult,
} from "@/lib/mgeveryday/browser-preview"
import { captureEvent } from "@/lib/analytics/posthog"
import type { DotPreviewResult, FrameSizeOption } from "./preview-state"
import { persistCheckoutSelection, readStoredCheckoutState } from "./checkout-persistence"
import { type StoredIdentity } from "@/lib/identity/browser"

type PurchaseOption = BffPurchaseOptionsResult["purchaseOptions"][number]

type PurchasePanelProps = {
  selectedSize: FrameSizeOption | null
  selectedPreview: DotPreviewResult | null
  verifiedIdentity?: StoredIdentity | null
  currentPreviewSaved?: boolean
  onOpenAccountPanel?: () => void
  // onSaveCurrentPreview?: () => void
  onSaveCurrentPreview?: () => boolean | void | Promise<boolean | void>
}

type Quote = {
  amount: string
  currency: string
  loading: boolean
  error: string | null
}

const DEFAULT_EUR_TO_SGD_RATE = 1.46
const TARGET_GROSS_MARGIN = 0.5
const GST_RATE = 0.09

export function PurchasePanel({ selectedSize, selectedPreview, verifiedIdentity = null, currentPreviewSaved = false, onOpenAccountPanel, onSaveCurrentPreview }: PurchasePanelProps) {
  const previewId = selectedPreview?.previewId ?? null
  const selectedPreviewOptionId = selectedPreview?.selectedOptionId ?? null
  const [purchaseOptions, setPurchaseOptions] = useState<PurchaseOption[]>([])
  const [selectedPurchaseOptionId, setSelectedPurchaseOptionId] = useState<string | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!verifiedIdentity) return
    captureEvent("magic_link_verified", {
      preview_id: verifiedIdentity.previewId,
    })
  }, [verifiedIdentity])

  useEffect(() => {
    const restored = readStoredCheckoutState()
    if (restored?.selectedPurchaseOptionId) {
      setSelectedPurchaseOptionId(restored.selectedPurchaseOptionId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!previewId || selectedPreview?.status !== "ready") {
      setPurchaseOptions([])
      setSelectedPurchaseOptionId(null)
      setLoadingOptions(false)
      setError(null)
      return
    }

    const client = createPreviewClient()
    if (!client) {
      setPurchaseOptions([])
      setSelectedPurchaseOptionId(null)
      setError("Checkout is not available in local fallback mode.")
      return
    }

    setLoadingOptions(true)
    setError(null)

    client.pollPurchaseOptions(previewId).then(
      (result) => {
        if (cancelled) return
        setPurchaseOptions(result.purchaseOptions)
        setSelectedPurchaseOptionId((current) => {
          if (current && result.purchaseOptions.some((option) => optionIdentity(option) === current)) return current
          const matchingPreviewOptions = result.purchaseOptions.filter((option) => !selectedPreviewOptionId || option.previewOptionId === selectedPreviewOptionId)
          return optionIdentity(matchingPreviewOptions[0] ?? result.purchaseOptions[0] ?? null)
        })
        captureEvent("mge_purchase_options_loaded", {
          preview_id: previewId,
          option_count: result.purchaseOptions.length,
          selected_size: selectedSize?.id,
        })
      },
      (err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Could not load purchase options"
        setPurchaseOptions([])
        setSelectedPurchaseOptionId(null)
        setError(message)
        captureEvent("mge_purchase_options_failed", {
          preview_id: previewId,
          selected_size: selectedSize?.id,
          error_message: message,
        })
      },
    ).finally(() => {
      if (!cancelled) setLoadingOptions(false)
    })

    return () => {
      cancelled = true
    }
  }, [previewId, selectedPreview?.status, selectedPreviewOptionId, selectedSize?.id])

  const visiblePurchaseOptions = useMemo(() => {
    const matchingPreviewOptions = purchaseOptions.filter((option) => !selectedPreviewOptionId || option.previewOptionId === selectedPreviewOptionId)
    const scopedOptions = matchingPreviewOptions.length ? matchingPreviewOptions : purchaseOptions
    const standardOptions = scopedOptions.filter((option) => !isExpressOption(option))
    return standardOptions.length ? standardOptions : scopedOptions
  }, [purchaseOptions, selectedPreviewOptionId])

  const selectedPurchaseOption = useMemo(() => {
    if (!visiblePurchaseOptions.length) return null
    if (!selectedPurchaseOptionId) return visiblePurchaseOptions[0]
    return visiblePurchaseOptions.find((option) => optionIdentity(option) === selectedPurchaseOptionId) ?? visiblePurchaseOptions[0]
  }, [visiblePurchaseOptions, selectedPurchaseOptionId])

  const quote = useMemo<Quote>(() => {
    if (loadingOptions) return { amount: "", currency: "SGD", loading: true, error: null }
    return quoteForOption(selectedPurchaseOption, visiblePurchaseOptions.length)
  }, [loadingOptions, selectedPurchaseOption, visiblePurchaseOptions.length])

  useEffect(() => {
    setSaveStatus(currentPreviewSaved ? "saved" : "idle")
  }, [currentPreviewSaved, previewId, selectedSize?.id])

  const handleSave = async () => {
    if (!previewId || saveStatus === "saving" || currentPreviewSaved) return
    if (!verifiedIdentity) {
      onOpenAccountPanel?.()
      setError(null)
      return
    }

    setSaveStatus("saving")
    setError(null)
    try {
      const saved = await onSaveCurrentPreview?.()
      setSaveStatus(saved === false ? "idle" : "saved")
    } catch (err) {
      setSaveStatus("idle")
      setError(err instanceof Error ? err.message : "Could not save preview")
    }
  }

  const handleSelectMode = (option: PurchaseOption) => {
    const nextId = optionIdentity(option)
    setSelectedPurchaseOptionId(nextId)
    persistCheckoutSelection({ selectedPurchaseOptionId: nextId, checkoutInProgress: checkoutLoading })
    setError(null)
    captureEvent("mge_purchase_option_selected", {
      preview_id: previewId,
      preview_option_id: option.previewOptionId,
      purchase_option_id: nextId,
      production_speed: option.productionSpeedCode ?? option.productionSpeedLabel,
      selected_size: selectedSize?.id,
    })
  }

  const handleCheckout = async () => {
    if (!previewId || !selectedPurchaseOption || quote.error) return
    if (!verifiedIdentity) {
      onOpenAccountPanel?.()
      setError("Verify your email from Account first, then checkout.")
      return
    }

    setCheckoutLoading(true)
    setError(null)

    const purchaseOptionId = optionIdentity(selectedPurchaseOption)
    captureEvent("stripe_checkout_clicked", {
      preview_id: previewId,
      preview_option_id: selectedPurchaseOption.previewOptionId,
      purchase_option_id: purchaseOptionId,
      selected_size: selectedSize?.id,
      production_speed: selectedPurchaseOption.productionSpeedCode ?? selectedPurchaseOption.productionSpeedLabel,
      product: selectedPurchaseOption.product ?? "DOT",
      amount_sgd: quote.amount,
    })

    persistCheckoutSelection({
      selectedPurchaseOptionId: purchaseOptionId,
      checkoutInProgress: true,
    })
    window.location.assign("/checkout")
  }

  if (!selectedPreview || selectedPreview.status !== "ready") {
    return null
  }

  const panelClassName = "w-full rounded-[1.5rem] border border-[#9432c1]/12 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
  return (
    <div className={panelClassName}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-extrabold text-[#2e2d2c]">
              {quote.loading ? "Loading…" : quote.error ? "—" : `${quote.currency} ${quote.amount}`}
            </p>
            <p className="truncate text-xs font-semibold text-[#9432c1]/70">{selectedSize?.label ?? "Custom size"}</p>
          </div>
        </div>
      </div>

      <div className={`mt-3 grid gap-2 ${currentPreviewSaved ? "grid-cols-1" : "grid-cols-2"}`}>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkoutLoading || loadingOptions || Boolean(quote.error) || !selectedPurchaseOption}
          className="rounded-full bg-[#9432c1] px-4 py-3 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.24)] transition hover:bg-[#7f28aa] disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/10 disabled:text-[#2e2d2c]/35"
        >
          {checkoutLoading ? "Opening…" : "Checkout"}
        </button>
        {!currentPreviewSaved ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={!previewId || saveStatus === "saving"}
            className="rounded-full border border-[#9432c1]/16 bg-white/76 px-4 py-3 text-sm font-extrabold text-[#9432c1] transition hover:border-[#9432c1]/35 hover:bg-white disabled:cursor-not-allowed disabled:border-[#2e2d2c]/8 disabled:text-[#2e2d2c]/35"
          >
            {saveStatus === "saving" ? "Saving…" : "Save"}
          </button>
        ) : null}
      </div>

      {visiblePurchaseOptions.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visiblePurchaseOptions.map((option) => {
            const id = optionIdentity(option)
            const selected = id === optionIdentity(selectedPurchaseOption)
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectMode(option)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${
                  selected ? "bg-[#9432c1] text-white" : "bg-[#2e2d2c]/6 text-[#2e2d2c]/55 hover:bg-[#2e2d2c]/10"
                }`}
              >
                {modeLabel(option)}
              </button>
            )
          })}
        </div>
      ) : null}

      {(error || quote.error) && (
        <p className="mt-2 text-xs font-medium text-[#8a4a00]">{error || quote.error}</p>
      )}
    </div>
  )
}

function quoteForOption(option: PurchaseOption | null, optionCount: number): Quote {
  if (!option) {
    return {
      amount: "",
      currency: "SGD",
      loading: false,
      error: optionCount === 0 ? "Waiting for order options…" : "No matching order option.",
    }
  }

  const sourceAmount = Number.parseFloat(option.unitPrice ?? "")
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    return { amount: "", currency: "SGD", loading: false, error: "Missing production cost." }
  }

  const sourceCurrency = (option.currency ?? "EUR").toUpperCase()
  const costSgd = sourceCurrency === "SGD" ? sourceAmount : sourceAmount * DEFAULT_EUR_TO_SGD_RATE
  const total = (costSgd / TARGET_GROSS_MARGIN) * (1 + GST_RATE)
  const cents = roundUpToNinetyNineCents(total)
  return { amount: (cents / 100).toFixed(2), currency: "SGD", loading: false, error: null }
}

function optionIdentity(option: PurchaseOption | null): string | null {
  if (!option) return null
  return option.purchaseOptionId || `${option.previewOptionId}:${option.productionSpeedCode ?? option.productionSpeedLabel ?? option.orderLine?.sku ?? option.unitPrice ?? "option"}`
}

function optionSku(option: PurchaseOption): string {
  return typeof option.sku === "string" && option.sku ? option.sku : String(option.orderLine?.sku ?? option.purchaseOptionId)
}

function isExpressOption(option: PurchaseOption): boolean {
  const speed = `${option.productionSpeedCode ?? ""} ${option.productionSpeedLabel ?? ""} ${option.label ?? ""}`
  return /express/i.test(speed)
}

function modeLabel(option: PurchaseOption): string {
  return option.productionSpeedLabel || option.productionSpeedCode || option.label?.split("/").at(-1)?.trim() || "Option"
}

function roundUpToNinetyNineCents(amount: number): number {
  const cents = Math.ceil(amount * 100)
  const dollars = Math.floor(cents / 100)
  const ninetyNine = dollars * 100 + 99
  return cents <= ninetyNine ? ninetyNine : (dollars + 1) * 100 + 99
}
