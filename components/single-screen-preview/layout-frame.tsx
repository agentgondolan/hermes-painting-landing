import React from "react"

interface LayoutFrameProps {
  children: React.ReactNode
}

export function LayoutFrame({ children }: LayoutFrameProps) {
  return (
    <div
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#faf8ff] text-[#2e2d2c]"
      style={{ height: "100dvh" }}
    >
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-28 -top-24 h-80 w-80 rounded-full bg-[#9432c1]/18 blur-3xl" />
        <div className="absolute -right-24 top-8 h-72 w-72 rounded-full bg-[#c778e7]/22 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#f0dcfa] via-[#faf8ff]/70 to-transparent" />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-8 sm:pt-8">
        <img
          src="/brand/dottingo/dottingo-logo-purple.svg"
          alt="Dottingo"
          className="dottingo-wordmark drop-shadow-[0_12px_28px_rgba(148,50,193,0.18)]"
        />
        <div className="hidden rounded-full border border-[#9432c1]/15 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#9432c1] shadow-[0_14px_42px_rgba(148,50,193,0.14)] backdrop-blur-md sm:block">
          Paint your photo
        </div>
      </header>

      {children}
    </div>
  )
}
