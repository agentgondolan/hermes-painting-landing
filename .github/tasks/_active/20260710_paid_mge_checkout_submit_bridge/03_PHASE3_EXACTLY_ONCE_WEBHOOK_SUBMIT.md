Status: DONE
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

## Implemented

- Paid webhooks now require a configured durable `PAYMENT_SUBMIT_OUTBOX` before MGE submit can run.
- The outbox exposes an atomic `claimMgeSubmit()` operation.
- D1 claims transition only `paid`, `mge_submit_queued`, or `mge_retrying` rows to `mge_submitting`; abandoned claims can be reclaimed after five minutes.
- Concurrent duplicate Stripe deliveries return `submit_in_progress` without calling MGE.
- Completed duplicate deliveries return `already_submitted` from stored state and reuse the persisted MGE order id.
- Retryable MGE failures (`408`, `425`, `429`, and `5xx`) move to `mge_retrying`; permanent failures move to `mge_failed_manual_review`.
- Successful `OrderDetail.id` and compatible MGE order-id fields are persisted.
- Duplicate/already-submitted MGE responses are accepted only when a final order id or submitted status is present.

## Validation Commands

```powershell
node --test tests/stripe-edge.test.ts
npm run worker:typecheck
npm run build
```

## Validation Results

Passed on 2026-07-10:

```powershell
node --test tests/stripe-edge.test.ts
npm run worker:typecheck
npm run build
```

The focused Stripe suite passed 27 tests, including concurrent duplicate delivery, MGE `409` idempotent success, MGE `503` retry, missing metadata, and missing durable binding.

The broader `node --test tests/*.test.ts` suite also passed all 145 tests.
