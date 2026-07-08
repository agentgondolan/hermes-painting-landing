export const DOTTINGO_ADMIN_EMAILS = ["matejgondolan@gmail.com"] as const

export const DOT_FRAME_OPTIONS_ENABLED = ["W", "WO"] as const
export const DOT_EXPRESS_OPTIONS_ENABLED = false

export const DEFAULT_EUR_TO_SGD_RATE = 1.46
export const TARGET_GROSS_MARGIN = 0.5
export const GST_RATE = 0.09

export function isDottingoAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()
  return Boolean(normalized && DOTTINGO_ADMIN_EMAILS.includes(normalized as (typeof DOTTINGO_ADMIN_EMAILS)[number]))
}
