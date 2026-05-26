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
  const [selectedPurchaseOptionId, setSelectedPurchaseOptionId] = useState<string | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    client.getPurchaseOptions(previewId).then(
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
    return matchingPreviewOptions.length ? matchingPreviewOptions : purchaseOptions
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

  const handleSelectMode = (option: PurchaseOption) => {
    const nextId = optionIdentity(option)
    setSelectedPurchaseOptionId(nextId)
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

    setCheckoutLoading(true)
    setError(null)
    captureEvent("stripe_checkout_clicked", {
      preview_id: previewId,
      preview_option_id: selectedPurchaseOption.previewOptionId,
      purchase_option_id: optionIdentity(selectedPurchaseOption),
      selected_size: selectedSize?.id,
      production_speed: selectedPurchaseOption.productionSpeedCode ?? selectedPurchaseOption.productionSpeedLabel,
      product: selectedPurchaseOption.product ?? "DOT",
      amount_sgd: quote.amount,
    })

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_id: previewId,
          preview_option_id: selectedPurchaseOption.previewOptionId,
          selected_size: selectedSize?.id,
          purchase_option_id: optionIdentity(selectedPurchaseOption),
          purchase_option: selectedPurchaseOption,
        }),
      })
      const payload = await response.json().catch(() => null) as { url?: string; error?: string; detail?: string } | null
      if (!response.ok || !payload?.url) {
        throw new Error(formatCheckoutError(payload, response.status))
      }
      window.location.assign(payload.url)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed"
      setError(message)
      setCheckoutLoading(false)
      captureEvent("stripe_checkout_failed", {
        preview_id: previewId,
        preview_option_id: selectedPurchaseOption.previewOptionId,
        purchase_option_id: optionIdentity(selectedPurchaseOption),
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
          <div className="flex items-baseline gap-2">
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

      {visiblePurchaseOptions.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {visiblePurchaseOptions.map((option) => {
            const optionQuote = quoteForOption(option, visiblePurchaseOptions.length)
            const identity = optionIdentity(option)
            const active = identity === optionIdentity(selectedPurchaseOption)
            return (
              <button
                key={identity}
                type="button"
                onClick={() => handleSelectMode(option)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-white/45 bg-white/18 text-white"
                    : "border-white/15 bg-black/20 text-white/55 hover:border-white/30 hover:text-white"
                }`}
              >
                {modeLabel(option)}
                {!optionQuote.error && <span className="ml-1 text-white/45">SGD {optionQuote.amount}</span>}
              </button>
            )
          })}
        </div>
      )}

      {(error || quote.error) && (
        <p className="mt-2 text-xs text-amber-200/80">{error || quote.error}</p>
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

function modeLabel(option: PurchaseOption): string {
  return option.productionSpeedLabel || option.productionSpeedCode || option.label?.split("/").at(-1)?.trim() || "Option"
}

function formatCheckoutError(payload: { error?: string; detail?: string } | null, status: number): string {
  const message = payload?.detail || payload?.error || `Checkout failed (${status})`
  if (/STRIPE_SECRET_KEY is not configured/i.test(message)) return "Checkout is not configured yet."
  if (/Stripe sandbox checkout requires/i.test(message)) return "Checkout is still in Stripe test-mode setup."
  return message
}

function roundUpToNinetyNineCents(amount: number): number {
  const cents = Math.ceil(amount * 100)
  const dollars = Math.floor(cents / 100)
  const ninetyNine = dollars * 100 + 99
  return cents <= ninetyNine ? ninetyNine : (dollars + 1) * 100 + 99
}
