# Payment webhook to MGE order status

Last updated: 2026-07-13

## Decision

Dottingo should own the Stripe payment webhook, durable submit attempts, retry queue, and customer-facing payment status page. MGE remains the source of truth for drafts, validation, final order creation, and final order status.

The post-payment flow is:

1. Stripe Checkout creates a paid `checkout.session.completed` event.
2. Dottingo records the Stripe event and selected MGE draft id before attempting MGE submit.
3. Dottingo submits the draft once with `POST /api/v1/order-drafts/{id}/submit/`.
4. MGE returns the final order detail. Dottingo stores the returned MGE order id.
5. The success page polls Dottingo status. Dottingo reports `paid`, `submitting`, `submitted`, `retrying`, or `manual_review`.
6. Once an MGE order id exists, status checks should use the final MGE order status, not the draft as the long-term source of truth.

## MGE contract confirmed from live schema

The live schema at `GET /api/v1/schema/` documents:

- `GET /api/v1/order-drafts/` lists server-side smart-cart drafts.
- `POST /api/v1/order-drafts/` creates a persistent draft and returns a real numeric `id`.
- `GET /api/v1/order-drafts/{id}/` retrieves one draft.
- `POST /api/v1/order-drafts/{id}/validate/` validates the draft. Valid drafts become `READY`.
- Draft detail and list responses include `submitted_order_id`.
- `POST /api/v1/order-drafts/{id}/submit/` converts the stored draft into a real order and links the submitted draft to that order.
- The submit endpoint returns `OrderDetail` with final order `id`, for example `MGE2404230001`.

So yes: after successful submit, Dottingo should check/order-display against the MGE order id. Draft status is useful before submit and as a bridge because it exposes `submitted_order_id`.

MGE confirmed on 2026-07-09 that a successful `POST /api/v1/order-drafts/` response should always include this numeric draft `id`; Dottingo should treat `201 Created` without `id` as an integration/API error.

## Current implementation gap

Dottingo previously normalized an MGE draft response with:

```ts
orderDraftId: obj.order_draft_id ?? obj.draft_id ?? obj.id ?? `${previewOptionId}:${purchaseOptionId}`
```

The fallback id is UI-only. It is not a real MGE draft id and cannot be fetched or submitted through `/api/v1/order-drafts/{id}/`.

Read-only live probes on 2026-07-09 returned HTML 404 for both:

- `GET /api/v1/order-drafts/{previewOptionId}/`
- `GET /api/v1/order-drafts/{previewOptionId}:{sku}/`

This has been changed so the payment bridge refuses checkout contexts where the order draft id is missing, synthetic, or non-numeric. A paid Stripe session must never depend on a synthetic draft id for final MGE submission.

## Required Dottingo persistence

Add a durable payment/submission store, preferably Cloudflare D1 plus a retry queue:

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

The current D1 schema is in `docs/payment-submit-outbox-d1.sql`. The Cloudflare binding expected by the Stripe edge code is `PAYMENT_SUBMIT_OUTBOX`.

For real MGE drafts, stored `line_items[]` contain the canonical SKU, quantity, and `preview_option_id`, but do not contain price. Before Stripe session creation, Dottingo calls the draft validation endpoint and uses each validation line's canonical `unit_price` and `currency` together with the stored draft quantity. Browser-supplied prices are never trusted.

Successful validation must also return the MGE READY checkout window:

```json
{
  "valid": true,
  "checkout": {
    "ready_until": "2026-07-13T10:30:00Z",
    "max_payment_session_seconds": 3600
  },
  "preview_reservations": []
}
```

Dottingo creates Stripe Checkout with `expires_at` no later than `ready_until` and no later than `max_payment_session_seconds` from validation. Missing, malformed, expired, or sub-30-minute windows block payment before Stripe is called. MGE submits the frozen READY snapshot after payment, so temporary preview TTL no longer controls the paid webhook.

MGE draft ids are integers in the canonical API response. Dottingo normalizes safe positive JSON numbers and numeric strings to the same internal string representation before validation and payment.

Suggested states:

- `checkout_created`
- `paid`
- `mge_submit_queued`
- `mge_submitting`
- `mge_submitted`
- `mge_retrying`
- `mge_failed_manual_review`

## Failure behavior

If Stripe payment succeeds but MGE is temporarily down:

- Store the Stripe event/session and MGE draft id durably.
- Retry MGE submit with the same idempotency key.
- Show the customer a success page with an order-processing state, not an error.
- Escalate to manual review only after retries are exhausted.

Return `2xx` to Stripe only after the event is durably recorded. If Dottingo cannot record the event, return a non-`2xx` so Stripe retries the webhook.

## Idempotency

Use an idempotency key derived from:

```text
stripe-checkout:{checkout_session_id}:{mge_order_draft_id}
```

If MGE returns a duplicate/already-submitted response with a final order id or `submitted_order_id`, treat it as success and store that order id.

The outbox also owns an atomic submit claim. A paid session can move from `paid`, `mge_submit_queued`, or `mge_retrying` to `mge_submitting` only when one webhook delivery acquires that claim. Concurrent or later duplicate Stripe deliveries inspect the existing state and do not call MGE again while the first submit is active or after it has completed.

An abandoned `mge_submitting` claim can be reclaimed after five minutes. Every reclaimed attempt uses the same Stripe-session-derived MGE idempotency key, so recovering from a Worker interruption cannot create a second MGE order.

## Current implementation status

Implemented on 2026-07-10:

- Checkout creation records `checkout_created` after Stripe returns a session id.
- Paid `checkout.session.completed` webhooks record `paid` before MGE submit.
- MGE submit attempts record `mge_submitting`.
- Submit success records `mge_submitted` with the final MGE order id when returned.
- Submit failure records `mge_retrying` with sanitized error text.
- If a paid webhook cannot be durably recorded, Dottingo returns non-2xx and skips MGE submit so Stripe can retry.
- Paid webhooks require the `PAYMENT_SUBMIT_OUTBOX` binding; there is no stateless paid-submit fallback.
- One webhook delivery atomically claims `mge_submitting`; concurrent duplicates return `submit_in_progress` without calling MGE.
- Later duplicates return `already_submitted` from the stored outbox row and reuse the persisted MGE order id.
- MGE `408`, `425`, `429`, and `5xx` failures move the row to `mge_retrying`; a Stripe retry can claim it again with the same idempotency key.
- Permanent MGE submit failures move the row to `mge_failed_manual_review` instead of retrying indefinitely.
- Successful MGE submit responses persist the final order id from `id`, `order_id`, `submitted_order_id`, `mge_order_id`, or `order.id`.

Production evidence from 2026-07-13:

- MGE draft `184` validated with one frozen preview reservation and a one-hour checkout window.
- Stripe test payment completed inside that window.
- The D1-backed production webhook submitted final order `MGE0980926F`.
- D1 retained one submit attempt, and a duplicate signed event returned the existing order without another MGE call.
- The production success page displayed the final order reference.

Still pending:

- Retry worker/polling behavior for `mge_retrying`.
- Align the Stripe webhook destination with the same sandbox account that owns production `STRIPE_SECRET_KEY`; the current destination is under a different account and receives zero automatic deliveries.

## Stripe account pairing

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are an account-paired configuration. The Checkout Session is created in the account that owns `STRIPE_SECRET_KEY`, while Stripe signs deliveries with the destination secret from that same account. A destination created under another Stripe account will not receive the session event, even if the URL is correct.

Before rollout, confirm in Stripe Dashboard that:

1. The paid test Checkout Session is visible in the selected sandbox account.
2. That account contains the active `checkout.session.completed` destination for `https://dottingo.sg/api/stripe/webhook`.
3. Cloudflare `STRIPE_WEBHOOK_SECRET` is the signing secret for that exact destination.

## Customer status endpoint

The success page should call a Dottingo endpoint such as:

```text
GET /api/checkout/status?session_id={stripe_checkout_session_id}
```

The endpoint should return the Dottingo submission state, Stripe payment state, MGE draft id, and MGE order id when available. Once `mge_order_id` exists, it should use MGE final order status for display.

Implemented on 2026-07-10:

- `GET /api/checkout/status?session_id=...` verifies the session directly with Stripe before reading the outbox.
- Only sessions carrying Dottingo `source` and `brand_key` metadata are accepted.
- The response contains only `sessionId`, `paymentState`, `submissionState`, `orderDraftId`, `orderId`, `terminal`, and a safe message.
- The success page polls until submitted or manual review and never renders raw upstream errors.
- The cancel path returns to the persisted cart selections at `/checkout`.

## MGE clarification to request if needed

If Dottingo misses the submit response, it needs one of these recovery paths:

- `GET /api/v1/order-drafts/{id}/` must reliably expose `submitted_order_id`.
- Or MGE should provide `GET /api/v1/order-drafts/{id}/submission/`.
- Or MGE should provide an order lookup by `reference_id` / idempotency key / Stripe session id.

Without a reliable bridge from draft id to final order id, Dottingo can retry safely but cannot always show the exact final MGE order after a transient response loss.
