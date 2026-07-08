Status: DONE
Required: yes
Created: 2026-07-03
Updated: 2026-07-06
Depends on: 03_PHASE3_MGE_DRAFT_CREATE_UPDATE_DELETE_SYNC.md
Supersedes: none

# Phase 4 - Multi-Line Checkout Handoff

## Objective

Allow Stripe checkout to start from the validated MGE draft containing multiple line items.

## Scope

- Update Stripe checkout context to read the MGE draft and its line items.
- Calculate Stripe `line_items[]` from the validated draft/canonical purchase options, not browser cart state.
- Preserve `order_draft_id` metadata for webhook submission.
- Ensure webhook still submits the paid MGE draft exactly once.
- Keep unpaid/cancelled checkout from submitting the draft.

## Acceptance

- Stripe receives one or more line items matching the validated MGE draft.
- Draft ID remains in Stripe metadata.
- Existing webhook idempotency behavior remains intact.
- Tampered browser cart state cannot change Stripe amount or MGE draft content.

## Implementation

- `/checkout` now enables payment only after the cart has been synced to an MGE draft.
- The browser Stripe handoff sends only `order_draft_id` and the verified identity token.
- The Stripe edge handler fetches the MGE order draft by id, converts draft `line_items[]` into Stripe Checkout `line_items[]`, and preserves `order_draft_id` metadata.
- Browser-provided cart data is ignored for Stripe pricing; draft line unit prices, quantities, SKUs, and labels come from the MGE draft response.
- Existing webhook behavior remains unchanged: paid Checkout Sessions submit the MGE draft with a Stripe-derived idempotency key, unpaid sessions do not submit.

## Validation

```powershell
node --test tests/stripe-edge.test.ts tests/mge-purchase-options.test.ts
npm run worker:typecheck
npm run build
```

Result on 2026-07-06:

- `node --test tests/stripe-edge.test.ts tests/mge-purchase-options.test.ts tests/cart-page-source.test.ts` passed.
- `npm run worker:typecheck` passed.
- `npm run build` passed.
