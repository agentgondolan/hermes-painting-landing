# Multibrand Dottingo Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn the current Makeyourcraft-branded paint-by-number storefront into one reusable multibrand codebase, with Dottingo.sg as the active production brand and Makeyourcraft.com preserved as a standby brand.

**Architecture:** Brand identity, content, theme tokens, SEO metadata, analytics labels, feature flags, locale defaults, and supplier/checkout settings should move into a typed brand configuration layer. The app should resolve the active brand from environment/host by default, with a development/admin-only switcher to preview other brands without forking code. Brand-specific differences must be data/config first, component override second, and duplicated pages last.

**Tech Stack:** Next.js 15, React 19, Cloudflare Pages/Functions, TypeScript, PostHog, Stripe Checkout, MGE BFF.

---

## Decisions

1. Keep one repository and one product flow.
2. Dottingo.sg becomes the production brand now.
3. Makeyourcraft.com remains a configured brand, but does not need to stay live during Dottingo launch.
4. Brand switching is for preview/admin/development only; public users should see the brand resolved by domain.
5. Avoid hard-coded brand strings in components, metadata, structured data, checkout labels, and analytics.

---

## Target Structure

Create these brand files:

- `lib/brand/types.ts` — BrandConfig type, LocaleConfig type, FeatureFlags type.
- `lib/brand/configs/dottingo.ts` — Dottingo brand config.
- `lib/brand/configs/makeyourcraft.ts` — Makeyourcraft standby config.
- `lib/brand/registry.ts` — map brand keys to configs.
- `lib/brand/resolve-brand.ts` — resolve from explicit env, hostname, cookie/query override for preview.
- `components/brand/brand-preview-switcher.tsx` — small admin/dev dropdown to preview brands.
- `components/brand/brand-provider.tsx` — client context for selected brand.

Brand config should include:

```ts
export type BrandConfig = {
  key: 'dottingo' | 'makeyourcraft'
  name: string
  legalName?: string
  primaryDomain: string
  standbyDomains?: string[]
  locale: {
    defaultLocale: string
    supportedLocales: string[]
    currency: string
    country: string
  }
  seo: {
    title: string
    description: string
    ogImage: string
    sameAs: string[]
  }
  theme: {
    colors: Record<string, string>
    fonts: Record<string, string>
    radius: Record<string, string>
  }
  copy: {
    heroTitle: string
    heroSubtitle: string
    uploadCta: string
    checkoutCta: string
    successTitle: string
    successSubtitle: string
  }
  features: {
    showBrandSwitcher: boolean
    enablePostHog: boolean
    enableStripeCheckout: boolean
    enableMgePreview: boolean
  }
}
```

---

## Implementation Tasks

### Task 1: Add typed brand config layer

**Objective:** Move brand identity into typed config without changing UI behavior yet.

**Files:**
- Create: `lib/brand/types.ts`
- Create: `lib/brand/configs/dottingo.ts`
- Create: `lib/brand/configs/makeyourcraft.ts`
- Create: `lib/brand/registry.ts`
- Create: `lib/brand/resolve-brand.ts`
- Test: `tests/brand-config.test.ts`

**Verification:**
- `npm test` or existing TypeScript test command passes.
- Brand registry returns both `dottingo` and `makeyourcraft`.
- Default brand is controlled by `NEXT_PUBLIC_BRAND_KEY` or hostname.

### Task 2: Replace SEO and structured data hard-coding

**Objective:** `app/layout.tsx` and `app/page.tsx` should read metadata, organization schema, service description, canonical domain, and OG data from active brand config.

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Test: `tests/brand-metadata.test.ts`

**Verification:**
- Dottingo config renders Dottingo title, description, canonical base URL, and organization schema.
- Makeyourcraft config still renders valid standby metadata.

### Task 3: Replace UI copy and theme tokens

**Objective:** Main UI copy, CTA text, colors, and brand display names come from brand config.

**Files:**
- Modify: `components/single-screen-preview/*`
- Modify: `app/globals.css` if CSS variables are needed
- Create: `components/brand/brand-provider.tsx`

**Verification:**
- Switching brand changes visible UI text and visual theme.
- No critical flow regression: upload, preview, options, checkout button.

### Task 4: Add admin/development brand switcher

**Objective:** Add a small dropdown that changes the previewed brand locally without changing production routing.

**Rules:**
- Show only when `NEXT_PUBLIC_ENABLE_BRAND_SWITCHER=true` or non-production hostname.
- Store selection in localStorage or a cookie.
- Never let the switcher override production public host resolution unless explicitly enabled.

**Files:**
- Create: `components/brand/brand-preview-switcher.tsx`
- Modify: `components/single-screen-preview/single-screen-preview-shell.tsx` or `LayoutFrame`

**Verification:**
- Dropdown switches Dottingo/Makeyourcraft UI instantly.
- Hidden on production unless enabled by env.

### Task 5: Make checkout/analytics brand-aware

**Objective:** Stripe checkout metadata, PostHog event properties, success/cancel pages, and supplier draft labels should include the active brand key/domain.

**Files:**
- Modify: `functions/api/stripe/checkout.ts`
- Modify: `functions/api/stripe/webhook.ts`
- Modify: `lib/analytics/posthog.ts`
- Modify: `components/analytics-provider.tsx`
- Modify: `app/checkout/success/page.tsx`
- Modify: `app/checkout/cancel/page.tsx`

**Verification:**
- Checkout session metadata includes `brand_key=dottingo` on Dottingo.
- PostHog events include `brand_key` and `brand_domain`.
- Success/cancel pages use active brand copy.

### Task 6: Configure Cloudflare Pages custom domains

**Objective:** Point both Dottingo domains to the existing Cloudflare Pages project after the code is brand-ready.

**Target domains:**
- `dottingo.sg`
- `www.dottingo.sg`

**Needed from Cloudflare:**
- Wrangler must be authenticated locally, or `CLOUDFLARE_API_TOKEN` must be available in the environment.
- Token needs access to the Cloudflare account/zone for `dottingo.sg` and Pages project custom domains.

**Verification:**
- `dottingo.sg` serves the Pages deployment.
- `www.dottingo.sg` redirects or serves consistently.
- `NEXT_PUBLIC_SITE_URL=https://dottingo.sg`
- `NEXT_PUBLIC_BRAND_KEY=dottingo`
- Live browser smoke test passes.

### Task 7: Preserve Makeyourcraft as standby config only

**Objective:** Keep Makeyourcraft config valid as a standby brand. Do not assume `makeyourcraft.com` is currently deployed or attached.

**Verification:**
- Local/admin switcher can render Makeyourcraft.
- If later attached to `makeyourcraft.com`, only env/domain mapping changes are needed.

---

## Cloudflare Inputs Needed

Minimum:

1. Authenticate Wrangler on this machine with `npx wrangler login`, or provide/mount a scoped `CLOUDFLARE_API_TOKEN`.
2. Dottingo domain shape is confirmed: use both `dottingo.sg` and `www.dottingo.sg`.

Nice to have, not blocking code structure:

- Dottingo logo/wordmark.
- Dottingo color preference.
- Dottingo tone: playful/cute vs premium/gift vs Singapore-local.
- Initial language: English only, or English + Slovak/Czech later.

---

## Risks / Guardrails

- Do not fork the repo per brand.
- Do not scatter `if (brand === ...)` through UI components unless no config-driven option works.
- Do not expose supplier or Stripe secrets client-side.
- Do not use client-selected brand for server trust decisions without validating against hostname/environment.
- Keep brand switcher preview-only.

---

## Suggested Execution Order

1. Brand config layer.
2. SEO/schema/copy extraction.
3. UI theme + copy binding.
4. Brand switcher.
5. Checkout + analytics brand metadata.
6. Cloudflare custom domain + env.
7. Live smoke test on Dottingo.sg.
