export const AD_CREATIVE_FEATURE_FLAG = 'ad-creative-variant'

const AD_CREATIVE_QUERY_KEYS = [
  'utm_creative',
  'utm_content',
  'ad_creative',
  'creative',
] as const

export interface AdCreativeAttribution {
  adCreative: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
}

export function readAdCreativeAttribution(searchParams: URLSearchParams): AdCreativeAttribution {
  const adCreative =
    AD_CREATIVE_QUERY_KEYS.map((key) => searchParams.get(key)).find(Boolean) ?? null

  return {
    adCreative,
    utmSource: searchParams.get('utm_source'),
    utmMedium: searchParams.get('utm_medium'),
    utmCampaign: searchParams.get('utm_campaign'),
    utmTerm: searchParams.get('utm_term'),
  }
}

export function readCurrentAdCreativeAttribution() {
  if (typeof window === 'undefined') {
    return null
  }

  return readAdCreativeAttribution(new URLSearchParams(window.location.search))
}
