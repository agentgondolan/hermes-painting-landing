Status: NOT STARTED
Required: yes
Created: 2026-07-10
Updated: 2026-07-10
Depends on: none
Supersedes: none

# Phase 1 - MGE Draft Validation Gate

## Objective

Before Stripe Checkout is created, Dottingo must validate the real MGE draft:

```text
POST /api/v1/order-drafts/{id}/validate/
```

Only drafts MGE marks valid/ready may continue to Stripe.

## Implementation Notes

- Add a server-side validation call in the checkout path before Stripe session creation.
- Use only the numeric `order_draft_id` already confirmed by the draft creation/sync step.
- Treat failed validation as a customer-visible checkout blocker, not as a Stripe error.
- Preserve MGE response detail in a sanitized error message for debugging.
- Do not trust browser-provided `order_draft` contents as proof of validity.
- If MGE returns a validated draft/detail with `status: READY`, carry the draft id into Stripe metadata.
- If MGE returns validation warnings/errors, block payment and show/return the API reason.

## Expected Code Areas

- `lib/stripe/edge.ts`
- `tests/stripe-edge.test.ts`
- Possibly `lib/mgeveryday/bff-handler.ts` if validation is better exposed through `/api/mge/order-draft`.
- `components/cart/multi-project-cart-page.tsx` only if the UI needs clearer validation failure copy.

## Acceptance Criteria

- Checkout calls MGE draft validation before Stripe.
- Stripe session is not created if validation fails.
- Stripe session metadata contains only a real numeric `order_draft_id`.
- Tests cover valid draft, invalid draft, MGE validation 4xx, MGE validation 5xx, and sanitized error behavior.

## Validation Commands

```powershell
node --test tests/stripe-edge.test.ts tests/mge-purchase-options.test.ts
npm run worker:typecheck
npm run build
```

