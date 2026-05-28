"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createPreviewClient,
  type BffPurchaseOptionsResult,
} from "@/lib/mgeveryday/browser-preview"
import { captureEvent } from "@/lib/analytics/posthog"
import type { DotPreviewResult, FrameSizeOption } from "./preview-state"
import { persistCheckoutSelection, readStoredCheckoutState } from "./checkout-persistence"

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

type DeliveryAddress = {
  name: string
  email: string
  phone: string
  line1: string
  line2: string
  city: string
  postal_code: string
  country: string
}

const DEFAULT_EUR_TO_SGD_RATE = 1.46
const TARGET_GROSS_MARGIN = 0.5
const GST_RATE = 0.09
const DEFAULT_ADDRESS: DeliveryAddress = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "Singapore",
  postal_code: "",
  country: "SG",
}

export function PurchasePanel({ selectedSize, selectedPreview }: PurchasePanelProps) {
  const previewId = selectedPreview?.previewId ?? null
  const selectedPreviewOptionId = selectedPreview?.selectedOptionId ?? null
  const [purchaseOptions, setPurchaseOptions] = useState<PurchaseOption[]>([])
  const [selectedPurchaseOptionId, setSelectedPurchaseOptionId] = useState<string | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [showAddress, setShowAddress] = useState(false)
  const [address, setAddress] = useState<DeliveryAddress>(DEFAULT_ADDRESS)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const restored = readStoredCheckoutState()
    if (restored?.selectedPurchaseOptionId) {
      setSelectedPurchaseOptionId(restored.selectedPurchaseOptionId)
      if (restored.checkoutInProgress) setShowAddress(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!previewId || selectedPreview?.status !== "ready") {
      setPurchaseOptions([])
      setSelectedPurchaseOptionId(null)
      setLoadingOptions(false)
      setError(null)
      setShowAddress(false)
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
    persistCheckoutSelection({ selectedPurchaseOptionId: nextId, checkoutInProgress: showAddress })
    setError(null)
    captureEvent("mge_purchase_option_selected", {
      preview_id: previewId,
      preview_option_id: option.previewOptionId,
      purchase_option_id: nextId,
      production_speed: option.productionSpeedCode ?? option.productionSpeedLabel,
      selected_size: selectedSize?.id,
    })
  }

  const handleCheckoutIntent = () => {
    if (!selectedPurchaseOption || quote.error) return
    setShowAddress(true)
    persistCheckoutSelection({ selectedPurchaseOptionId: optionIdentity(selectedPurchaseOption), checkoutInProgress: true })
    captureEvent("checkout_address_step_opened", {
      preview_id: previewId,
      preview_option_id: selectedPurchaseOption.previewOptionId,
      purchase_option_id: optionIdentity(selectedPurchaseOption),
      selected_size: selectedSize?.id,
      amount_sgd: quote.amount,
    })
  }

  const handleAddressChange = (key: keyof DeliveryAddress, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }))
  }

  const handleCheckout = async () => {
    if (!previewId || !selectedPurchaseOption || quote.error) return
    const validationError = validateAddress(address)
    if (validationError) {
      setError(validationError)
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

    try {
      const client = createPreviewClient()
      if (!client) throw new Error("Checkout is not available in local fallback mode.")

      const orderDraft = await client.createOrderDraft({
        preview_id: previewId,
        preview_option_id: selectedPurchaseOption.previewOptionId,
        sku: optionSku(selectedPurchaseOption),
        selected_size: selectedSize?.id ?? null,
        delivery_address: sanitizeAddressForDraft(address),
      })

      persistCheckoutSelection({
        selectedPurchaseOptionId: purchaseOptionId,
        orderDraftId: orderDraft.orderDraftId,
        checkoutInProgress: true,
      })

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_draft_id: orderDraft.orderDraftId,
          order_draft: orderDraft,
          selected_size: selectedSize?.id,
          preview_id: previewId,
          preview_option_id: selectedPurchaseOption.previewOptionId,
          sku: optionSku(selectedPurchaseOption),
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
        purchase_option_id: purchaseOptionId,
        selected_size: selectedSize?.id,
        error_message: message,
      })
    }
  }

  if (!selectedPreview || selectedPreview.status !== "ready") {
    return null
  }

  const panelClassName = showAddress
    ? "w-full"
    : "w-full rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-3"

  const closeAddressStep = () => {
    setShowAddress(false)
    persistCheckoutSelection({ selectedPurchaseOptionId, checkoutInProgress: false })
  }

  return (
    <div className={panelClassName}>
      {!showAddress ? (
        <>
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
              onClick={handleCheckoutIntent}
              disabled={loadingOptions || Boolean(quote.error) || !selectedPurchaseOption}
              className="shrink-0 rounded-full bg-[#52b788] px-5 py-2.5 text-sm font-semibold text-[#07140f] transition hover:bg-[#74c69d] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
            >
              Checkout
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
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Delivery details</p>
              <p className="text-xs text-white/45">Where should we send your kit?</p>
            </div>
            <button
              type="button"
              onClick={closeAddressStep}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70 hover:text-white"
            >
              Back
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={address.name} onChange={(event) => handleAddressChange("name", event.target.value)} placeholder="Name" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/35" />
            <input value={address.email} onChange={(event) => handleAddressChange("email", event.target.value)} placeholder="Email" type="email" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/35" />
            <input value={address.phone} onChange={(event) => handleAddressChange("phone", event.target.value)} placeholder="Phone" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/35" />
            <input value={address.postal_code} onChange={(event) => handleAddressChange("postal_code", event.target.value)} placeholder="Postal code" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/35" />
            <input value={address.line1} onChange={(event) => handleAddressChange("line1", event.target.value)} placeholder="Address line 1" className="col-span-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/35" />
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="w-full rounded-full bg-[#52b788] px-5 py-2.5 text-sm font-semibold text-[#07140f] transition hover:bg-[#74c69d] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/35"
          >
            {checkoutLoading ? "Creating order…" : `Pay ${quote.currency} ${quote.amount}`}
          </button>
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

function optionSku(option: PurchaseOption): string {
  return typeof option.sku === "string" && option.sku ? option.sku : String(option.orderLine?.sku ?? option.purchaseOptionId)
}

function modeLabel(option: PurchaseOption): string {
  return option.productionSpeedLabel || option.productionSpeedCode || option.label?.split("/").at(-1)?.trim() || "Option"
}

function validateAddress(address: DeliveryAddress): string | null {
  if (!address.name.trim()) return "Please enter your name."
  if (!/^\S+@\S+\.\S+$/.test(address.email.trim())) return "Please enter a valid email."
  if (!address.phone.trim()) return "Please enter your phone number."
  if (!address.line1.trim()) return "Please enter your delivery address."
  if (!address.postal_code.trim()) return "Please enter your postal code."
  return null
}

function sanitizeAddressForDraft(address: DeliveryAddress): Record<string, string> {
  return Object.fromEntries(
    Object.entries(address)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value),
  )
}

function formatCheckoutError(payload: { error?: string; detail?: string } | null, status: number): string {
  const message = payload?.detail || payload?.error || `Checkout failed (${status})`
  if (/STRIPE_SECRET_KEY is not configured/i.test(message)) return "Checkout is not configured yet."
  if (/Stripe sandbox checkout requires/i.test(message)) return "Checkout is still in Stripe test-mode setup."
  if (/order_draft/i.test(message)) return "Could not confirm the order draft. Please try again."
  return message
}

function roundUpToNinetyNineCents(amount: number): number {
  const cents = Math.ceil(amount * 100)
  const dollars = Math.floor(cents / 100)
  const ninetyNine = dollars * 100 + 99
  return cents <= ninetyNine ? ninetyNine : (dollars + 1) * 100 + 99
}
