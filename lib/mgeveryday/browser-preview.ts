/**
 * Browser-safe MGE preview client — talks to the BFF (Cloudflare Worker).
 *
 * No secrets are included here.  The BFF owns the MGE API token.
 *
 * Usage:
 *   import { createPreview, getPreviewStatus } from '@/lib/mgeveryday/browser-preview'
 *
 *   const client = createPreviewClient()
 *   if (client) {
 *     const result = await client.createPreview(file, sizeId)
 *   }
 */

const DEFAULT_BFF_BASE = ''
const DEFAULT_BFF_ENV_VALUE = 'same-origin'
const POLL_INTERVAL_MS = 2_000
const SAME_ORIGIN_BFF = 'same-origin'

/**
 * Parse the BFF base URL from the public env or return null.
 */
export function resolveBffBaseUrl(): string | null {
  const url = typeof process !== 'undefined' && process.env
    ? (process.env.NEXT_PUBLIC_MGE_BFF_BASE_URL ?? DEFAULT_BFF_ENV_VALUE).trim()
    : DEFAULT_BFF_ENV_VALUE
  if (!url) {
    return null
  }
  if (url === SAME_ORIGIN_BFF) {
    return DEFAULT_BFF_BASE
  }
  return url.replace(/\/+$/, '')
}

export interface BffPreviewCreateResult {
  previewId: string
  status: string
  imageUrl: string | null
  options: Array<{
    previewOptionId: string | number
    label: string | null
    description: string | null
    orderable: boolean
    imageUrl: string | null
    mockupUrl: string | null
    [key: string]: unknown
  }>
}

export interface BffPreviewStatusResult {
  previewId: string
  status: string
  imageUrl: string | null
  options: Array<{
    previewOptionId: string | number
    label: string | null
    description: string | null
    orderable: boolean
    imageUrl: string | null
    mockupUrl: string | null
    [key: string]: unknown
  }>
}

export interface BffPurchaseOptionsResult {
  previewId: string
  status: string
  purchaseOptions: Array<{
    purchaseOptionId: string
    previewOptionId: string
    sku: string | null
    product: string | null
    label: string | null
    description: string | null
    previewUrl: string | null
    mockupUrl: string | null
    productionSpeed: Record<string, unknown> | null
    productionSpeedCode: string | null
    productionSpeedLabel: string | null
    orderLine: Record<string, unknown> | null
    unitPrice: string | null
    currency: string | null
  }>
}

export interface BffOrderDraftResult {
  orderDraftId: string
  previewId: string
  previewOptionId: string
  purchaseOptionId: string
  sku: string | null
  status: string
  product: string | null
  selectedSize: string | null
  productionSpeedCode: string | null
  productionSpeedLabel: string | null
  orderLine: Record<string, unknown> | null
  lineItems?: Record<string, unknown>[]
  itemCount?: number
  unitPrice: string | null
  currency: string | null
}

export interface BffOrderDraftInput {
  order_draft_id?: string | null
  preview_id: string
  preview_option_id: string
  sku: string
  selected_size?: string | null
  delivery_address?: Record<string, string>
}

export interface BffError {
  error: string
  status?: number
  detail?: string
}

export interface PollOptions {
  /** Maximum wait time in ms (default 120 000) */
  maxWaitMs?: number
  /** Poll interval in ms (default 2000) */
  intervalMs?: number
  /** Signal to abort polling */
  signal?: AbortSignal
}

export interface BffPreviewClient {
  /** Upload an image and create a preview session */
  createPreview(file: File, preferredSize?: string, clientCropped?: boolean): Promise<BffPreviewCreateResult>
  /** Poll until the preview is COMPLETED / PARTIAL or an imageUrl is available */
  pollPreview(previewId: string, options?: PollOptions): Promise<BffPreviewCreateResult>
  /** Get current preview status */
  getPreview(previewId: string): Promise<BffPreviewStatusResult>
  /** Get orderable purchase options for a completed/partial preview */
  getPurchaseOptions(previewId: string): Promise<BffPurchaseOptionsResult>
  /** Poll until MGE exposes orderable purchase options for a completed/partial preview */
  pollPurchaseOptions(previewId: string, options?: PollOptions): Promise<BffPurchaseOptionsResult>
  /** Create an MGE order draft after address capture and before Stripe */
  createOrderDraft(input: BffOrderDraftInput): Promise<BffOrderDraftResult>
}

export function createPreviewClient(baseUrl?: string): BffPreviewClient | null {
  const base = baseUrl ?? resolveBffBaseUrl()
  if (base === null) {
    return null
  }
  return new PreviewClientImpl(base)
}

export class PreviewClientImpl implements BffPreviewClient {
  private readonly base: string

  constructor(base: string) {
    this.base = base
  }

  async createPreview(file: File, preferredSize?: string, clientCropped = false): Promise<BffPreviewCreateResult> {
    const form = new FormData()
    form.append('image', file, file.name || 'upload')
    if (preferredSize) {
      form.append('preferredSize', preferredSize)
    }
    if (clientCropped) {
      form.append('clientCropped', 'true')
    }

    const res = await fetch(`${this.base}/api/mge/preview`, {
      method: 'POST',
      body: form,
      // Do NOT set Content-Type — browser sets the boundary
    })

    if (!res.ok) {
      const err = await readBffError(res)
      throw new Error(formatBffError(err, `Preview creation failed: ${res.status}`))
    }

    const data: BffPreviewCreateResult = await res.json()
    return proxiedPreviewResult(data, this.base)
  }

  async getPreview(previewId: string): Promise<BffPreviewStatusResult> {
    const res = await fetch(`${this.base}/api/mge/preview/${encodeURIComponent(previewId)}`)
    if (!res.ok) {
      const err = await readBffError(res)
      throw new Error(formatBffError(err, `Preview status fetch failed: ${res.status}`))
    }
    const data = await res.json() as BffPreviewStatusResult
    return proxiedPreviewResult(data, this.base)
  }

  async getPurchaseOptions(previewId: string): Promise<BffPurchaseOptionsResult> {
    const res = await fetch(`${this.base}/api/mge/preview/${encodeURIComponent(previewId)}/purchase-options`)
    if (!res.ok) {
      const err = await readBffError(res)
      throw new Error(formatBffError(err, `Purchase options fetch failed: ${res.status}`))
    }
    const data = await res.json() as BffPurchaseOptionsResult
    return proxiedPurchaseOptionsResult(data, this.base)
  }

  async pollPurchaseOptions(previewId: string, options: PollOptions = {}): Promise<BffPurchaseOptionsResult> {
    const { maxWaitMs = 120_000, intervalMs = POLL_INTERVAL_MS, signal } = options
    const started = Date.now()

    while (Date.now() - started <= maxWaitMs) {
      if (signal?.aborted) {
        throw new Error('Purchase option polling aborted')
      }

      const state = await this.getPurchaseOptions(previewId)
      if (state.purchaseOptions.length > 0) {
        return state
      }
      if (isTerminalFailure(state.status)) {
        throw new Error(`MGE preview ended with no order options (${state.status}).`)
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    throw new Error('Order options are still being generated. Please try again in a moment.')
  }

  async createOrderDraft(input: BffOrderDraftInput): Promise<BffOrderDraftResult> {
    const res = await fetch(`${this.base}/api/mge/order-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const err = await readBffError(res)
      throw new Error(formatBffError(err, `Order draft creation failed: ${res.status}`))
    }
    return await res.json() as BffOrderDraftResult
  }

  async pollPreview(previewId: string, options: PollOptions = {}): Promise<BffPreviewCreateResult> {
    const { maxWaitMs = 120_000, intervalMs = POLL_INTERVAL_MS, signal } = options
    const started = Date.now()

    // First, check the already-created preview state
    const initial = await this.getPreview(previewId)
    if (isTerminalPreview(initial)) {
      return initial as unknown as BffPreviewCreateResult
    }

    // Then poll
    while (Date.now() - started < maxWaitMs) {
      if (signal?.aborted) {
        throw new Error('Polling aborted')
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      if (signal?.aborted) {
        throw new Error('Polling aborted')
      }
      const state = await this.getPreview(previewId)
      if (isTerminalPreview(state)) {
        return state as unknown as BffPreviewCreateResult
      }
    }

    // Timeout — return latest state even if not terminal
    return this.getPreview(previewId) as unknown as Promise<BffPreviewCreateResult>
  }
}

function proxiedPreviewResult<T extends BffPreviewCreateResult | BffPreviewStatusResult>(result: T, base: string): T {
  return {
    ...result,
    imageUrl: proxiedImageUrl(result.imageUrl, base),
    options: result.options.map((option) => ({
      ...option,
      imageUrl: proxiedImageUrl(option.imageUrl, base),
      mockupUrl: proxiedImageUrl(option.mockupUrl ?? null, base),
    })),
  }
}

function proxiedPurchaseOptionsResult(result: BffPurchaseOptionsResult, base: string): BffPurchaseOptionsResult {
  return {
    ...result,
    purchaseOptions: result.purchaseOptions.map((option) => ({
      ...option,
      previewUrl: proxiedImageUrl(option.previewUrl, base),
      mockupUrl: proxiedImageUrl(option.mockupUrl, base),
    })),
  }
}

function proxiedImageUrl(imageUrl: string | null, base: string): string | null {
  if (!imageUrl) return null
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) return imageUrl
  if (imageUrl.startsWith(`${base}/api/mge/image`) || imageUrl.startsWith('/api/mge/image')) return imageUrl

  try {
    const parsed = new URL(imageUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return imageUrl
    return `${base}/api/mge/image?url=${encodeURIComponent(parsed.toString())}`
  } catch {
    return imageUrl
  }
}

/**
 * Check if a preview is in a terminal / ready state.
 * MGE may expose the first image before all requested preview options are done,
 * so do not stop polling only because imageUrl exists.
 */
export function isTerminalPreview(result: { status: string; imageUrl: string | null }): boolean {
  const s = result.status.toUpperCase()
  return s === 'COMPLETED' || s === 'PARTIAL' || s === 'READY'
}

function isTerminalFailure(status: string): boolean {
  const s = status.toUpperCase()
  return s === 'FAILED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'ERROR'
}

function formatBffError(error: BffError, fallback: string): string {
  if (error.detail) {
    return error.detail
  }
  if (error.error) {
    return error.error
  }
  return fallback
}

async function readBffError(response: Response): Promise<BffError> {
  const parsed: unknown = await response.json().catch(() => null)
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    return parsed as BffError
  }

  return { error: `HTTP ${response.status}` }
}
