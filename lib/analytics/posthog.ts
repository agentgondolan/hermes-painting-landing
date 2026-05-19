'use client'

import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const IS_PROD = process.env.NODE_ENV === 'production'

let initialized = false

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>

export function isAnalyticsConfigured() {
  return Boolean(POSTHOG_KEY)
}

export function getPostHogClient() {
  if (typeof window === 'undefined' || !POSTHOG_KEY) {
    return null
  }

  if (!initialized) {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: true,
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: 'identified_only',
      loaded: (client) => {
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

  client.capture(eventName, compactProperties(properties))
}

export function compactProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  )
}
