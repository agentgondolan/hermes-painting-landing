import 'server-only'

export interface MgeEverydayConfig {
  baseUrl: string
  apiToken: string
  brandId: number
}

const DEFAULT_BASE_URL = 'https://www.mgeveryday.sg'
const DEFAULT_BRAND_ID = 64

export function getMgeEverydayConfig(env: NodeJS.ProcessEnv = process.env): MgeEverydayConfig {
  const apiToken = env.MGEVERYDAY_API_TOKEN

  if (!apiToken) {
    throw new Error('Missing MGEVERYDAY_API_TOKEN server environment variable')
  }

  const brandIdValue = env.MGEVERYDAY_BRAND_ID ?? String(DEFAULT_BRAND_ID)
  const brandId = Number.parseInt(brandIdValue, 10)

  if (!Number.isFinite(brandId)) {
    throw new Error('MGEVERYDAY_BRAND_ID must be a number')
  }

  return {
    baseUrl: normalizeBaseUrl(env.MGEVERYDAY_BASE_URL ?? DEFAULT_BASE_URL),
    apiToken,
    brandId,
  }
}

export function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}
