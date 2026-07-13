Status: DONE
Required: yes
Created: 2026-07-10
Updated: 2026-07-13
Depends on: 01_PHASE1_MGE_DRAFT_VALIDATION_GATE.md
Blocks: 05_PHASE5_PRODUCTION_PAYMENT_ORDER_SUBMIT_SMOKE.md

# Phase 5A - MGE Ready-Draft Preview Validity Contract

## Objective

Close the paid-order race between an MGE draft becoming `READY` and its referenced `preview_option_id` expiring before the Stripe webhook submits the draft.

## Production Evidence

- MGE draft `173` was created and validated successfully before Stripe Checkout.
- Stripe test Checkout Session creation was recorded at `2026-07-10T07:01:08Z`.
- Stripe payment completed and the signed production webhook was replayed at `2026-07-10T15:12:35Z`.
- Dottingo durably recorded one submit attempt and used the expected Stripe-session/draft idempotency key.
- `POST /api/v1/order-drafts/173/submit/` returned `400` because preview option `b67a7d82...ecf1` had expired.
- A direct follow-up `POST /api/v1/order-drafts/173/validate/` returned the same machine-readable error:

```text
preview_option_id has expired; create a fresh preview before ordering.
```

- MGE draft `173` is now `DRAFT` with `submitted_order_id = null`.
- Dottingo correctly moved the paid session to `mge_failed_manual_review`; no final MGE order was created.

## Required MGE Contract

MGE should confirm and implement one safe contract:

1. A successfully validated `READY` draft reserves or pins every referenced `preview_option_id` until the draft is submitted or expires, with a validity window at least as long as the permitted Stripe Checkout Session lifetime.
2. Or MGE provides an idempotent server-side endpoint that refreshes/rebinds an already-paid draft to a fresh preview option while preserving the validated size, crop/output, SKU, price, source project, and order identity.

MGE should also document:

- preview-option TTL,
- order-draft READY TTL,
- whether submitting an already-validated READY draft revalidates preview-option expiry,
- the maximum safe Stripe Checkout Session lifetime,
- the supported recovery for payment received after a preview option expires.

## Dottingo Safety Rule

Dottingo must not silently swap a preview option or draft after payment. Until MGE provides a safe contract, this case remains in manual review with the paid session, original draft id, and error preserved for reconciliation.

## Acceptance Criteria

- A fresh draft can validate, remain submit-ready for the documented checkout window, and submit after payment.
- Replaying the same paid Stripe event does not create a second MGE order.
- The success page reaches `submitted` and displays the final MGE order id.
- The recovery contract does not change SKU, price, crop/output, or source project after payment.

## MGE Resolution Received 2026-07-13

MGE now freezes preview-backed line items in the READY draft snapshot and returns:

- `checkout.ready_until`
- `checkout.max_payment_session_seconds`
- `preview_reservations[]`

MGE confirmed that a payment completed within `checkout.ready_until` can submit the saved READY snapshot even if the original temporary preview/session TTL has elapsed. Duplicate submit calls return the existing submitted order.

Dottingo now requires this checkout window for real MGE drafts and sets Stripe `expires_at` to the earliest of:

- MGE `checkout.ready_until`,
- the MGE `max_payment_session_seconds` cap, and
- Stripe's 24-hour maximum.

Dottingo blocks payment when the MGE window is absent, malformed, or shorter than Stripe's 30-minute minimum.

## Completion Evidence - 2026-07-13

- MGE draft `184` validated with `valid = true`, one `preview_reservations[]` entry, `checkout.ready_until`, and `max_payment_session_seconds = 3600`.
- Stripe test payment completed inside the returned READY window.
- The signed production webhook submitted the frozen draft successfully as order `MGE0980926F`.
- MGE draft detail reports `status = SUBMITTED` and `submitted_order_id = MGE0980926F`.
- D1 reports `mge_submitted`, attempt count `1`, and no error.
- Replaying the same signed event returned `already_submitted` with the same order id and did not increment the attempt count.

The MGE preview-validity blocker is closed. Stripe automatic event delivery account alignment remains a separate Phase 5 production configuration gate.
