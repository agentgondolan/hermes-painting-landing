"use client"

import { useEffect, useMemo, useState } from "react"
import {
  createPreviewClient,
  type BffPurchaseOptionsResult,
} from "@/lib/mgeveryday/browser-preview"
import { captureEvent } from "@/lib/analytics/posthog"
import type { DotPreviewResult, FrameSizeOption } from "./preview-state"
import { persistCheckoutSelection, readStoredCheckoutState } from "./checkout-persistence"
import {
  consumeMagicTokenFromUrl,
  readVerifiedIdentity,
  requestDesignMagicLink,
} from "@/lib/identity/browser"

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

type VerifiedIdentity = {
  email: string
  previewId: string
  identityToken: string
  expiresAt: number
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
  const [checkoutComingSoon, setCheckoutComingSoon] = useState(false)
  const [email, setEmail] = useState("")
  const [identity, setIdentity] = useState<VerifiedIdentity | null>(null)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [magicLinkStatus, setMagicLinkStatus] = useState<string | null>(null)
  const [magicLinkFallback, setMagicLinkFallback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCheckoutComingSoon(/(^|\.)dottingo\.sg$/i.test(window.location.hostname))
    consumeMagicTokenFromUrl().then(
      (verified) => {
        if (!verified) return
        setIdentity(verified)
        setEmail(verified.email)
        setMagicLinkStatus("Email verified. Your design is saved to this email.")
        captureEvent("magic_link_verified", {
          preview_id: verified.previewId,
        })
      },
      (err) => {
        const message = err instanceof Error ? err.message : "Magic link verification failed"
        setMagicLinkStatus(message)
        captureEvent("magic_link_verification_failed", { error_message: message })
      },
    )
  }, [])

  useEffect(() => {
    const stored = readVerifiedIdentity(previewId)
    setIdentity(stored)
    if (stored?.email) setEmail(stored.email)
  }, [previewId])

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

  const handleRequestMagicLink = async () => {
    if (!previewId) return
    setMagicLinkLoading(true)
    setMagicLinkStatus(null)
    setMagicLinkFallback(null)
    setError(null)

    try {
      const result = await requestDesignMagicLink(email, previewId)
      setMagicLinkStatus(
        result.delivery === "email_sent"
          ? "Magic link sent. Open it from your email to save this design."
          : "Magic link requested. MGE accepted the request, but delivery is not confirmed yet.",
      )
      setMagicLinkFallback(result.magicLink ?? null)
      captureEvent("magic_link_requested", {
        preview_id: previewId,
        delivery: result.delivery,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send magic link"
      setMagicLinkStatus(message)
      captureEvent("magic_link_request_failed", {
        preview_id: previewId,
        error_message: message,
      })
    } finally {
      setMagicLinkLoading(false)
    }
  }

  const handleCheckout = async () => {
    if (checkoutComingSoon) {
      setError("Checkout coming soon.")
      return
    }
    if (!previewId || !selectedPurchaseOption || quote.error) return
    if (!identity || identity.previewId !== previewId) {
      setError("Verify your email before checkout so your order can be recovered later.")
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
      persistCheckoutSelection({
        selectedPurchaseOptionId: purchaseOptionId,
        checkoutInProgress: true,
      })

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_size: selectedSize?.id,
          preview_id: previewId,
          preview_option_id: selectedPurchaseOption.previewOptionId,
          purchase_option_id: purchaseOptionId,
          sku: optionSku(selectedPurchaseOption),
          identity_token: identity.identityToken,
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

  const panelClassName = "w-full rounded-[1.5rem] border border-[#9432c1]/12 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
  const isVerifiedForPreview = Boolean(identity && identity.previewId === previewId)

  return (
    <div className={panelClassName}>
      <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-extrabold text-[#2e2d2c]">
                  {quote.loading ? "Loading…" : quote.error ? "—" : `${quote.currency} ${quote.amount}`}
                </p>
                <p className="truncate text-xs font-semibold text-[#9432c1]/70">{selectedSize?.label ?? "Custom size"}</p>
              </div>
              <p className="mt-0.5 truncate text-xs font-medium text-[#2e2d2c]/48">
                {selectedPurchaseOption?.label ?? "Custom paint-by-number kit"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading || loadingOptions || Boolean(quote.error) || !selectedPurchaseOption || checkoutComingSoon || !isVerifiedForPreview}
              className="shrink-0 rounded-full bg-[#9432c1] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.28)] transition hover:bg-[#7f28aa] disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/10 disabled:text-[#2e2d2c]/35"
            >
              {checkoutComingSoon ? "Coming soon" : checkoutLoading ? "Opening Stripe…" : "Checkout"}
            </button>
          </div>

          {!isVerifiedForPreview && (
            <div className="mt-3 rounded-[1.25rem] border border-[#9432c1]/12 bg-white/62 p-3">
              <p className="text-xs font-extrabold text-[#2e2d2c]">Save your design and continue later.</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-full border border-[#9432c1]/15 bg-white px-3 py-2 text-sm font-semibold text-[#2e2d2c] outline-none transition placeholder:text-[#2e2d2c]/35 focus:border-[#9432c1]/45"
                />
                <button
                  type="button"
                  onClick={handleRequestMagicLink}
                  disabled={magicLinkLoading || !email.trim()}
                  className="rounded-full bg-[#2e2d2c] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#111] disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/15 disabled:text-[#2e2d2c]/35"
                >
                  {magicLinkLoading ? "Sending…" : "Send link"}
                </button>
              </div>
              {magicLinkStatus && <p className="mt-2 text-xs font-medium text-[#2e2d2c]/58">{magicLinkStatus}</p>}
              {magicLinkFallback && (
                <a className="mt-2 block break-all text-xs font-bold text-[#9432c1] underline" href={magicLinkFallback}>
                  Open test magic link
                </a>
              )}
            </div>
          )}

          {isVerifiedForPreview && (
            <p className="mt-2 text-xs font-bold text-[#2f7d32]">Verified: {identity?.email}</p>
          )}

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
                        ? "border-[#9432c1] bg-[#9432c1] text-white"
                        : "border-[#9432c1]/16 bg-white/62 text-[#2e2d2c]/58 hover:border-[#9432c1]/32 hover:text-[#9432c1]"
                    }`}
                  >
                    {modeLabel(option)}
                    {!optionQuote.error && <span className="ml-1 text-current/60">SGD {optionQuote.amount}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </>

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

function modeLabel(option: PurchaseOption): string {
  return option.productionSpeedLabel || option.productionSpeedCode || option.label?.split("/").at(-1)?.trim() || "Option"
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
