import 'server-only'

import { getMgeEverydayConfig, type MgeEverydayConfig } from './config'
import { redactMgeSecrets } from './redaction'

export class MgeEverydayApiError extends Error {
  readonly status: number
  readonly responseBody: string

  constructor(message: string, status: number, responseBody: string) {
    super(message)
    this.name = 'MgeEverydayApiError'
    this.status = status
    this.responseBody = redactMgeSecrets(responseBody)
  }
}

export type MgeRequestBody = BodyInit | object | null

export interface MgeRequestOptions extends Omit<RequestInit, 'headers' | 'body'> {
  headers?: HeadersInit
  body?: MgeRequestBody
  timeoutMs?: number
}

export class MgeEverydayClient {
  private readonly config: MgeEverydayConfig

  constructor(config = getMgeEverydayConfig()) {
    assertServerOnly()
    this.config = config
  }

  get brandId() {
    return this.config.brandId
  }

  async get<T>(path: string, options: MgeRequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  async post<T>(path: string, body?: MgeRequestOptions['body'], options: MgeRequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  async patch<T>(path: string, body?: MgeRequestOptions['body'], options: MgeRequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body })
  }

  async put<T>(path: string, body?: MgeRequestOptions['body'], options: MgeRequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }

  async request<T>(path: string, options: MgeRequestOptions = {}): Promise<T> {
    assertServerOnly()

    const { timeoutMs = 30_000, body, headers, ...requestOptions } = options
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const requestHeaders = new Headers(headers)
      requestHeaders.set('Authorization', `Bearer ${this.config.apiToken}`)

      const requestBody = prepareBody(body, requestHeaders)
      const response = await fetch(buildUrl(this.config.baseUrl, path), {
        ...requestOptions,
        body: requestBody,
        headers: requestHeaders,
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        const responseBody = await response.text()
        throw new MgeEverydayApiError(
          `MGEeveryday API request failed: ${response.status} ${response.statusText}`,
          response.status,
          responseBody,
        )
      }

      if (response.status === 204) {
        return undefined as T
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof MgeEverydayApiError) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new Error(redactMgeSecrets(`MGEeveryday API request failed: ${message}`))
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createMgeEverydayClient(config?: MgeEverydayConfig) {
  return new MgeEverydayClient(config)
}

export function buildUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

function prepareBody(body: MgeRequestBody | undefined, headers: Headers): BodyInit | null | undefined {
  if (body === undefined) {
    return undefined
  }

  if (body === null) {
    return null
  }

  if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
    return body
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return JSON.stringify(body)
}

function assertServerOnly() {
  if (typeof window !== 'undefined') {
    throw new Error('MGEeveryday API client can only run on the server')
  }
}
