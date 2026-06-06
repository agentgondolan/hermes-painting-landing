"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { buildVerifiedDesignReturnPath, verifyMagicToken } from "@/lib/identity/browser"

export default function MagicLinkPage() {
  const [status, setStatus] = useState<"verifying" | "verified" | "failed">("verifying")
  const [message, setMessage] = useState("Verifying your design link…")

  const token = useMemo(() => {
    if (typeof window === "undefined") return ""
    const url = new URL(window.location.href)
    return url.searchParams.get("token") ?? url.searchParams.get("magic_token") ?? ""
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus("failed")
      setMessage("This magic link is missing its token.")
      return
    }

    verifyMagicToken(token).then(
      (identity) => {
        setStatus("verified")
        setMessage(`Verified ${identity.email}. Your design is saved to this email.`)
        window.location.replace(buildVerifiedDesignReturnPath(identity))
      },
      (error) => {
        setStatus("failed")
        setMessage(error instanceof Error ? error.message : "Magic link verification failed")
      },
    )
  }, [token])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f0df] px-5 text-[#2e2d2c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#9432c1]/12 bg-white/80 p-6 text-center shadow-[0_24px_80px_rgba(46,45,44,0.12)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#9432c1]/70">Dottingo</p>
        <h1 className="mt-3 text-2xl font-black">
          {status === "verifying" ? "Checking your link" : status === "verified" ? "Email verified" : "Link problem"}
        </h1>
        <p className="mt-3 text-sm font-semibold text-[#2e2d2c]/62">{message}</p>
        {status === "verified" ? (
          <p className="mt-2 text-xs font-bold text-[#9432c1]/70">Returning to your design…</p>
        ) : null}
        <Link
          href="/?identity_verified=1"
          className="mt-6 inline-flex rounded-full bg-[#9432c1] px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.28)] transition hover:bg-[#7f28aa]"
        >
          Return to design
        </Link>
      </section>
    </main>
  )
}
