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
  const client = getPostHogClient()

  if (!client) {
    return
  }

  client.capture(eventName, withBaseProperties(properties))
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
    product: properties.product ?? 'paint_by_numbers',
    site: 'makeyourcraft_landing',
    funnel: properties.funnel ?? 'photo_to_preview_to_order',
    app_version: process.env.NEXT_PUBLIC_APP_VERSION,
  })
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
