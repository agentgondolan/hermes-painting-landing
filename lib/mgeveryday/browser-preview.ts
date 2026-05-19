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
const POLL_INTERVAL_MS = 2_000
const SAME_ORIGIN_BFF = 'same-origin'

/**
 * Parse the BFF base URL from the public env or return null.
 */
export function resolveBffBaseUrl(): string | null {
  const url = typeof process !== 'undefined' && process.env
    ? (process.env.NEXT_PUBLIC_MGE_BFF_BASE_URL ?? '').trim()
    : DEFAULT_BFF_BASE
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
  options: Array<{ previewOptionId: string | number; orderable: boolean; imageUrl: string | null; [key: string]: unknown }>
}

export interface BffPreviewStatusResult {
  previewId: string
  status: string
  imageUrl: string | null
  options: Array<{ previewOptionId: string | number; orderable: boolean; imageUrl: string | null; [key: string]: unknown }>
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
  createPreview(file: File, preferredSize?: string): Promise<BffPreviewCreateResult>
  /** Poll until the preview is COMPLETED / PARTIAL or an imageUrl is available */
  pollPreview(previewId: string, options?: PollOptions): Promise<BffPreviewCreateResult>
  /** Get current preview status */
  getPreview(previewId: string): Promise<BffPreviewStatusResult>
}

export function createPreviewClient(baseUrl?: string): BffPreviewClient | null {
  const base = baseUrl ?? resolveBffBaseUrl()
  if (base === null) {
    return null
  }
  return new PreviewClientImpl(base)
}

export class PreviewClientImpl implements BffPreviewClient {
  constructor(private readonly base: string) {}

  async createPreview(file: File, preferredSize?: string): Promise<BffPreviewCreateResult> {
    const form = new FormData()
    form.append('image', file, file.name || 'upload')
    if (preferredSize) {
      form.append('preferredSize', preferredSize)
    }

    const res = await fetch(`${this.base}/api/mge/preview`, {
      method: 'POST',
      body: form,
      // Do NOT set Content-Type — browser sets the boundary
    })

    if (!res.ok) {
      const err = await readBffError(res)
      throw new Error(err.error ?? `Preview creation failed: ${res.status}`)
    }

    const data: BffPreviewCreateResult = await res.json()
    return data
  }

  async getPreview(previewId: string): Promise<BffPreviewStatusResult> {
    const res = await fetch(`${this.base}/api/mge/preview/${encodeURIComponent(previewId)}`)
    if (!res.ok) {
      const err = await readBffError(res)
      throw new Error(err.error ?? `Preview status fetch failed: ${res.status}`)
    }
    return res.json() as Promise<BffPreviewStatusResult>
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

/**
 * Check if a preview is in a terminal / ready state.
 * MGE uses status names like "COMPLETED", "PARTIAL", "READY".
 */
function isTerminalPreview(result: { status: string; imageUrl: string | null }): boolean {
  const s = result.status.toUpperCase()
  return s === 'COMPLETED' || s === 'PARTIAL' || s === 'READY' || result.imageUrl !== null
}

async function readBffError(response: Response): Promise<BffError> {
  const parsed: unknown = await response.json().catch(() => null)
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    return parsed as BffError
  }

  return { error: `HTTP ${response.status}` }
}
