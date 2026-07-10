"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { clearStoredCartState } from "@/lib/cart/browser-storage"
import type { CheckoutStatusPayload } from "@/lib/stripe/edge"

const POLL_INTERVAL_MS = 2500

type StatusView = {
  eyebrow: string
  title: string
  detail: string
  tone: "active" | "success" | "attention"
}

export function CheckoutSuccessStatus() {
  const [status, setStatus] = useState<CheckoutStatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id")?.trim()
    if (!sessionId) {
      setError("This confirmation link is missing its checkout reference.")
      return
    }

    let cancelled = false
    let timer: number | null = null

    const poll = async () => {
      try {
        const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        })
        if (!response.ok) {
          if (response.status === 400 || response.status === 404) {
            throw new Error("This checkout confirmation could not be found.")
          }
          throw new Error("We are still connecting to your order. This page will keep checking.")
        }

        const nextStatus = await response.json() as CheckoutStatusPayload
        if (cancelled) return
        setStatus(nextStatus)
        setError(null)
        if (nextStatus.submissionState === "submitted") {
          clearStoredCartState()
        }
        if (!nextStatus.terminal) {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : "We are still checking your order.")
        timer = window.setTimeout(poll, POLL_INTERVAL_MS * 2)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  const view = useMemo(() => statusView(status), [status])
  const isActive = !status?.terminal

  return (
    <main className="min-h-dvh bg-[#faf7ff] px-4 py-6 text-[#2e2d2c] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="text-4xl font-black text-[#9432c1]">dottingo</Link>
          <Link
            href="/checkout"
            className="rounded-full border border-[#9432c1]/16 bg-white px-4 py-2 text-sm font-extrabold text-[#9432c1]"
          >
            Saved designs
          </Link>
        </header>

        <section className="mx-auto flex w-full max-w-2xl flex-1 items-center py-10">
          <div className="w-full rounded-[1.5rem] border border-[#9432c1]/14 bg-white p-5 shadow-[0_24px_80px_rgba(46,45,44,0.10)] sm:p-8" aria-live="polite">
            <div className="flex items-center gap-3">
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${view.tone === "success" ? "bg-emerald-500" : view.tone === "attention" ? "bg-amber-500" : "bg-[#9432c1]"}`}
              />
              <p className="text-sm font-black uppercase text-[#9432c1]/72">{view.eyebrow}</p>
            </div>

            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{view.title}</h1>
            <p className="mt-3 max-w-xl text-base font-semibold leading-7 text-[#2e2d2c]/62">{view.detail}</p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <StatusLine label="Payment" value={paymentLabel(status?.paymentState)} active={!status || status.paymentState === "unknown"} />
              <StatusLine label="Order" value={orderLabel(status?.submissionState)} active={isActive} />
            </div>

            {status?.orderId ? (
              <div className="mt-3 rounded-[0.9rem] bg-[#9432c1]/7 px-4 py-3">
                <p className="text-xs font-black uppercase text-[#9432c1]/60">Order reference</p>
                <p className="mt-1 break-all text-sm font-black text-[#2e2d2c]">{status.orderId}</p>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-[0.9rem] bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
                {error}
              </p>
            ) : null}

            {isActive ? (
              <p className="mt-4 text-xs font-bold text-[#2e2d2c]/45">This page updates automatically.</p>
            ) : null}

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link href="/checkout" className="rounded-full bg-[#9432c1] px-5 py-3 text-center text-sm font-extrabold text-white">
                View saved designs
              </Link>
              <Link href="/" className="rounded-full border border-[#9432c1]/16 bg-white px-5 py-3 text-center text-sm font-extrabold text-[#9432c1]">
                Add another image
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function StatusLine({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-[0.9rem] bg-[#2e2d2c]/5 px-4 py-3">
      <div>
        <p className="text-xs font-black uppercase text-[#2e2d2c]/38">{label}</p>
        <p className="mt-1 text-sm font-black text-[#2e2d2c]/70">{value}</p>
      </div>
      {active ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#9432c1]/20 border-t-[#9432c1]" /> : null}
    </div>
  )
}

function statusView(status: CheckoutStatusPayload | null): StatusView {
  if (!status) {
    return {
      eyebrow: "Checking payment",
      title: "We’re finding your order.",
      detail: "Keep this page open while we connect your payment to your Dottingo order.",
      tone: "active",
    }
  }
  if (status.submissionState === "submitted") {
    return {
      eyebrow: "Order confirmed",
      title: "Your DOT kit is confirmed.",
      detail: "Payment is complete and your order has been sent for production.",
      tone: "success",
    }
  }
  if (status.submissionState === "manual_review") {
    return {
      eyebrow: "Payment received",
      title: "Your order needs a little more time.",
      detail: "Your payment is safe. Our team will finish checking the order before production.",
      tone: "attention",
    }
  }
  if (status.submissionState === "retrying") {
    return {
      eyebrow: "Payment received",
      title: "We’re still finalizing your order.",
      detail: "Your payment is safe. We’re reconnecting to production and will keep trying automatically.",
      tone: "active",
    }
  }
  if (status.submissionState === "submitting") {
    return {
      eyebrow: "Payment received",
      title: "We’re creating your order.",
      detail: "Payment is complete. Your selected designs are now being sent to production.",
      tone: "active",
    }
  }
  if (status.submissionState === "paid") {
    return {
      eyebrow: "Payment received",
      title: "Your order is being prepared.",
      detail: "Payment is complete. We’re waiting for the final production confirmation.",
      tone: "active",
    }
  }
  return {
    eyebrow: "Checking payment",
    title: "We’re confirming your checkout.",
    detail: "This usually takes only a moment. The page will update when payment is confirmed.",
    tone: "active",
  }
}

function paymentLabel(state: CheckoutStatusPayload["paymentState"] | undefined): string {
  if (state === "paid" || state === "no_payment_required") return "Received"
  if (state === "unpaid") return "Not completed"
  return "Checking"
}

function orderLabel(state: CheckoutStatusPayload["submissionState"] | undefined): string {
  if (state === "submitted") return "Confirmed"
  if (state === "manual_review") return "Being reviewed"
  if (state === "retrying") return "Finalizing"
  if (state === "submitting") return "Creating order"
  if (state === "paid") return "Queued"
  return "Checking"
}
