Status: DONE
Required: yes
Created: 2026-07-10
Updated: 2026-07-10
Depends on: 01_PHASE1_MGE_DRAFT_VALIDATION_GATE.md
Supersedes: none

# Phase 2 - Durable Payment Submit Outbox

## Objective

Persist Stripe payment and MGE submit state so a paid order can recover from worker restarts, webhook retries, or temporary MGE downtime.

## Recommended Shape

Use Cloudflare D1 for durable state. Add Cloudflare Queue or a retry-friendly polling path if available.

Suggested table fields:

- `stripe_session_id`
- `stripe_event_id`
- `verified_email`
- `mge_order_draft_id`
- `mge_order_id`
- `state`
- `attempt_count`
- `last_error`
- `created_at`
- `updated_at`

Suggested states:

- `checkout_created`
- `paid`
- `mge_submit_queued`
- `mge_submitting`
- `mge_submitted`
- `mge_retrying`
- `mge_failed_manual_review`

## Implementation Notes

- Create the submission row when Stripe Checkout is created or at latest when webhook is received.
- Store the Stripe event before attempting MGE submit.
- Return non-2xx to Stripe only if the event cannot be durably recorded.
- Never store secret values.
- Make writes idempotent by `stripe_session_id` and/or `stripe_event_id`.

## Implemented

- `lib/stripe/edge.ts` accepts a server-side `PAYMENT_SUBMIT_OUTBOX` binding.
- The binding can be a D1 database or a test outbox implementing `upsert(record)`.
- Checkout creation records `checkout_created` after Stripe returns a session id.
- Paid `checkout.session.completed` webhooks record `paid` before MGE submit.
- MGE submit transitions record `mge_submitting`, then `mge_submitted` with the final MGE order id when available.
- MGE submit failures record `mge_retrying` with a sanitized `last_error`.
- If the paid webhook event cannot be recorded, the webhook returns non-2xx and skips MGE submit so Stripe can retry.
- D1 schema is documented in `docs/payment-submit-outbox-d1.sql`.

## Acceptance Criteria

- A paid webhook can be retried without losing submit state.
- Duplicate Stripe events do not create duplicate submission rows.
- The submission row can store the MGE final order id once submit succeeds.
- Tests cover duplicate event/session handling and persistence failures.

## Validation Commands

```powershell
node --test tests/stripe-edge.test.ts
npm run worker:typecheck
npm run build
```

## Validation Results

```powershell
node --test tests/stripe-edge.test.ts
```

Passed on 2026-07-10.
