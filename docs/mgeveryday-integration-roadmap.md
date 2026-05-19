# MGEeveryday Storefront Integration Roadmap

**Goal:** Turn Makeyourcraft into the first reusable frontend pattern for MGEeveryday products, starting with Singapore DOT, then generalize the storefront/order/analytics/ad loop for future country/product frontends.

**Current app:** Next.js 15 single-screen preview at `https://hermes-painting-landing.pages.dev` with client-side image upload and mock local preview processing.

**MGEeveryday API:**
- Base: `https://www.mgeveryday.sg`
- Docs: `https://www.mgeveryday.sg/api/v1/docs/`
- OpenAPI schema: `https://www.mgeveryday.sg/api/v1/schema/`
- Auth: Bearer API key in the Authorization header.
- Current account brand from API: `brand_id=116`, `brand_short_code=WHTE`, user `agentgondolan@gmail.com`, role `admin`.

> Secret handling: API token is stored locally outside the repo at `~/.hermes/secrets/mgeveryday.env` with mode `600`. Do not commit it.

---

## Architecture decision — Phase 1 backend boundary

Chosen path: keep the current static Cloudflare Pages frontend and add a small Cloudflare Worker/Pages Function backend-for-frontend.

Reason: this preserves the online Cloudflare Pages testing flow, keeps the MGE API token out of the browser bundle, minimizes deployment disruption, and can later be reused by other MGEeveryday-powered storefronts.

Free-tier fit as of 2026-05-19: Cloudflare Workers/Pages Functions include a free tier suitable for testing and early traffic: 100,000 requests/day, 10 ms CPU/request, 128 MB memory, 50 subrequests/request, and 100 MB request body size on the Cloudflare Free plan. Upgrade trigger: sustained production traffic above that, heavier CPU work, or operational need for paid limits/logging.

---

## Phase 0 — Integration foundation

**Status:** Implemented as a server-only library foundation. The deployed app is still a static export, so browser-facing API routes require a later Cloudflare Worker/Pages Function or OpenNext deployment decision before Phase 1 can call MGEeveryday from production.

**Purpose:** Add a safe backend boundary so the browser never sees the MGEeveryday API token.

**Scope:**
- Add server-side MGEeveryday API client in Next.js.
- Add env vars for `MGEVERYDAY_BASE_URL`, `MGEVERYDAY_API_TOKEN`, default `MGEVERYDAY_BRAND_ID=116`.
- Add typed wrappers for products, preview, order drafts, validation, submit.
- Add token-safe logging and error redaction.

**Verification:**
- Server can call `GET /api/v1/account/brands/` and receives brand 116.
- Server can call `GET /api/v1/products/types/DOT/variants/?product_type=VF`.
- No token appears in client bundle, logs, analytics, or git diff.

---

## Phase 1 — DOT preview integration

**Status:** Worker BFF foundation implemented under `workers/mge-bff/`; frontend integration uses real MGE preview only when `NEXT_PUBLIC_MGE_BFF_BASE_URL` is configured, otherwise it keeps the mock local preview fallback.

**Purpose:** Replace mock preview processing with MGEeveryday preview for DOT only.

**MGE API endpoints:**
- `POST /api/v1/preview/` multipart upload, requires `mockup:create` scope and `brand_id`.
- `GET /api/v1/preview/{preview_id}/` poll until `COMPLETED` or `PARTIAL`.
- `PUT /api/v1/preview/{preview_id}/` for replacing/revising uploaded photo.

**Scope:**
- Add `/api/mge/preview` route handler that accepts browser upload, sends multipart to MGEeveryday with `brand_id=116` and DOT product preference.
- Add polling route `/api/mge/preview/:id`.
- Map MGE preview options into the app state: selected option, preview image URL, SKU/order contract, orderability.
- Update UI to show real DOT preview option(s), not fake local canvas processing.

**Open questions / docs to verify during implementation:**
- Exact `PreviewCreate` multipart fields for selecting product family DOT and size/manufacturing preferences.
- Shape of preview result image URL(s): CDN URL, expiry, CORS, and whether the frontend can render directly.
- Whether preview options always include `order_contract` sufficient for draft/order line items.

**Verification:**
- Upload one image from the frontend.
- Preview reaches `COMPLETED` or `PARTIAL`.
- At least one DOT option is rendered in the single-screen app.
- App handles quota, bad image, and partial-result errors cleanly.

---

## Phase 2 — Product expansion: DBN or PHT

**Purpose:** Generalize product preview/product selection so the first integration is not Makeyourcraft-only.

**MGE API endpoints:**
- `GET /api/v1/products/types/`
- `GET /api/v1/products/types/{code}/`
- `GET /api/v1/products/types/{code}/variants/?product_type=VF`
- `GET /api/v1/products/pricing/`

**Scope:**
- Create a product-family config layer: DOT, DBN, PHT, later PBN/PIX.
- Keep DOT as default for Singapore test.
- Add internal mapping from UI choices to SKU format.
- Add product-specific preview rendering rules only where necessary.

**Verification:**
- DOT still works unchanged.
- One second product family can load variants and preview/order metadata.

---

## Phase 3 — Order draft creation

**Purpose:** Convert a selected preview option into a server-side MGEeveryday cart/draft.

**MGE API endpoints:**
- `POST /api/v1/order-drafts/`
- `PATCH /api/v1/order-drafts/{id}/`
- `POST /api/v1/order-drafts/{id}/assets/` or `/assets/from-url/`
- `POST /api/v1/order-drafts/{id}/validate/`

**Scope:**
- Create draft after user clicks order/buy CTA.
- Store draft ID in app session state.
- Attach selected preview/order contract or asset token to line item.
- Validate draft before checkout placeholder.

**Verification:**
- Draft is created for brand 116.
- Draft contains selected DOT line item.
- Validation returns `valid: true` before payment placeholder.

---

## Phase 4 — Fake payment/admin testing gate

**Purpose:** Let Matej test the full order flow without real money or public users accidentally submitting.

**Scope:**
- Add testing-only checkout gate, e.g. admin password or signed test token.
- Keep it server-side; do not rely only on client UI hiding.
- Mark all created test references clearly, e.g. `MYC-TEST-YYYYMMDD-...`.
- Block submit in production unless fake gate or real payment success is present.

**Verification:**
- Without gate: cannot submit.
- With gate: validation passes and submit button unlocks.
- Gate secret is not in frontend bundle.

---

## Phase 5 — Submit order

**Purpose:** Create a real MGEeveryday order from the validated draft.

**MGE API endpoints:**
- Preferred: `POST /api/v1/order-drafts/{id}/submit/`
- Direct fallback: `POST /api/v1/orders/`
- Dry-run: `POST /api/v1/orders/validate/`

**Scope:**
- Submit validated draft.
- Persist MGE order ID locally or in chosen app database.
- Render order confirmation.
- Add cancellation/read-only order status fetch for admin testing.

**Verification:**
- MGE order is created and linked to draft.
- Confirmation displays real order ID.
- Duplicate submits are prevented with idempotency/reference IDs.

---

## Phase 6 — Makeyourcraft account + transactional emails

**Purpose:** Give users a customer account area and order emails.

**Scope:**
- Add auth/account model for Makeyourcraft users.
- Store order references and MGE order IDs.
- Add order-status page.
- Add transactional emails: draft/order received, paid/submitted, shipped/status updates.

**Verification:**
- User can log in and see their orders.
- Emails are sent for key state changes.
- MGE order status can be synced/read.

---

## Phase 7 — Real payment, Singapore first

**Purpose:** Replace fake payment with real payment suitable for Singapore DOT test.

**Preferred sequence:**
1. Stripe first if it supports Singapore PayNow cleanly for this setup.
2. Native PayNow provider if Stripe is insufficient.
3. Card fallback if PayNow friction is too high.

**Scope:**
- Payment intent/session before order submission.
- Submit MGE order only after confirmed payment.
- Add refunds/cancel path.

**Verification:**
- Test mode payment succeeds.
- Webhook confirms payment.
- Paid order submits exactly once.

---

## Phase 8 — PostHog analytics + A/B testing

**Purpose:** Make conversion optimization measurable and agent-readable.

**Current state:** PostHog client instrumentation already exists in the repo (`docs/analytics-posthog.md`, `components/analytics-provider.tsx`).

**Scope:**
- Add backend funnel events for preview created, draft created, validation passed, payment started, paid, order submitted.
- Connect PostHog API access so Hermes can read analytics.
- Define A/B flags for landing flow, hero copy, CTA, pricing display, product default.

**Verification:**
- Funnel is visible from pageview → upload → preview → draft → payment → order.
- Hermes can query PostHog results without manual screenshots.

---

## Phase 9 — Ads platform setup

**Purpose:** Prepare paid acquisition feedback loop.

**Scope:**
- Meta/Facebook Ads API or official MCP if available.
- Google Ads API/MCP.
- UTM/creative taxonomy shared across all future frontends.
- Import spend/clicks/campaign data into one reporting layer.

**Verification:**
- For each campaign/ad/creative, we can match spend → landing events → paid orders → ROAS.

---

## Phase 10 — Ad generation pipeline on DGX Spark

**Purpose:** Generate product/website ads locally and feed them into experiments.

**Scope:**
- Set up DGX Spark video/image generation stack.
- Define reusable ad brief templates from product family + landing page + audience.
- Generate basic static/video ads for DOT Singapore.
- Store creative metadata and variants.

**Verification:**
- Can generate at least one usable creative set for DOT.
- Each creative has a tracked ID that appears in ad URLs and PostHog.

---

## Phase 11 — ROAS ownership loop

**Purpose:** Hermes becomes operational owner of the optimization loop.

**Scope:**
- Weekly/daily dashboard: spend, clicks, preview starts, orders, revenue, ROAS, CAC, drop-offs.
- Recommend and produce next experiments.
- Kill weak ads/pages, scale winners.
- Feed learnings into reusable storefront playbook.

**Verification:**
- ROAS report can be produced without manual data collection.
- Each new experiment has a hypothesis, metric, result, and next action.

---

## API documentation improvement notes

Initial docs are strong: Swagger is public, OpenAPI schema is available, auth scheme is clear, and preview/order endpoints include useful descriptions.

Suggested improvements for smoother third-party integration:

1. Add a dedicated “preview → order draft → submit” tutorial with one end-to-end DOT example.
2. Add complete `PreviewCreate` examples for DOT/DBN/PHT, including exact multipart field names.
3. Document preview result lifecycle: statuses, polling interval, image URL expiry/CORS, partial-result behavior.
4. Clarify how `order_contract` / `preview_option_id` maps to order draft line items.
5. Add idempotency guidance for draft submit/order create to prevent duplicate orders.
6. Add sandbox/test-mode guidance: test brand, fake payment, test references, and safe submit behavior.
7. Add Singapore-specific shipping/payment notes once PayNow/payment is selected.
