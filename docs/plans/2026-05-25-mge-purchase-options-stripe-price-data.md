# MGE Purchase Options + Stripe Price Data Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the fixed Stripe test price with real customer-priced Stripe Checkout sessions derived from MGE `purchase-options` for the selected preview option.

**Architecture:** Keep the 3D single-screen experience. Add a bottom-panel purchase step after the user selects an MGE preview option. The browser only sees normalized purchase options and final customer prices; Cloudflare Pages Functions call MGE and Stripe with server-side secrets.

**Tech Stack:** Next.js 15 static export, Cloudflare Pages Functions, Edge `fetch` + Web Crypto, MGEeveryday API, Stripe Checkout `price_data`, PostHog events.

---

## Current repo facts

- Preview BFF exists at `lib/mgeveryday/bff-handler.ts` and exposes:
  - `POST /api/mge/preview`
  - `GET /api/mge/preview/{id}`
- UI already tracks selected size + selected preview option:
  - `components/single-screen-preview/use-preview-flow.ts`
  - `components/single-screen-preview/preview-state.ts`
  - `components/single-screen-preview/preview-option-overlay.tsx`
- Stripe sandbox smoke implementation exists:
  - `lib/stripe/edge.ts`
  - `functions/api/stripe/checkout.ts`
  - `functions/api/stripe/webhook.ts`
  - `tests/stripe-edge.test.ts`
- The fixed smoke-test env value `STRIPE_PRICE_ID` must be removed from checkout logic after Phase 4.
- MGE OpenAPI docs are accessible at `https://www.mgeveryday.sg/api/v1/docs/` and schema at `https://www.mgeveryday.sg/api/v1/schema/`. Use the schema as the source of truth before implementation; use live API probes only to capture sanitized examples.

---

## Pricing policy v1

Use explicit config values so Matej can later edit them in an admin panel.

```ts
export interface PricingConfig {
  sourceCurrency: 'EUR'
  targetCurrency: 'SGD'
  eurToSgd: number // fixed historical FX, 2026-01-01 source to be documented
  grossMarginRate: number // default 0.5 means 50% gross margin, not 50% markup
  vatRate: number // Singapore GST/VAT equivalent, configurable
  rounding: 'XX.99'
}
```

Formula v1:

```txt
cost_sgd = b2b_price_eur * eur_to_sgd
pre_tax_customer_sgd = cost_sgd / (1 - gross_margin_rate)
with_tax_sgd = pre_tax_customer_sgd * (1 + vat_rate)
final_customer_sgd = round_up_to_next_xx_99(with_tax_sgd)
```

Important decision: I recommend treating “50% margin” as real gross margin. If we used 50% markup instead, selling price would be much lower and the margin would only be ~33%.

---

## Phase 1 — Verify `purchase-options` contract from OpenAPI + one live response

**Objective:** Implement from the documented OpenAPI contract for `GET /api/v1/preview/{preview_id}/purchase-options/`, then confirm with one sanitized live response.

**Files:**
- Modify: `docs/mgeveryday-api-docs-gaps.md`
- Create: `tests/fixtures/mge-purchase-options.sample.json` once a real sanitized response is captured

**Steps:**
1. Read the OpenAPI schema from `/api/v1/schema/`.
2. Implement the documented response shape:
   - `preview_id`
   - `status`
   - `purchase_options[]`
   - `purchase_options[].preview_option_id`
   - `purchase_options[].product`
   - `purchase_options[].label`
   - `purchase_options[].description`
   - `purchase_options[].preview_url`
   - `purchase_options[].mockup_url`
   - `purchase_options[].production_speed`
   - `purchase_options[].order_line`
   - `purchase_options[].order_line.sku`
   - `purchase_options[].order_line.quantity`
   - `purchase_options[].order_line.preview_option_id`
   - `purchase_options[].unit_price`
   - `purchase_options[].currency`
3. Use `order_line` from the selected purchase option as the canonical MGE line-item input.
4. Capture and sanitize one real response from an actual generated preview ID.
5. Add a fixture with secrets and signed URLs removed.

**Acceptance:**
- We know exactly which fields power pricing and Stripe metadata.
- No token, private URL, customer data, or raw secret lands in git.

---

## Phase 2 — Add normalized purchase-options BFF endpoint

**Objective:** Expose safe, normalized purchase options to the frontend.

**Files:**
- Modify: `lib/mgeveryday/bff-handler.ts`
- Modify: `lib/mgeveryday/browser-preview.ts`
- Modify: `lib/mgeveryday/types.ts`
- Create: `tests/mge-purchase-options-normalize.test.ts`
- Create: `functions/api/mge/preview/[id]/purchase-options.ts` if Pages Functions routing requires a physical file

**BFF route:**

```txt
GET /api/mge/preview/{previewId}/purchase-options?preview_option_id={optionId}
```

**Normalized response:**

```ts
interface PurchaseOptionView {
  id: string
  previewOptionId: string
  sku: string
  label: string
  variantLabel: string | null
  b2bPrice: { amount: number; currency: 'EUR' }
  customerPrice: {
    amount: number
    currency: 'SGD'
    display: string
    calculation: {
      eurToSgd: number
      grossMarginRate: number
      vatRate: number
      rounding: 'XX.99'
    }
  }
  mgeOrderPayload: unknown // server-owned later; do not trust client copy for final order
}
```

**Acceptance:**
- Endpoint returns only options for the selected preview/option.
- Missing/unorderable options produce a clear UI-safe error.
- Test covers at least two SKU variants and one missing-price case.

---

## Phase 3 — Pricing engine

**Objective:** Implement deterministic customer price calculation.

**Files:**
- Create: `lib/pricing/mge-pricing.ts`
- Create: `tests/mge-pricing.test.ts`
- Modify: `lib/mgeveryday/bff-handler.ts`

**Config env vars:**

```txt
MGE_PRICING_EUR_SGD=...
MGE_PRICING_GROSS_MARGIN_RATE=0.50
MGE_PRICING_VAT_RATE=0.09
MGE_PRICING_ROUNDING=XX.99
```

**Acceptance:**
- Unit tests prove:
  - EUR to SGD conversion
  - 50% gross margin formula
  - VAT/GST applied after margin
  - values round up to `.99`
  - invalid/missing config fails closed server-side

---

## Phase 4 — Bottom purchase panel UI

**Objective:** Add the next step inside the bottom part of the page while preserving the 3D canvas.

**Files:**
- Modify: `components/single-screen-preview/guided-controls.tsx`
- Modify: `components/single-screen-preview/use-preview-flow.ts`
- Modify: `components/single-screen-preview/preview-state.ts`
- Possibly create: `components/single-screen-preview/purchase-options-panel.tsx`

**UX flow:**
1. User uploads image.
2. MGE generates preview.
3. User chooses size + source/drama preview option.
4. Bottom panel fetches MGE purchase options for the selected preview option.
5. User sees SKU cards with final customer prices.
6. User selects one purchase option/SKU.
7. Button becomes `Reserve order draft` / `Continue`.

**Acceptance:**
- 3D preview remains visible and unchanged.
- Bottom controls do not become a long scroll page.
- No delivery form is shown before the selected SKU is reserved in an MGE order draft.
- PostHog events added:
  - `purchase_options_loaded`
  - `purchase_option_selected`
  - `price_displayed`

---

## Phase 5 — Create MGE order draft before delivery

**Objective:** Reserve and validate the selected preview purchase option in MGE before collecting delivery details or starting payment.

**Why this moved before delivery/payment:** MGE order drafts should become the server-side source of truth for the selected preview option, SKU, B2B/order contract, and validation state. Stripe should charge only for a draft we know MGE can accept.

**Files:**
- Modify: `lib/mgeveryday/bff-handler.ts`
- Modify: `lib/mgeveryday/types.ts`
- Create: `lib/mgeveryday/order-draft.ts`
- Create: `tests/mge-order-draft.test.ts`
- Create: `functions/api/mge/order-drafts.ts` if Pages Functions routing requires a physical file

**Documented MGE endpoints:**
```txt
POST /api/v1/order-drafts/
PATCH /api/v1/order-drafts/{id}/
POST /api/v1/order-drafts/{id}/assets/
POST /api/v1/order-drafts/{id}/assets/from-url/
POST /api/v1/order-drafts/{id}/validate/
POST /api/v1/order-drafts/{id}/submit/
```

**Documented draft requirements:**
- `POST /order-drafts/` requires `brand_id`.
- Drafts can store `reference_id`, `carrier_company_name`, `shipping_method_id`, `shipping_address`, `line_items`, and `notes`.
- `PATCH /order-drafts/{id}/` accepts the same editable fields and resets validation state back to `DRAFT`.
- `line_items[]` uses `OrderLineItemCreate`; `sku` is required and `preview_option_id` is the documented preview-backed order input.
- Draft asset upload is documented and returns `asset_token`; for preview-backed lines we should use `preview_option_id` from `purchase_options[].order_line` rather than uploading an asset.

**Draft creation request from frontend:**
```ts
interface CreateOrderDraftRequest {
  preview_id: string
  preview_option_id: string
  purchase_option_id: string
  distinct_id?: string
}
```

**Server behavior:**
1. Re-fetch purchase options server-side.
2. Confirm `purchase_option_id` belongs to `preview_id` + `preview_option_id`.
3. Recalculate customer price server-side.
4. Create MGE order draft with the selected SKU/order contract.
5. Validate the draft before delivery using documented partial validation behavior.
6. Return a safe draft handle to the frontend.

**Normalized response:**
```ts
interface OrderDraftView {
  draftId: string
  previewId: string
  previewOptionId: string
  purchaseOptionId: string
  sku: string
  customerPrice: { amount: number; currency: 'SGD'; display: string }
  status: 'draft_created' | 'validated' | 'needs_delivery' | 'invalid'
  validationErrors?: Array<{ field?: string; message: string }>
}
```

**Acceptance:**
- Browser cannot create a draft for an arbitrary SKU/price.
- Draft creation fails closed when MGE purchase option is stale/unavailable.
- Draft ID is stored only as a server-issued handle in frontend state.
- PostHog events added:
  - `order_draft_created`
  - `order_draft_validation_failed`
  - `order_draft_validated`

---

## Phase 6 — Delivery form + update order draft with delivery

**Objective:** Collect delivery data only after an MGE order draft exists, then PATCH/validate that same draft before payment.

**Files:**
- Create: `components/checkout/delivery-draft-form.tsx` or keep inline bottom-panel component for v1
- Modify: `components/single-screen-preview/guided-controls.tsx`
- Modify: `lib/mgeveryday/order-draft.ts`
- Create/modify checkout success/cancel pages later:
  - `app/checkout/success/page.tsx`
  - `app/checkout/cancel/page.tsx`

**DeliveryDraft v1:**
```ts
interface DeliveryDraft {
  name: string
  email: string
  phone?: string
  country: 'SG'
  addressLine1: string
  addressLine2?: string
  postalCode: string
}
```

**Draft update request:**
```ts
interface UpdateOrderDraftDeliveryRequest {
  draft_id: string
  delivery: DeliveryDraft
}
```

**Server behavior:**
1. Validate delivery fields locally.
2. PATCH the existing MGE draft with delivery/customer fields.
3. Call MGE draft validation again.
4. Return final validation state and payment eligibility.

**Acceptance:**
- Payment button is disabled until MGE draft + delivery validation passes.
- Validation errors map back to the form.
- The draft ID used for payment is the same draft ID created after SKU selection.
- PostHog events added:
  - `delivery_form_started`
  - `order_draft_delivery_updated`
  - `order_draft_delivery_validated`

---

## Phase 7 — Replace fixed Stripe price with `price_data`

**Objective:** Create Stripe Checkout sessions from the validated MGE draft, not directly from browser-selected SKU data and not from fixed `STRIPE_PRICE_ID`.

**Files:**
- Modify: `lib/stripe/edge.ts`
- Modify: `tests/stripe-edge.test.ts`
- Modify: `functions/api/stripe/checkout.ts`
- Modify: `lib/mgeveryday/order-draft.ts`

**Checkout request from frontend:**
```ts
interface CheckoutRequest {
  draft_id: string
  distinct_id?: string
}
```

**Server behavior:**
1. Re-fetch/read the server-side order draft context.
2. Revalidate that the draft is payable.
3. Recalculate price from the stored/canonical purchase option.
4. Create Stripe Checkout with dynamic `price_data`.
5. Store `draft_id`, preview IDs, purchase option ID, SKU, pricing config, and idempotency reference in Stripe metadata.

**Stripe `line_items` shape:**
```txt
line_items[0][price_data][currency]=sgd
line_items[0][price_data][unit_amount]={customer_price_cents}
line_items[0][price_data][product_data][name]={label}
line_items[0][price_data][product_data][metadata][sku]={sku}
line_items[0][quantity]=1
```

**Security rule:**
- Checkout endpoint must not trust customer price, SKU, delivery, or line-item data from the browser.
- Stripe amount must match the validated MGE draft price calculation.

**Acceptance:**
- Tests prove fixed `STRIPE_PRICE_ID` is no longer used.
- Tests prove Stripe receives `price_data`, SKU metadata, draft ID, preview ID, option ID, and pricing config metadata.
- Sandbox key guard remains.
- No MGE order is submitted yet unless explicitly enabled in a later phase.

---

## Phase 8 — Submit validated MGE order after payment webhook

**Objective:** Submit the MGE order only after Stripe confirms payment, using the previously validated draft.

**Files:**
- Modify: `functions/api/stripe/webhook.ts`
- Modify: `lib/mgeveryday/order-draft.ts`
- Create: `lib/mgeveryday/order-submit.ts`
- Create: `tests/mge-order-submit.test.ts`

**Documented MGE endpoints:**
```txt
POST /api/v1/order-drafts/{id}/submit/
POST /api/v1/orders/validate/   # dry-run validation endpoint
POST /api/v1/orders/            # direct order endpoint, not the main checkout flow
```

**Scope:**
- Read `draft_id` from Stripe session metadata.
- Revalidate payment status and draft state.
- Submit MGE draft using an idempotency reference like `MYC-{stripe_session_id}`.
- Persist/log the resulting MGE order ID.
- Make duplicate webhook delivery safe.

**Acceptance:**
- Paid draft submits exactly once.
- Duplicate Stripe webhook delivery does not create duplicate MGE orders.
- Failed MGE submission is visible for retry/admin handling.

---

## Phase 9 — Feedback loop with Matej

**Objective:** Keep implementation reviewable because pricing/UX will need feedback.

**Per-phase validation:**
- Run `node --test ...` for changed units.
- Run `npx tsc --noEmit`.
- Run `npm run build`.
- Verify locally with `wrangler pages dev` where Pages Functions are involved.
- Share one testable URL only after deployment is verified.

**Review checkpoints for Matej:**
1. After Phase 1: confirm captured purchase-options and order-draft fields.
2. After Phase 3: confirm pricing formula and visible final prices.
3. After Phase 4: confirm bottom-panel SKU selection UX.
4. After Phase 5: confirm draft creation/validation behavior.
5. After Phase 6: test delivery validation before payment.
6. After Phase 7: confirm Stripe checkout data.
7. After Phase 8: confirm paid draft submission behavior.

---

## Canonical checkout sequence

```txt
Preview generated
→ preview options selected
→ purchase options fetched
→ purchase option/SKU selected
→ MGE order draft created
→ delivery form completed
→ MGE order draft patched with delivery
→ MGE order draft validated
→ Stripe Checkout sandbox payment
→ Stripe webhook confirms payment
→ MGE order draft submitted
→ confirmation shown
```

Documented asset rule: draft asset upload exists for direct-image draft items and returns `asset_token`. For preview-backed checkout, MGE docs say to copy `order_line` from `GET /api/v1/preview/{preview_id}/purchase-options/` into `line_items[]`; that means the canonical path uses `preview_option_id`, not a separate asset upload step.

---

## Open decisions

1. Confirm VAT/GST rate for Singapore v1. I proposed `0.09` because Singapore GST is 9%, but keep it configurable.
2. Confirm the exact fixed EUR→SGD rate source for 2026-01-01 before hardcoding `MGE_PRICING_EUR_SGD`.
3. Confirm whether customer-visible price should be true 50% gross margin or 50% markup. I recommend true gross margin.
4. Decide whether to show B2B-derived calculation internally only, or expose “incl. GST” breakdown to the customer.
5. Confirm one sanitized live response against the documented MGE schema before coding final fixtures.
6. Decide when MGE order submission becomes real. My recommendation: only after Stripe webhook succeeds and idempotency is implemented.
