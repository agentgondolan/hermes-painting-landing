'use client'

import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST
const IS_PROD = process.env.NODE_ENV === 'production'

let initialized = false
let superPropertiesRegistered = false

type PostHogLike = Pick<typeof posthog, 'debug' | 'register' | 'register_once'>

export type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>

export type AnalyticsProperties = Record<string, AnalyticsValue>

type IdentifyProperties = Record<string, string | number | boolean | null | undefined>

export function isAnalyticsConfigured() {
  return Boolean(POSTHOG_KEY && POSTHOG_HOST)
}

export function getPostHogClient() {
  if (typeof window === 'undefined' || !isAnalyticsConfigured()) {
    return null
  }

  if (!initialized) {
    posthog.init(POSTHOG_KEY as string, {
      api_host: POSTHOG_HOST,
      autocapture: true,
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: 'identified_only',
      persistence: 'localStorage+cookie',
      request_batching: false,
      __preview_disable_beacon: true,
      loaded: (client) => {
        registerSessionSuperProperties(client)

        if (!IS_PROD) {
          client.debug()
        }
      },
    })
    initialized = true
  }

  return posthog
}

export function captureEvent(eventName: string, properties: AnalyticsProperties = {}) {
  getPostHogClient()

  if (typeof window === 'undefined' || !isAnalyticsConfigured()) {
    return
  }

  captureViaPostHogApi(eventName, withBaseProperties(properties))
}

export function identifyCustomer(distinctId: string, properties: IdentifyProperties = {}) {
  const client = getPostHogClient()

  if (!client || !distinctId) {
    return
  }

  client.identify(distinctId, compactProperties(properties))
}

export function setPersonProperties(properties: IdentifyProperties) {
  const client = getPostHogClient()

  if (!client) {
    return
  }

  client.setPersonProperties(compactProperties(properties))
}

export function registerSessionProperties(properties: AnalyticsProperties) {
  const client = getPostHogClient()

  if (!client) {
    return
  }

  client.register(compactProperties(properties))
}

export function compactProperties<T extends Record<string, AnalyticsValue>>(properties: T) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

function withBaseProperties(properties: AnalyticsProperties) {
  return compactProperties({
    ...properties,
    $current_url: properties.$current_url ?? (typeof window !== 'undefined' ? window.location.href : undefined),
    $referrer: properties.$referrer ?? (typeof document !== 'undefined' ? document.referrer || null : undefined),
    product: properties.product ?? 'paint_by_numbers',
    site: 'makeyourcraft_landing',
    funnel: properties.funnel ?? 'photo_to_preview_to_order',
    app_version: process.env.NEXT_PUBLIC_APP_VERSION,
  })
}

function captureViaPostHogApi(eventName: string, properties: AnalyticsProperties) {
  const distinctId = getOrCreateDistinctId()
  const payload = JSON.stringify({
    api_key: POSTHOG_KEY,
    event: eventName,
    distinct_id: distinctId,
    properties,
  })
  const endpoint = `${POSTHOG_HOST?.replace(/\/$/, '')}/capture/`

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))
    if (sent) return
  }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Analytics must never break the storefront.
  })
}

function getOrCreateDistinctId() {
  const storageKey = 'makeyourcraft_posthog_distinct_id'
  const persisted = window.localStorage.getItem(storageKey)
  if (persisted) return persisted

  const postHogPersistenceKey = `ph_${POSTHOG_KEY}_posthog`
  const postHogPersistence = window.localStorage.getItem(postHogPersistenceKey)
  if (postHogPersistence) {
    try {
      const parsed = JSON.parse(postHogPersistence) as { distinct_id?: string; $device_id?: string }
      const existingId = parsed.distinct_id ?? parsed.$device_id
      if (existingId) {
        window.localStorage.setItem(storageKey, existingId)
        return existingId
      }
    } catch {
      // Ignore corrupt analytics persistence and create a fresh ID.
    }
  }

  const distinctId = crypto.randomUUID()
  window.localStorage.setItem(storageKey, distinctId)
  return distinctId
}

function registerSessionSuperProperties(client: PostHogLike) {
  if (superPropertiesRegistered || typeof window === 'undefined') {
    return
  }

  superPropertiesRegistered = true

  const url = new URL(window.location.href)
  const params = url.searchParams
  const referrer = document.referrer || null

  client.register_once({
    first_landing_page: url.pathname,
    first_referrer: referrer,
    first_utm_source: params.get('utm_source'),
    first_utm_medium: params.get('utm_medium'),
    first_utm_campaign: params.get('utm_campaign'),
    first_utm_term: params.get('utm_term'),
    first_utm_content: params.get('utm_content'),
    first_ad_creative: params.get('creative') ?? params.get('ad_creative') ?? params.get('utm_content'),
  })

  client.register({
    landing_page: url.pathname,
    referrer,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_term: params.get('utm_term'),
    utm_content: params.get('utm_content'),
    ad_creative: params.get('creative') ?? params.get('ad_creative') ?? params.get('utm_content'),
  })
}
