'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { captureEvent, getPostHogClient } from '@/lib/analytics/posthog'
import { readAdCreativeAttribution } from '@/lib/analytics/ad-creative'

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<typeof posthog | null>(null)

  useEffect(() => {
    setClient(getPostHogClient())
  }, [])

  if (!client) {
    return <>{children}</>
  }

  return (
    <PostHogProvider client={client}>
      {children}
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
    </PostHogProvider>
  )
}

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const queryString = searchParams.toString()
    const url = `${pathname}${queryString ? `?${queryString}` : ''}`
    const attribution = readAdCreativeAttribution(searchParams)

    captureEvent('$pageview', {
      current_url: window.location.href,
      path: pathname,
      query: queryString || null,
      ad_creative: attribution.adCreative,
      utm_source: attribution.utmSource,
      utm_medium: attribution.utmMedium,
      utm_campaign: attribution.utmCampaign,
      utm_term: attribution.utmTerm,
      page_url: url,
    })
  }, [pathname, searchParams])

  return null
}
