'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { captureEvent, getPostHogClient } from '@/lib/analytics/posthog'
import {
  AD_CREATIVE_FEATURE_FLAG,
  readAdCreativeAttribution,
} from '@/lib/analytics/ad-creative'

export function AdCreativeExperimentTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const client = getPostHogClient()

    if (!client) {
      return
    }

    const attribution = readAdCreativeAttribution(searchParams)
    const attributionKey = [
      pathname,
      attribution.adCreative,
      attribution.utmSource,
      attribution.utmCampaign,
    ]
      .filter(Boolean)
      .join(':')
    const sessionKey = `ad-creative-experiment:${attributionKey || pathname}`

    if (window.sessionStorage.getItem(sessionKey)) {
      return
    }

    const captureAssignment = () => {
      if (window.sessionStorage.getItem(sessionKey)) {
        return
      }

      const variant = client.getFeatureFlag(AD_CREATIVE_FEATURE_FLAG)

      captureEvent('ad_creative_experiment_viewed', {
        feature_flag: AD_CREATIVE_FEATURE_FLAG,
        variant: typeof variant === 'string' ? variant : variant ? String(variant) : 'control',
        ad_creative: attribution.adCreative,
        utm_source: attribution.utmSource,
        utm_medium: attribution.utmMedium,
        utm_campaign: attribution.utmCampaign,
        utm_term: attribution.utmTerm,
        path: pathname,
      })

      window.sessionStorage.setItem(sessionKey, '1')
    }

    const unsubscribe = client.onFeatureFlags(captureAssignment)
    client.reloadFeatureFlags()
    const fallbackTimer = window.setTimeout(captureAssignment, 800)

    return () => {
      window.clearTimeout(fallbackTimer)
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [pathname, searchParams])

  return null
}
