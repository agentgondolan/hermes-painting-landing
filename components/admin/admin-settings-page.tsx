"use client"

import { useEffect, useState } from "react"
import {
  DEFAULT_EUR_TO_SGD_RATE,
  DOT_EXPRESS_OPTIONS_ENABLED,
  DOT_FRAME_OPTIONS_ENABLED,
  DOTTINGO_ADMIN_EMAILS,
  GST_RATE,
  TARGET_GROSS_MARGIN,
  isDottingoAdminEmail,
} from "@/lib/dottingo/project-settings"
import { readVerifiedIdentity, type StoredIdentity } from "@/lib/identity/browser"

type SettingRow = {
  label: string
  value: string
  detail: string
}

const SETTINGS: SettingRow[] = [
  {
    label: "Checkout frame options",
    value: DOT_FRAME_OPTIONS_ENABLED.join(", "),
    detail: "Only these MGE purchase-options frame codes are selectable in checkout.",
  },
  {
    label: "Express options",
    value: DOT_EXPRESS_OPTIONS_ENABLED ? "Enabled" : "Hidden",
    detail: "Express rows from MGE are not shown while this is hidden.",
  },
  {
    label: "Checkout labels",
    value: "Frame only",
    detail: "Standard speed is not shown because Express is currently hidden.",
  },
  {
    label: "Target gross margin",
    value: `${Math.round(TARGET_GROSS_MARGIN * 100)}%`,
    detail: "Used by the local SGD quote calculation before GST.",
  },
  {
    label: "EUR to SGD",
    value: DEFAULT_EUR_TO_SGD_RATE.toFixed(2),
    detail: "Temporary storefront conversion rate for MGE EUR unit prices.",
  },
  {
    label: "GST",
    value: `${Math.round(GST_RATE * 100)}%`,
    detail: "Applied after the target-margin calculation.",
  },
  {
    label: "Admin emails",
    value: DOTTINGO_ADMIN_EMAILS.join(", "),
    detail: "Accounts that can see this project settings page.",
  },
]

export function AdminSettingsPage() {
  const [identity, setIdentity] = useState<StoredIdentity | null>(null)
  const [checkedIdentity, setCheckedIdentity] = useState(false)

  useEffect(() => {
    setIdentity(readVerifiedIdentity())
    setCheckedIdentity(true)
  }, [])

  const isAdmin = isDottingoAdminEmail(identity?.email)

  return (
    <main className="min-h-dvh bg-[#faf7ff] px-4 py-5 text-[#2e2d2c] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="text-4xl font-black text-[#9432c1]">dottingo</a>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a href="/checkout" className="rounded-full border border-[#9432c1]/16 bg-white px-4 py-2 text-sm font-extrabold text-[#9432c1] shadow-[0_18px_45px_rgba(148,50,193,0.10)]">
              Checkout
            </a>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-[#9432c1] shadow-[0_18px_45px_rgba(148,50,193,0.12)]">
              {identity ? `Verified ${identity.email}` : "Account required"}
            </div>
          </div>
        </header>

        <section className="rounded-[1.5rem] border border-[#9432c1]/14 bg-white/86 p-5 shadow-[0_24px_80px_rgba(46,45,44,0.08)]">
          <p className="text-sm font-black uppercase text-[#9432c1]/70">Admin</p>
          <h1 className="mt-1 text-3xl font-black">Project settings</h1>

          {!checkedIdentity ? (
            <p className="mt-5 rounded-[1rem] bg-[#2e2d2c]/5 px-4 py-3 text-sm font-bold text-[#2e2d2c]/58">Loading account...</p>
          ) : null}

          {checkedIdentity && !isAdmin ? (
            <p className="mt-5 rounded-[1rem] bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              This settings view is available only for the Dottingo admin account.
            </p>
          ) : null}

          {isAdmin ? (
            <div className="mt-5 overflow-hidden rounded-[1rem] border border-[#9432c1]/12">
              {SETTINGS.map((setting) => (
                <div key={setting.label} className="grid gap-2 border-b border-[#9432c1]/10 bg-white px-4 py-3 last:border-b-0 sm:grid-cols-[14rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-sm font-black text-[#2e2d2c]">{setting.label}</p>
                    <p className="mt-1 text-xs font-bold text-[#2e2d2c]/45">{setting.detail}</p>
                  </div>
                  <p className="text-sm font-extrabold text-[#9432c1] sm:text-right">{setting.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
