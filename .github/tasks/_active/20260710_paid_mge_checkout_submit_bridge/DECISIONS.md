# Decisions

## 2026-07-10 - Use MGE order drafts for saved-preview checkout

MGE confirmed saved-preview checkout/cart UX should use `POST /api/v1/order-drafts/`, then validate, then submit. Dottingo will not use direct `POST /api/v1/orders/` for this flow unless the product scope changes.

## 2026-07-10 - Numeric draft id required before payment

MGE confirmed successful draft creation always returns a numeric `id`. Dottingo treats missing, synthetic, or non-numeric ids as integration errors and blocks Stripe payment.

## 2026-07-10 - Draft validation is the next payment gate

Stripe payment should only start after MGE validates the draft and marks it submit-ready/READY.

## 2026-07-10 - Durable submit state belongs in Dottingo

Dottingo owns Stripe webhook receipt, durable submit state, retry state, and customer-facing status. MGE owns validation, order creation, and final order status.

## 2026-07-10 - Use a D1-compatible payment submit outbox

Dottingo Stripe code records payment/MGE submit state through a server-side `PAYMENT_SUBMIT_OUTBOX` binding. Production should bind this to Cloudflare D1 using the schema in `docs/payment-submit-outbox-d1.sql`; tests can use an in-memory outbox with the same `upsert(record)` and `claimMgeSubmit(record)` contract.

## 2026-07-10 - Require an atomic durable claim before paid MGE submit

Paid webhooks do not fall back to stateless MGE submit when `PAYMENT_SUBMIT_OUTBOX` is missing. One delivery must atomically claim the session before calling MGE. Duplicate deliveries observe `mge_submitting`, `mge_submitted`, or `mge_failed_manual_review` and do not create another active submit.

## 2026-07-10 - Recover abandoned submit claims after five minutes

A D1 row left in `mge_submitting` can be reclaimed after five minutes to recover from a Worker interruption. The retry uses the same `stripe-checkout:{session_id}:{draft_id}` MGE idempotency key. Transient HTTP failures (`408`, `425`, `429`, and `5xx`) are retryable; other MGE HTTP failures go to manual review.

## 2026-07-10 - Verify Stripe before exposing checkout status

The customer status endpoint treats the Stripe Checkout Session id as a bearer-like reference. It verifies that session with Stripe and checks Dottingo metadata before reading or returning the corresponding outbox projection. The response excludes email, event ids, attempt errors, and provider payloads.

## 2026-07-10 - Persist cart selections through Stripe navigation

Selected preview purchase options and quantities are stored in browser local storage so cancellation can return to `/checkout` without losing the cart. The stored cart and draft id are cleared only after durable status reaches `mge_submitted`.

## 2026-07-10 - Do not substitute preview options after payment

The production smoke proved that an MGE preview option can expire after draft validation but before webhook submit. Dottingo will preserve the paid session and original draft in manual review rather than silently regenerating a preview, changing the draft, or submitting a different SKU/price/output. MGE must preserve READY-draft validity or provide an explicit idempotent paid-draft recovery contract.
