"use client"

import { useEffect, useMemo, useState } from "react"
import { createPreviewClient, type BffPurchaseOptionsResult } from "@/lib/mgeveryday/browser-preview"
import { captureEvent } from "@/lib/analytics/posthog"
import type { DotPreviewResult, FrameSizeOption } from "./preview-state"

type PurchaseOption = BffPurchaseOptionsResult["purchaseOptions"][number]

type PurchasePanelProps = {
  selectedSize: FrameSizeOption | null
  selectedPreview: DotPreviewResult | null
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

export function PurchasePanel({ selectedSize, selectedPreview }: PurchasePanelProps) {
  const previewId = selectedPreview?.previewId ?? null
  const selectedPreviewOptionId = selectedPreview?.selectedOptionId ?? null
  const [purchaseOptions, setPurchaseOptions] = useState<PurchaseOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!previewId || selectedPreview?.status !== "ready") {
      setPurchaseOptions([])
      setLoadingOptions(false)
      setError(null)
      return
    }

    const client = createPreviewClient()
    if (!client) {
      setPurchaseOptions([])
      setError("Checkout is not available in local fallback mode.")
      return
    }

    setLoadingOptions(true)
    setError(null)

    client.getPurchaseOptions(previewId).then(
      (result) => {
        if (cancelled) return
        setPurchaseOptions(result.purchaseOptions)
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
  }, [previewId, selectedPreview?.status, selectedSize?.id])

  const selectedPurchaseOption = useMemo(() => {
    if (!selectedPreviewOptionId) return purchaseOptions[0] ?? null
    return purchaseOptions.find((option) => option.previewOptionId === selectedPreviewOptionId) ?? purchaseOptions[0] ?? null
  }, [purchaseOptions, selectedPreviewOptionId])

  const quote = useMemo<Quote>(() => {
    if (loadingOptions) return { amount: "", currency: "SGD", loading: true, error: null }
    if (!selectedPurchaseOption) {
      return {
        amount: "",
        currency: "SGD",
        loading: false,
        error: purchaseOptions.length === 0 ? "Waiting for order options…" : "No matching order option.",
      }
    }

    const sourceAmount = Number.parseFloat(selectedPurchaseOption.unitPrice ?? "")
    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
      return { amount: "", currency: "SGD", loading: false, error: "Missing production cost." }
    }

    const sourceCurrency = (selectedPurchaseOption.currency ?? "EUR").toUpperCase()
    const costSgd = sourceCurrency === "SGD" ? sourceAmount : sourceAmount * DEFAULT_EUR_TO_SGD_RATE
    const total = (costSgd / TARGET_GROSS_MARGIN) * (1 + GST_RATE)
    const cents = roundUpToNinetyNineCents(total)
    return { amount: (cents / 100).toFixed(2), currency: "SGD", loading: false, error: null }
  }, [loadingOptions, purchaseOptions.length, selectedPurchaseOption])

  const handleCheckout = async () => {
    if (!previewId || !selectedPreviewOptionId || !selectedPurchaseOption || quote.error) return

    setCheckoutLoading(true)
    setError(null)
    captureEvent("stripe_checkout_clicked", {
      preview_id: previewId,
      preview_option_id: selectedPreviewOptionId,
      selected_size: selectedSize?.id,
      product: selectedPurchaseOption.product ?? "DOT",
      amount_sgd: quote.amount,
    })

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_id: previewId,
          preview_option_id: selectedPreviewOptionId,
          selected_size: selectedSize?.id,
          purchase_option: selectedPurchaseOption,
        }),
      })
      const payload = await response.json().catch(() => null) as { url?: string; error?: string; detail?: string } | null
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.detail || payload?.error || `Checkout failed (${response.status})`)
      }
      window.location.assign(payload.url)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed"
      setError(message)
      setCheckoutLoading(false)
      captureEvent("stripe_checkout_failed", {
        preview_id: previewId,
        preview_option_id: selectedPreviewOptionId,
        selected_size: selectedSize?.id,
        error_message: message,
      })
    }
  }

  if (!selectedPreview || selectedPreview.status !== "ready") {
    return null
  }

  return (
    <div className="pointer-events-auto w-full rounded-3xl border border-white/15 bg-black/35 p-3 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Ready to print</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <p className="text-lg font-semibold text-white">
              {quote.loading ? "Loading…" : quote.error ? "—" : `${quote.currency} ${quote.amount}`}
            </p>
            <p className="truncate text-xs text-white/45">{selectedSize?.label ?? "Custom size"}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-white/35">
            {selectedPurchaseOption?.label ?? "Custom paint-by-number kit"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheckout}
          disabled={checkoutLoading || loadingOptions || Boolean(quote.error) || !selectedPurchaseOption}
          className="shrink-0 rounded-full bg-[#52b788] px-5 py-2.5 text-sm font-semibold text-[#07140f] transition hover:bg-[#74c69d] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
        >
          {checkoutLoading ? "Opening…" : "Checkout"}
        </button>
      </div>

      {(error || quote.error) && (
        <p className="mt-2 text-xs text-amber-200/80">{error || quote.error}</p>
      )}
    </div>
  )
}

function roundUpToNinetyNineCents(amount: number): number {
  const cents = Math.ceil(amount * 100)
  const dollars = Math.floor(cents / 100)
  const ninetyNine = dollars * 100 + 99
  return cents <= ninetyNine ? ninetyNine : (dollars + 1) * 100 + 99
}
