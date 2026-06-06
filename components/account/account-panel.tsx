"use client"

import { useEffect, useState } from "react"
import { captureEvent } from "@/lib/analytics/posthog"
import {
  pollMagicLinkRequestStatus,
  readVerifiedIdentity,
  requestDesignMagicLink,
  type StoredIdentity,
} from "@/lib/identity/browser"
import {
  buildPreviewOpenPath,
  hideAccountPreview,
  readAccountPreviews,
  upsertAccountPreview,
  type AccountPreviewRecord,
} from "@/lib/account/preview-registry"
import type { DotPreviewResult } from "@/components/single-screen-preview/preview-state"
import type { FrameSizeOption } from "@/components/single-screen-preview/preview-state"

type AccountPanelProps = {
  selectedPreview: DotPreviewResult | null
  selectedSize?: Pick<FrameSizeOption, "id" | "label"> | null
  verifiedIdentity: StoredIdentity | null
  startEmailFlowNonce?: number
  onClose: () => void
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function AccountPanel({ selectedPreview, selectedSize = null, verifiedIdentity, startEmailFlowNonce = 0, onClose }: AccountPanelProps) {
  const previewId = selectedPreview?.previewId ?? null
  const [identity, setIdentity] = useState<StoredIdentity | null>(verifiedIdentity)
  const [email, setEmail] = useState(verifiedIdentity?.email ?? "")
  const [isChangingEmail, setIsChangingEmail] = useState(false)
  const [saveFormOpen, setSaveFormOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [savedPreviews, setSavedPreviews] = useState<AccountPreviewRecord[]>([])

  const refreshSavedPreviews = (nextIdentity: StoredIdentity | null) => {
    setSavedPreviews(readAccountPreviews(nextIdentity?.email))
  }

  useEffect(() => {
    const storedIdentity = verifiedIdentity ?? readVerifiedIdentity()
    setIdentity(storedIdentity)
    setEmail(storedIdentity?.email ?? "")
    setIsChangingEmail(false)
    setSaveFormOpen(false)
    setStatus(null)
    setMagicLinkSent(false)

    if (storedIdentity && selectedPreview?.status === "ready") {
      upsertAccountPreview(storedIdentity.email, selectedPreview, selectedSize)
    }
    refreshSavedPreviews(storedIdentity)
  }, [previewId, selectedPreview, selectedSize, verifiedIdentity])

  useEffect(() => {
    if (!startEmailFlowNonce || selectedPreview?.status !== "ready") return
    setSaveFormOpen(true)
    setIsChangingEmail(true)
    setMagicLinkSent(false)
    setStatus(null)
  }, [startEmailFlowNonce, selectedPreview?.status])

  const isVerifiedGlobally = Boolean(identity)
  const isSavedCurrentPreview = Boolean(identity && savedPreviews.some((record) => record.previewId === previewId))
  const hasCurrentDesign = Boolean(previewId && selectedPreview?.status === "ready")
  const showEmailForm = Boolean(hasCurrentDesign && (!isVerifiedGlobally || isChangingEmail) && saveFormOpen)

  const handleSendMagicLink = async () => {
    if (!previewId || !email.trim()) return

    setLoading(true)
    setMagicLinkSent(false)
    setStatus("Sending link…")

    try {
      const result = await requestDesignMagicLink(email, previewId)
      const confirmed = result.delivery === "email_sent"
      setStatus(confirmed ? "Please check your emails to verify." : "Sending link…")
      setMagicLinkSent(confirmed)
      setSaveFormOpen(true)
      if (confirmed) setIsChangingEmail(false)
      captureEvent("account_magic_link_requested", {
        preview_id: previewId,
        delivery: result.delivery,
        email_status: result.emailStatus,
        request_id: result.requestId,
      })

      if (confirmed || !result.requestId) return

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await wait(1500)
        const deliveryStatus = await pollMagicLinkRequestStatus(result.requestId)
        captureEvent("account_magic_link_delivery_poll", {
          preview_id: previewId,
          attempt,
          delivery: deliveryStatus.delivery,
          email_status: deliveryStatus.emailStatus,
          terminal: deliveryStatus.terminal,
          request_id: result.requestId,
        })

        if (deliveryStatus.delivery === "email_sent") {
          setStatus("Please check your emails to verify.")
          setMagicLinkSent(true)
          setIsChangingEmail(false)
          captureEvent("account_magic_link_delivery_confirmed", {
            preview_id: previewId,
            attempt,
            email_status: deliveryStatus.emailStatus,
            request_id: result.requestId,
          })
          return
        }

        if (deliveryStatus.terminal) {
          setStatus("Could not send link. Try again.")
          setMagicLinkSent(false)
          captureEvent("account_magic_link_delivery_failed", {
            preview_id: previewId,
            attempt,
            email_status: deliveryStatus.emailStatus,
            request_id: result.requestId,
          })
          return
        }
      }

      setStatus("Still sending. You can send again in a moment.")
      captureEvent("account_magic_link_delivery_pending", {
        preview_id: previewId,
        request_id: result.requestId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send magic link"
      setMagicLinkSent(false)
      setStatus(message)
      captureEvent("account_magic_link_failed", {
        preview_id: previewId,
        error_message: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCurrentPreview = () => {
    if (!identity || selectedPreview?.status !== "ready") return
    const registered = upsertAccountPreview(identity.email, selectedPreview, selectedSize)
    refreshSavedPreviews(identity)
    setStatus(registered ? "Current preview saved to your verified email." : "Create a ready preview first.")
    captureEvent("account_current_preview_saved", {
      preview_id: selectedPreview.previewId,
    })
  }

  const handleHidePreview = (record: AccountPreviewRecord) => {
    if (!identity) return
    hideAccountPreview(identity.email, record.previewId)
    refreshSavedPreviews(identity)
    captureEvent("account_preview_hidden", {
      preview_id: record.previewId,
    })
  }

  return (
    <section className="absolute right-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 w-[min(calc(100vw-1.5rem),24rem)] rounded-[1.75rem] border border-[#9432c1]/15 bg-white/92 p-4 text-[#2e2d2c] shadow-[0_26px_80px_rgba(46,45,44,0.18)] backdrop-blur-xl sm:right-8 sm:top-24" aria-label="Account">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#9432c1]/65">Account</p>
          <h2 className="mt-1 text-lg font-black">Your saved designs</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#2e2d2c]/7 px-3 py-1.5 text-xs font-extrabold text-[#2e2d2c]/55 transition hover:bg-[#2e2d2c]/12 hover:text-[#2e2d2c]"
        >
          Close
        </button>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-[#9432c1]/12 bg-[#faf8ff]/70 p-3">
        <p className="text-xs font-extrabold text-[#2e2d2c]">Current preview</p>
        {!hasCurrentDesign ? (
          <p className="mt-1 text-xs font-semibold text-[#2e2d2c]/58">Create a design first, then save it to your email.</p>
        ) : null}
        {hasCurrentDesign && !isVerifiedGlobally && !showEmailForm ? (
          <button
            type="button"
            onClick={() => {
              setSaveFormOpen(true)
              setIsChangingEmail(true)
              setStatus(null)
            }}
            className="mt-3 w-full rounded-full bg-[#9432c1] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#7f28aa]"
          >
            Save and get back later
          </button>
        ) : null}
      </div>

      {isVerifiedGlobally && identity && hasCurrentDesign && !isSavedCurrentPreview ? (
        <button
          type="button"
          onClick={handleSaveCurrentPreview}
          className="mt-3 w-full rounded-full bg-[#9432c1] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#7f28aa]"
        >
          Save current preview
        </button>
      ) : null}

      {showEmailForm ? (
        <div className="mt-3 rounded-[1.25rem] border border-[#9432c1]/12 bg-white/78 p-3">
          <p className="text-xs font-extrabold text-[#2e2d2c]">Save your design and continue later.</p>
          {magicLinkSent ? (
            <div className="mt-2">
              <button
                type="button"
                disabled
                className="w-full rounded-full bg-[#2e2d2c]/10 px-4 py-2 text-center text-xs font-extrabold text-[#2e2d2c]/42 disabled:cursor-not-allowed"
              >
                Email sent to {email}
              </button>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-[#2e2d2c]/58">{status ?? "Please check your emails to verify."}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMagicLinkSent(false)
                    setStatus(null)
                    setIsChangingEmail(true)
                  }}
                  className="shrink-0 text-[11px] font-bold text-[#2e2d2c]/45 underline-offset-2 transition hover:text-[#9432c1] hover:underline"
                >
                  Send again
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setMagicLinkSent(false)
                    if (identity) setIsChangingEmail(true)
                  }}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-full border border-[#9432c1]/15 bg-white px-3 py-2 text-sm font-semibold text-[#2e2d2c] outline-none transition placeholder:text-[#2e2d2c]/35 focus:border-[#9432c1]/45"
                />
                <button
                  type="button"
                  onClick={handleSendMagicLink}
                  disabled={loading || !email.trim()}
                  className="rounded-full bg-[#2e2d2c] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#111] disabled:cursor-not-allowed disabled:bg-[#2e2d2c]/15 disabled:text-[#2e2d2c]/35"
                >
                  {loading ? "Sending…" : "Send link"}
                </button>
              </div>
              {status ? <p className="mt-2 text-xs font-medium text-[#2e2d2c]/58">{status}</p> : null}
            </>
          )}
        </div>
      ) : null}

      {!showEmailForm && status ? <p className="mt-3 text-xs font-bold text-[#2e2d2c]/58">{status}</p> : null}

      <div className="mt-4 space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2e2d2c]/45">Verified previews</p>
        {savedPreviews.length ? (
          savedPreviews.map((record) => (
            <div key={record.previewId} className="rounded-[1.25rem] border border-[#9432c1]/12 bg-white/78 p-3">
              <div className="flex gap-3">
                {record.imageUrl ? (
                  <img
                    src={record.imageUrl}
                    alt="Saved preview"
                    className="h-14 w-14 rounded-2xl object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold text-[#2e2d2c]">
                    {record.previewId === previewId ? "Current preview" : (record.sizeLabel ?? record.sizeId ?? "Saved preview")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={buildPreviewOpenPath(record.previewId)}
                      className="rounded-full bg-[#9432c1] px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-[#7f28aa]"
                    >
                      Open preview
                    </a>
                    <a
                      href={buildPreviewOpenPath(record.previewId)}
                      className="rounded-full bg-[#2e2d2c]/7 px-3 py-1.5 text-[11px] font-extrabold text-[#2e2d2c]/65 transition hover:bg-[#2e2d2c]/12 hover:text-[#2e2d2c]"
                    >
                      Continue checkout
                    </a>
                    <button
                      type="button"
                      onClick={() => handleHidePreview(record)}
                      className="rounded-full bg-[#2e2d2c]/5 px-3 py-1.5 text-[11px] font-extrabold text-[#2e2d2c]/45 transition hover:bg-[#2e2d2c]/10 hover:text-[#2e2d2c]"
                    >
                      Hide
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-[1.1rem] bg-[#2e2d2c]/5 px-3 py-2 text-xs font-semibold text-[#2e2d2c]/52">
            Verify a design by email and it will appear here on this device.
          </p>
        )}
      </div>
    </section>
  )
}
