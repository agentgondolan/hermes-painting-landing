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

Production implementation: use Cloudflare Pages Functions on the same Pages project for `/api/mge/*`, with the standalone Worker kept as an optional future route for custom domains or multiple storefronts.

Reason: this preserves the online Cloudflare Pages testing flow, keeps the MGE API token out of the browser bundle, avoids requiring Cloudflare `workers.dev` onboarding for the first live test, minimizes deployment disruption, and can later be reused by other MGEeveryday-powered storefronts.

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

## Phase 1 — DOT preview integration: multi-size previews on 3D canvas

**Status:** Done / live-verified on 2026-05-28. The live site has a server-side MGE preview BFF, creates and polls real DOT previews, exposes purchase-ready preview options, and uses MGE `preview_url` as the clean generated image source. Default-size preview generation and the preview → purchase-options path were verified against the live Cloudflare Pages deployment.

**Purpose:** From one uploaded image, generate DOT previews for the selectable frame sizes and show the selected size-specific preview on the 3D canvas.

**Frame sizes for first DOT test:**
- `40x50`
- `40x60`
- `60x80`

**MGE API endpoints:**
- `POST /api/v1/preview/` multipart upload, requires `mockup:create` scope and `brand_id`.
- `GET /api/v1/preview/{preview_id}/` poll until `COMPLETED` or `PARTIAL`.
- `PUT /api/v1/preview/{preview_id}/` for replacing/revising uploaded photo.

**Scope:**
- On image upload, create a DOT preview request for the default selected frame size first.
- Keep the auto-cropped uploaded image on the 3D canvas while the MGE preview is being generated.
- Show progress copy that the DOT preview is being generated.
- When MGE returns `preview_url`, swap the 3D canvas texture to that image and show product details (`Product: DOT`).
- When the user later selects another size (`40x50`, `40x60`, `60x80`), create that size's DOT preview if it has not already been generated.
- Keep the current mock/local fallback only when the BFF is unavailable or MGE returns no usable image.
- Use MGE `preview_url` as the preferred clean image for the 3D canvas; fall back only if no usable `preview_url` exists.

**Open questions / docs to verify during implementation:**
- Exact `PreviewCreate` multipart field name/value for size selection (`preferred_size` currently used by the BFF, but the public docs should confirm this contract).
- Whether MGE guarantees one requested DOT size per preview call, or can return all requested DOT sizes in one call.
- Shape and priority of image fields: clean preview URL vs mockup URL vs option image URL.
- Whether preview options always include `order_contract` sufficient for draft/order line items.

**Verification:**
- Upload one image from the frontend.
- The auto-cropped uploaded image appears immediately on the 3D canvas.
- One DOT preview call is made first for the default selected size.
- UI shows DOT preview generation progress while keeping the cropped image visible.
- When MGE returns `preview_url`, the 3D canvas swaps to that preview image and shows `Product: DOT` detail.
- Selecting another frame size creates that size's DOT preview on demand, then swaps the 3D canvas to it when ready.
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

**Status:** Done / live-verified on 2026-05-28 for preview-backed DOT drafts. Live BFF creates MGE order drafts from canonical purchase options. Direct MGE validation returned `valid: true` for `DOT/VF/40X50/W/BLACK/STD`.

**Purpose:** Convert a selected preview option into a server-side MGEeveryday cart/draft.

**MGE API endpoints:**
- `POST /api/v1/order-drafts/`
- `PATCH /api/v1/order-drafts/{id}/`
- `POST /api/v1/order-drafts/{id}/assets/`
- `POST /api/v1/order-drafts/{id}/assets/from-url/`
- `POST /api/v1/order-drafts/{id}/validate/`
- `POST /api/v1/order-drafts/{id}/submit/`

**Documented requirements:**
- `POST /order-drafts/` requires `brand_id`.
- `line_items[]` uses `OrderLineItemCreate`; `sku` is required.
- Preview-backed orders use `preview_option_id` from `purchase_options[].order_line`.
- `shipping_address.phone` is mandatory for MGE delivery/order draft validation; the checkout UI and BFF must reject draft creation before calling MGE when phone is missing.
- Draft asset endpoints exist for direct-image draft items and return `asset_token`; the preview-backed checkout path does not need a separate asset upload.

**Scope:**
- Create draft after user clicks order/buy CTA.
- Store draft ID in app session state.
- Attach selected preview `order_line` to line item.
- Validate draft before checkout placeholder.

**Verification:**
- Draft is created for brand 116.
- Draft contains selected DOT line item.
- Validation returns `valid: true` before payment placeholder.

---

## Phase 4 — Fake payment/admin testing gate

**Status:** Not done. The current live flow has Stripe test-mode checkout, but no separate server-side admin/fake-payment gate. Final MGE submit is still blocked from the public UI because webhook-driven submit/idempotency is not wired yet.

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

**Status:** Supplier API verified manually on 2026-05-28, app flow not complete. A real MGE order was submitted from a validated draft through `POST /api/v1/order-drafts/{id}/submit/`; the live app does not yet submit automatically after Stripe payment.

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

**Status:** Not done. No customer account/order-status area or transactional email flow is implemented yet.

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

**Status:** Partially done. Live Stripe Checkout session creation works with dynamic `price_data` from MGE purchase options and redirects to Stripe Sandbox. Browser payment completion was not fully verified from the agent session, and the Stripe webhook currently verifies/acknowledges events but does not yet submit the MGE order exactly once.

**Purpose:** Replace fake payment with real payment suitable for Singapore DOT test.

**Detailed execution plan:** `docs/plans/2026-05-25-mge-purchase-options-stripe-price-data.md`

**Current next step:** Replace the smoke-test fixed Stripe price with MGE `purchase-options` + Stripe Checkout `price_data`.

**Preferred sequence:**
1. Investigate `GET /api/v1/preview/{preview_id}/purchase-options/` with a real generated preview ID.
2. Normalize purchase options and calculate customer SGD prices server-side.
3. Add a bottom-panel purchase step while keeping the 3D preview visible.
4. Create and validate an MGE order draft for the selected purchase option before delivery/payment.
5. Collect delivery, PATCH the same draft with delivery data, then validate again.
6. Create Stripe Checkout sessions with `price_data`, not fixed `STRIPE_PRICE_ID`, only for validated drafts.
7. Submit MGE orders only after payment webhook + idempotency are ready.

**Scope:**
- Order draft before delivery and payment.
- Payment session before final order submission.
- Submit MGE order only after confirmed payment.
- Add refunds/cancel path.

**Verification:**
- Draft is created/validated before payment.
- Delivery validation passes on the same draft.
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

## Phase 12 — Parked: UCP / agentic commerce adapter

**Status:** Parked. Do not refactor the current storefront or MGE API flow around UCP yet.

**Purpose:** Later expose a standardized AI-agent commerce interface (for Google UCP / Gemini / AI Mode style checkout) backed by the existing MGE storefront flow.

**Decision:** UCP is an outer adapter layer, not a replacement for MGE. The current priority remains: preview → purchase option → order draft → Stripe payment → webhook → MGE submit → confirmation.

**Future scope:**
- Add a UCP profile at `/.well-known/ucp` only after the normal paid flow is proven.
- Map UCP cart/checkout/order calls onto the existing BFF/MGE flow.
- Keep MGE as the source of truth for preview generation, purchase options, order validation, submit, and order status.
- Treat Google Pay / agent identity / merchant discovery as adapter concerns, not core product logic.

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
