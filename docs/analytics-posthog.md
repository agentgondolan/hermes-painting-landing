# PostHog analytics setup

This project uses PostHog as the product analytics layer for conversion, UX, ad creative, and experiment decisions. The integration is safe by default: if either public PostHog env var is missing, the site renders normally and sends no events.

Reference docs:
- Next.js install: https://posthog.com/docs/libraries/next-js
- Feature flags: https://posthog.com/docs/feature-flags
- Experiments: https://posthog.com/docs/experiments
- Session replay: https://posthog.com/docs/session-replay
- Surveys: https://posthog.com/docs/surveys

## Environment variables

Set these in Cloudflare Pages GitHub variables and any local environment that should send analytics:

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://your-self-hosted-posthog-domain.example.com
```

Use the self-hosted public PostHog URL as `NEXT_PUBLIC_POSTHOG_HOST`. Do not use the personal API key in browser code. The `phc_...` project token is browser-visible and expected.

The GitHub Actions deployment forwards these variables into the static Next.js build:

```text
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_APP_VERSION = git commit sha
```

## Current implementation

Files:

- `lib/analytics/posthog.ts` initializes PostHog, registers first-touch/current-touch attribution, and adds base properties to custom events.
- `components/analytics-provider.tsx` wraps the app and sends manual `$pageview` events for App Router navigation.
- `lib/analytics/ad-creative.ts` normalizes ad creative attribution from `utm_creative`, `utm_content`, `ad_creative`, or `creative`.
- `components/ad-creative-experiment-tracker.tsx` captures the PostHog feature-flag assignment for paid/ad traffic.
- `components/single-screen-preview/*` captures funnel events in the preview/order flow.

## Events captured

Core funnel:

- `$pageview`: page views with URL, path, query, UTM, and ad creative attribution.
- `preview_upload_clicked`: upload or replace-photo click.
- `preview_file_selected`: file type/size and accepted/rejected state. File names are not captured.
- `preview_file_rejected`: rejected file type or bad input.
- `preview_image_selected`: accepted file starts the preview flow.
- `mge_dot_preview_completed`: real MGE/Dot preview generation completes.
- `mge_preview_processing_failed`: real MGE/Dot preview generation fails.
- `preview_processing_completed`: fallback/local preview generation completes.
- `preview_processing_failed`: fallback/local preview generation fails.
- `preview_size_selected`: selected canvas size.
- `preview_option_selected`: selected preview variant/size option.
- `preview_order_clicked`: buy/order CTA click.
- `preview_retry_clicked`: retry click after an error.
- `preview_reset_clicked`: preview reset.

Experiment/ad attribution:

- `ad_creative_experiment_viewed`: one per session/path/ad-creative tuple, includes the `ad-creative-variant` feature flag result.

Base properties attached to custom events:

- `product=paint_by_numbers`
- `site=makeyourcraft_landing`
- `funnel=photo_to_preview_to_order`
- `app_version` when available
- first-touch and current-touch UTM/ad creative properties through PostHog super properties

## Recommended PostHog setup

Create these first in PostHog:

1. Funnel: `$pageview` → `preview_upload_clicked` → `preview_image_selected` → `mge_dot_preview_completed` → `preview_order_clicked`.
2. Breakdowns: `utm_source`, `utm_campaign`, `ad_creative`, `selected_size`, `variant`.
3. Feature flag: `ad-creative-variant` with variants like `control`, `ugc_photo`, `finished_canvas`, `gift_angle`.
4. Session replay: enable only for landing/preview pages at first, and review sessions that hit `preview_processing_failed` or drop before `preview_order_clicked`.
5. Heatmaps: inspect upload CTA, size selector, preview option selector, and order CTA.
6. Surveys: after order click or after abandoned preview, ask one short question: “What stopped you from ordering today?”

## Paid ads naming convention

Paid links should include both standard UTMs and a creative identifier, for example:

```text
/?utm_source=meta&utm_medium=paid&utm_campaign=painting-may&utm_content=ugc_photo_01
```

Supported creative params:

```text
utm_creative, utm_content, ad_creative, creative
```

This lets us compare:

- Which ad creative brings people who actually upload.
- Which ad creative converts to completed previews.
- Which ad creative reaches the order CTA.
- Whether ad promise and landing-page UI match.

## Privacy notes

Do not send uploaded image names, original filenames, image content, personal API keys, or private customer details to analytics. Current instrumentation only sends MIME type, size in MB, selected canvas size, flow status, attribution, and CTA/UX state.
