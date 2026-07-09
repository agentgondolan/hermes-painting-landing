Status: NOT STARTED
Required: yes
Created: 2026-07-10
Updated: 2026-07-10
Depends on: 02_PHASE2_DURABLE_PAYMENT_SUBMIT_OUTBOX.md
Supersedes: none

# Phase 3 - Exactly Once Webhook Submit

## Objective

Wire Stripe `checkout.session.completed` through the durable submit path and submit the MGE draft exactly once.

## Implementation Notes

- Keep the current Stripe signature verification.
- Read `order_draft_id` from Stripe metadata.
- Require numeric MGE draft id.
- Require Stripe payment state `paid` or `no_payment_required`.
- Submit with:

```text
POST /api/v1/order-drafts/{id}/submit/
Idempotency-Key: stripe-checkout:{checkout_session_id}:{mge_order_draft_id}
```

- Store returned MGE order id from `OrderDetail.id`, `order_id`, `submitted_order_id`, `mge_order_id`, or nested `order.id`.
- Treat MGE duplicate/already-submitted responses as success if a final order id or submitted status can be derived.
- On transient MGE failure, mark retry state instead of losing the paid order.

## Acceptance Criteria

- One paid Stripe session leads to one MGE submit attempt at a time.
- Duplicate Stripe webhook events do not double-submit.
- Already-submitted MGE draft response is idempotent success.
- MGE final order id is persisted for customer status.
- Tests cover paid, unpaid, duplicate, MGE 409 duplicate, MGE 5xx retry, and malformed metadata.

## Validation Commands

```powershell
node --test tests/stripe-edge.test.ts
npm run worker:typecheck
npm run build
```

