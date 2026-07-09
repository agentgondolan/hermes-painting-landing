Status: NOT STARTED
Required: yes
Created: 2026-07-10
Updated: 2026-07-10
Depends on: 03_PHASE3_EXACTLY_ONCE_WEBHOOK_SUBMIT.md
Supersedes: none

# Phase 4 - Customer Confirmation And Status Polling

## Objective

Replace the bare success page with a customer status page that explains what happened after payment.

## Implementation Notes

- Add a status endpoint, for example:

```text
GET /api/checkout/status?session_id={stripe_checkout_session_id}
```

- The endpoint should return Stripe payment state, Dottingo submission state, MGE draft id, MGE order id, and any safe customer-facing message.
- Once `mge_order_id` exists, display the order as submitted.
- If MGE submit is retrying, say the order is paid and being finalized.
- If manual review is needed, show a calm support message, not a raw API error.
- The cancel page should make it easy to return to checkout without losing selected saved designs.

## Acceptance Criteria

- Success page handles paid/submitting/submitted/retrying/manual-review states.
- Success page never exposes tokens or raw stack traces.
- The customer can see that payment succeeded even if MGE is temporarily delayed.
- Tests cover status endpoint shapes and success page source behavior.

## Validation Commands

```powershell
node --test tests/stripe-edge.test.ts
npm run worker:typecheck
npm run build
```

## Test URLs

- Local: `http://127.0.0.1:3206/checkout/success?session_id=<stripe_session_id>`
- Production: `https://dottingo.sg/checkout/success?session_id=<stripe_session_id>`

