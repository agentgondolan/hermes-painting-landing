# PostHog analytics setup

This project uses PostHog instead of Google Analytics. The integration is safe by default: if no public PostHog key is configured, the site renders normally and sends no events.

## Environment variables

Set these in Cloudflare Pages and any local environment that should send analytics:

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Use the EU host if the PostHog project is in EU Cloud. Use `https://us.i.posthog.com` only for US projects.

## Reuse on future websites

Copy these files into a new Next.js site:

- `lib/analytics/posthog.ts`
- `lib/analytics/ad-creative.ts`
- `components/analytics-provider.tsx`
- `components/ad-creative-experiment-tracker.tsx`

Then wrap `app/layout.tsx` with `<AnalyticsProvider>{children}</AnalyticsProvider>` and place `<AdCreativeExperimentTracker />` on landing pages that receive paid traffic.

## Events captured

- `$pageview`: page views with UTM/ad creative attribution.
- `ad_creative_experiment_viewed`: one per session/path/ad-creative tuple, includes the PostHog feature flag variant.
- `preview_upload_clicked`: upload or replace-photo click.
- `preview_file_selected`: file type/size and accepted/rejected state. File names are not captured.
- `preview_image_selected`: accepted file starts the preview flow.
- `preview_processing_completed`: preview generation completes.
- `preview_processing_failed`: preview generation fails.
- `preview_size_selected`: selected canvas size.
- `preview_order_clicked`: buy/order CTA click.
- `preview_retry_clicked`: retry click after an error.
- `preview_reset_clicked`: preview reset.

## A/B testing ad creatives

Create a PostHog feature flag named:

```text
ad-creative-variant
```

Suggested variants:

- `control`
- `ugc_photo`
- `finished_canvas`
- `gift_angle`

Paid links should include UTM/ad creative params, for example:

```text
/?utm_source=meta&utm_medium=paid&utm_campaign=painting-may&utm_creative=ugc_photo_01
```

PostHog will receive both the incoming creative (`utm_creative` / `utm_content` / `ad_creative` / `creative`) and the feature flag variant. Use those together to compare ad creative quality against in-page variant performance.

## Privacy notes

Do not send uploaded image names, original filenames, or image content to analytics. Current instrumentation only sends MIME type, size in MB, selected canvas size, and flow status.
