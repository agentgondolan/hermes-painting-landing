# MGE Cart + Multi-preview Order Phased Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the current single-preview checkout with an MGE-backed cart flow that supports multiple generated previews in one order.

**Architecture:** MGE **order drafts** are the canonical cart/order state. Dottingo does not maintain a frontend cart. The browser may keep only the MGE `order_draft_id` pointer needed to re-open the same draft; all items, prices, and validation live in MGE.

**Tech Stack:** Next.js/React, Cloudflare Pages Functions, MGEveryday BFF, Stripe Checkout, PostHog.

---

## Current behavior

- One selected preview option goes straight to Stripe Checkout.
- `PurchasePanel` owns the selected purchase option and calls `/api/stripe/checkout`.
- `lib/stripe/edge.ts` builds exactly one Stripe line item: `line_items[0]`.
- `lib/mgeveryday/bff-handler.ts` currently has preview, purchase-options, and order-draft support, but no MGE cart API wrapper yet.

## Target behavior

- Generated preview can be added to the **MGE cart API**.
- Generated preview can be added to an **MGE order draft**.
- A customer can generate another preview and add it to the same MGE draft.
- Checkout uses the MGE order draft as the source of truth, not a frontend-only cart.
- Stripe metadata can reconcile payment back to `order_draft_id` and every draft line.

## Phase 0 — Confirm MGE order-draft contract

**Result:** MGE supports this. Do not build a Dottingo-local cart.

**Confirmed from MGE OpenAPI schema (`https://www.mgeveryday.sg/api/v1/schema/`):**

1. `OrderCreate` supports `line_items: array`, so orders are not inherently single-item.
2. `POST /api/v1/order-drafts/` creates a server-side draft. Required: `brand_id`. Optional fields include `reference_id`, `shipping_method_id`, `shipping_address`, `shipping_pickup_point`, `line_items`, and `notes`.
3. `GET /api/v1/order-drafts/{id}/` loads one draft.
4. `PATCH /api/v1/order-drafts/{id}/` edits a draft. `PatchedOrderDraftUpdate` accepts `line_items`, so adding/removing previews should edit the MGE draft, not local state.
5. `POST /api/v1/order-drafts/{id}/validate/` validates the current draft.
6. `POST /api/v1/order-drafts/{id}/submit/` submits a validated draft through the canonical order path.
7. Draft responses expose `item_count`, `line_items`, `assets`, `status`, and `submitted_order_id`.

**Decision:** `order_draft_id` is the canonical buyer cart identifier. Dottingo stores only that pointer for continuity; all draft contents are fetched/edited in MGE.

**Acceptance:**

- The implementation uses MGE order drafts for multi-preview order state.
- No frontend-only cart item list is introduced.
- Browser state never becomes the source of truth for items/prices.

## Phase 1 — MGE cart BFF + browser cache

**Purpose:** expose the MGE cart API through the Dottingo BFF and keep only a lightweight browser cache.

**Expected BFF shape, exact paths dependent on Phase 0:**

```ts
POST   /api/mge/cart
GET    /api/mge/cart/:cart_id
POST   /api/mge/cart/:cart_id/items
PATCH  /api/mge/cart/:cart_id/items/:item_id
DELETE /api/mge/cart/:cart_id/items/:item_id
```

**Browser cache stores only recovery/display fields:**

```ts
type CartItem = {
  id: string
  mgeCartItemId: string
  previewId: string
  previewOptionId: string
  purchaseOptionId: string
  sku: string
  selectedSize: string
  previewImageUrl: string | null
  title: string
  quantity: 1
  unitAmountSgd: number
  displayAmount: string
  createdAt: number
}

type CartCache = {
  mgeCartId: string
  updatedAt: number
  items: CartItem[]
}
```

**Likely files:**

- `lib/mgeveryday/bff-handler.ts`
- Create `lib/mgeveryday/cart.ts` if the BFF logic gets large
- Create `functions/api/mge/cart*.ts` route files as needed
- Create `components/cart/cart-state.ts`
- Create `components/cart/use-cart.ts`
- Possibly replace/extend `components/single-screen-preview/checkout-persistence.ts`

**Rules:**

- MGE cart persists server-side; localStorage only stores `mgeCartId` + last known summary.
- On page load, re-fetch the MGE cart before showing totals or checkout.
- Add/remove/update actions call MGE first, then update local cache from the MGE response.
- Deduplication should follow MGE cart behavior. If MGE does not dedupe, Dottingo may ask MGE to update quantity for same `previewId + previewOptionId + sku` instead of adding another line.
- Keep verified identity separate from cart.

**Tests:**

- BFF creates/loads an MGE cart with auth headers redacted in errors.
- Add item sends preview/purchase option fields to MGE cart API.
- Remove item calls MGE and refreshes cart summary.
- Browser restore re-fetches MGE cart by id.
- Stale/missing cart id clears local cache gracefully.

## Phase 2 — UI: Add to cart + cart card

**Purpose:** convert current “Checkout” action into shop-style cart behavior while still using MGE as source of truth.

**Change `PurchasePanel`:**

- Primary CTA becomes `Add to cart`.
- CTA calls the MGE cart BFF with the selected preview + selected purchase option.
- After successful add, show two choices:
  - `Create another design`
  - `Checkout`
- Keep `Save and get back later` as secondary account flow.

**Add upper-right cart card/button:**

- Visible near the current Account button in `SingleScreenPreviewShell` / `LayoutFrame`.
- Shows item count and subtotal from refreshed MGE cart summary.
- Opens a cart drawer/card.
- Cart drawer shows preview thumbnails, size, price, remove action, and checkout CTA.

**Likely files:**

- `components/single-screen-preview/purchase-panel.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `components/single-screen-preview/layout-frame.tsx`
- Create `components/cart/cart-card.tsx`
- Create `components/cart/cart-drawer.tsx`

**UX notes:**

- Upper-right should not fight the existing verified account pill.
- On mobile, use a compact floating cart pill.
- “Create another design” should reset only the preview workspace, not the MGE cart.

**Tests:**

- Source/UI test verifies CTA text changed to `Add to cart`.
- Cart card is rendered in shell.
- Add-to-cart calls the MGE cart BFF and updates the cart card from the returned MGE cart summary.

## Phase 3 — Checkout from MGE cart

**Purpose:** create Stripe Checkout from the canonical MGE cart, not from arbitrary client line items.

**Change `/api/stripe/checkout` request body from single preview to:**

```ts
type CheckoutCartRequest = {
  identity_token?: string
  mge_cart_id: string
}
```

**Server behavior:**

1. Verify identity if present.
2. Load the MGE cart server-side.
3. Use MGE-returned canonical items, prices, currency, preview data, and totals.
4. Build Stripe `line_items[n]` from the MGE cart lines.
5. Put compact cart/order metadata on the session, including `mge_cart_id`.
6. Reject empty/stale/unorderable carts with a clear error.

**Likely files:**

- `lib/stripe/edge.ts`
- `functions/api/stripe/checkout.ts`
- `lib/mgeveryday/cart.ts`
- `tests/stripe-edge.test.ts`

**Acceptance:**

- Stripe request contains multiple `line_items[n]`.
- Client-sent line items and prices are ignored.
- MGE cart totals/items are the only checkout source.
- Failed stale cart returns actionable item-level errors if MGE provides them.

## Phase 4 — MGE cart-to-order/payment strategy

**Purpose:** connect paid Stripe sessions back to the MGE cart/order lifecycle.

**Preferred flow:**

- User adds lines to MGE cart through Dottingo BFF.
- Checkout loads the MGE cart and creates Stripe Checkout.
- Stripe metadata stores `mge_cart_id` plus any MGE checkout/order id if the cart API provides one.
- On successful payment, call the MGE cart checkout/submit/finalize endpoint.

**Fallback only if MGE cart API still requires order drafts internally:**

- Convert MGE cart to an MGE order draft before Stripe.
- Store both `mge_cart_id` and `order_draft_id` in Stripe metadata.
- On successful payment, validate/submit the converted draft.

**Likely files:**

- `lib/mgeveryday/bff-handler.ts`
- `lib/mgeveryday/cart.ts`
- `lib/stripe/edge.ts`
- `functions/api/stripe/webhook.ts`
- `tests/mge-cart.test.ts`
- `tests/stripe-edge.test.ts`

**Acceptance:**

- Paid Stripe session can be reconciled to the MGE cart and every preview item in it.
- Fulfillment never depends on untrusted client-side cart data.

## Phase 5 — Buyer continuity + saved order state

**Purpose:** cart/order survives realistic buyer behavior.

**Add:**

- MGE cart id survives email verification return.
- Account panel shows saved MGE cart/order state, not only saved current preview.
- Success/cancel pages restore cart state correctly.
- Clear browser cart cache after successful checkout only when payment session is created or completed, depending on desired UX.

**Likely files:**

- `components/account/account-panel.tsx`
- `lib/account/preview-registry.ts`
- `components/single-screen-preview/checkout-persistence.ts`
- `app/checkout/cancel/page.tsx`
- `app/checkout/success/page.tsx`

**Acceptance:**

- User can generate preview A, add it to MGE cart, generate preview B, add it to MGE cart, verify email, return, and still see both items from the refreshed MGE cart.

## Phase 6 — Analytics + smoke tests

**Purpose:** make conversion funnel measurable and safe to ship.

**PostHog events:**

- `cart_item_added`
- `cart_opened`
- `cart_item_removed`
- `cart_checkout_clicked`
- `cart_checkout_created`
- `cart_checkout_failed`

**Smoke path:**

1. Upload image.
2. Select preview option + size.
3. Add to MGE cart.
4. Create another preview.
5. Add second item to MGE cart.
6. Open cart card upper-right.
7. Remove/re-add item.
8. Checkout.
9. Verify Stripe line items count and metadata.
10. Verify MGE cart/order finalize path after payment webhook in test/sandbox mode.
11. Verify no console errors.

**Acceptance:**

- Source tests pass.
- Worker typecheck passes.
- Next build passes.
- Browser smoke passes on deployed test URL.

## Recommended build order

1. Phase 0 MGE cart contract check.
2. Phase 1 MGE cart BFF + browser cache with tests.
3. Phase 2 visible add-to-cart UI.
4. Phase 3 checkout from MGE cart.
5. Phase 4 MGE cart-to-order/payment strategy.
6. Phase 5 account/order continuity.
7. Phase 6 analytics + deployed smoke.

Do not start with the cart UI if Phase 0 is unresolved. The user-facing flow depends on the exact MGE cart API contract.
