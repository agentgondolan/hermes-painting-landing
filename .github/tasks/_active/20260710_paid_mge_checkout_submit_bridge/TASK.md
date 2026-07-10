Status: IN PROGRESS
Created: 2026-07-10
Updated: 2026-07-10
Owner: Codex
Proposed branch: codex/paid-mge-checkout-submit-bridge

# Paid MGE Checkout Submit Bridge

## Overview

Finish the paid Dottingo checkout bridge:

`saved previews -> MGE order draft -> MGE draft validation -> Stripe payment -> webhook -> MGE draft submit exactly once -> customer confirmation`

This task starts after the cart page and draft sync work. Dottingo now rejects missing, synthetic, or non-numeric MGE draft ids before payment. The remaining work is to make the draft submit-ready, persist the payment/submission state, submit to MGE safely after Stripe payment, and show the customer the final order status.

## Goals

- Validate the real MGE order draft before Stripe payment.
- Store enough Dottingo-side payment/submission state to survive retries and temporary MGE downtime.
- Submit the paid MGE draft exactly once from the Stripe webhook.
- Store the final MGE order id returned by `POST /api/v1/order-drafts/{id}/submit/`.
- Let the success page show clear status: paid, submitting, submitted, retrying, failed/manual review.
- Keep MGE as source of truth for draft validation, final order creation, and final order status.
- Keep MGE and Stripe tokens server-side only.

## Non-Goals

- Do not synthesize MGE order ids or draft ids.
- Do not submit MGE orders before Stripe confirms payment.
- Do not build a general customer order-history UI.
- Do not replace MGE order-draft/order APIs with Dottingo-local order creation.
- Do not broaden product/framing rules beyond purchase options returned by MGE.

## Confirmed MGE Contract

MGE confirmed on 2026-07-09:

- Successful `POST /api/v1/order-drafts/` always returns a real numeric draft `id`.
- Dottingo can treat `201 Created` without `id` as an integration/API error.
- Submit-ready flow:
  1. `GET /api/v1/preview/{preview_id}/purchase-options/`
  2. `POST /api/v1/order-drafts/`
  3. `POST /api/v1/order-drafts/{id}/validate/`
  4. `POST /api/v1/order-drafts/{id}/submit/`
- Valid drafts become `READY`.
- Submit creates the real order and returns the submitted order response.
- Direct `POST /api/v1/orders/` exists, but saved-preview checkout/cart UX should use order drafts.

## Current State

- `lib/mgeveryday/bff-handler.ts` creates/syncs MGE order drafts and now rejects successful draft responses without a numeric id.
- `lib/stripe/edge.ts` rejects synthetic/non-numeric `order_draft_id` before Stripe payment and before webhook submit.
- `lib/stripe/edge.ts` can submit a paid draft to MGE with a Stripe-derived idempotency key.
- `lib/stripe/edge.ts` records checkout/payment/MGE submit state through a server-side `PAYMENT_SUBMIT_OUTBOX` binding and requires it before any paid MGE submit.
- The outbox atomically claims one active submit per Stripe session and stores the final MGE order id.
- `GET /api/checkout/status` verifies the Stripe session and returns a safe customer-facing projection of durable submission state.
- The success page polls through submitted/retrying/manual-review states, while cancelled checkout restores locally persisted selections.
- Stripe checkout prices real MGE drafts from the canonical validation response because stored draft lines intentionally omit price fields.
- `docs/payment-submit-outbox-d1.sql` defines the D1 table expected for durable production storage.
- `docs/payment-webhook-mge-order-status.md` documents the webhook/order status architecture.
- `docs/ACTIVE_WORK.md` names draft validation and durable webhook submit tracking as the immediate next gaps.

## Phase Index

1. [DONE - Phase 1 - MGE Draft Validation Gate](01_PHASE1_MGE_DRAFT_VALIDATION_GATE.md)
2. [DONE - Phase 2 - Durable Payment Submit Outbox](02_PHASE2_DURABLE_PAYMENT_SUBMIT_OUTBOX.md)
3. [DONE - Phase 3 - Exactly Once Webhook Submit](03_PHASE3_EXACTLY_ONCE_WEBHOOK_SUBMIT.md)
4. [DONE - Phase 4 - Customer Confirmation And Status Polling](04_PHASE4_CUSTOMER_CONFIRMATION_AND_STATUS_POLLING.md)
5. [BLOCKED - Phase 5 - Production Payment Order Submit Smoke](05_PHASE5_PRODUCTION_PAYMENT_ORDER_SUBMIT_SMOKE.md)
5A. [BLOCKED - Phase 5A - MGE Ready-Draft Preview Validity Contract](05A_BLOCKED_MGE_READY_DRAFT_PREVIEW_VALIDITY_CONTRACT.md)

## Dependencies

- MGE order draft creation must return a numeric id.
- MGE draft validation must expose a machine-readable success/failure response.
- Stripe checkout must be test-mode until the live-payment submit smoke is explicitly approved.
- Cloudflare Pages/Functions must have the required Stripe, MGE, and dev-login secrets configured.
- If a durable store is added, Cloudflare D1/Queues configuration must be committed without secret values.

## Rollout Plan

1. Implement and locally test the validation gate.
2. Add durable state/outbox without changing customer-facing behavior.
3. Wire webhook submit through the durable state path.
4. Add customer-facing status polling and clearer success/cancel pages.
5. Deploy to Cloudflare production and run a single approved Stripe test payment smoke through MGE submit.

## Validation Strategy

Focused tests:

```powershell
node --test tests/mge-purchase-options.test.ts tests/stripe-edge.test.ts
```

Broader checks:

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

Deploy/status checks:

```powershell
npx wrangler pages deployment list --project-name hermes-painting-landing
```

## Test URLs To Share

- Local checkout: `http://127.0.0.1:3206/checkout`
- Production checkout: `https://dottingo.sg/checkout`
- Production success page after Stripe: `https://dottingo.sg/checkout/success?session_id=<stripe_session_id>`
- Production deployment URL from Wrangler for each release.

## Next Action

Send the Phase 5A contract request to MGE. Resume the production smoke only after MGE guarantees READY-draft preview validity through payment or provides a safe paid-draft refresh/rebind endpoint. Do not create another payment or mutate paid draft `173` as a workaround.
