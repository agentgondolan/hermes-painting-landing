"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { buildVerifiedDesignReturnPath, developmentLoginVerifiedIdentity, readDevelopmentIdentityLoginToken } from "@/lib/identity/browser"

const DEV_IDENTITY_EMAIL = "matejgondolan@gmail.com"

function readNextPath(): string {
  if (typeof window === "undefined") return "/checkout"
  const url = new URL(window.location.href)
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash)
  const candidate = hashParams.get("next") || url.searchParams.get("next") || "/checkout"
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/checkout"
}

export default function DevLoginPage() {
  const [message, setMessage] = useState("Preparing Matej test login...")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const token = readDevelopmentIdentityLoginToken()
    const nextPath = readNextPath()
    if (!token) {
      setFailed(true)
      setMessage("Missing Dottingo test login token.")
      return
    }

    developmentLoginVerifiedIdentity(DEV_IDENTITY_EMAIL, null, token).then(
      (identity) => {
        const verifiedPath = buildVerifiedDesignReturnPath(identity)
        window.location.replace(nextPath === "/checkout" ? "/checkout" : verifiedPath)
      },
      (error) => {
        setFailed(true)
        setMessage(error instanceof Error ? error.message : "Dottingo test login failed")
      },
    )
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f4fb] px-5 text-[#2e2d2c]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#9432c1]/12 bg-white/85 p-6 text-center shadow-[0_24px_80px_rgba(46,45,44,0.12)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#9432c1]/70">Dottingo test access</p>
        <h1 className="mt-3 text-2xl font-black">{failed ? "Login blocked" : "Logging in as Matej"}</h1>
        <p className="mt-3 text-sm font-semibold text-[#2e2d2c]/62">{message}</p>
        {failed ? (
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-[#9432c1] px-5 py-3 text-sm font-extrabold text-white shadow-[0_14px_34px_rgba(148,50,193,0.28)] transition hover:bg-[#7f28aa]"
          >
            Return to Dottingo
          </Link>
        ) : null}
      </section>
    </main>
  )
}
