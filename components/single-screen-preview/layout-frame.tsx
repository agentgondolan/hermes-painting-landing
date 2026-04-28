import React from "react"

interface LayoutFrameProps {
  children: React.ReactNode
}

export function LayoutFrame({ children }: LayoutFrameProps) {
  return (
    <div
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#0e0b09]"
      style={{ height: "100dvh" }}
    >
      {children}
    </div>
  )
}
