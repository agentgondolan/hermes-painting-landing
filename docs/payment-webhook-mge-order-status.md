# Payment webhook to MGE order status

Last updated: 2026-07-09

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

## Customer status endpoint

The success page should call a Dottingo endpoint such as:

```text
GET /api/checkout/status?session_id={stripe_checkout_session_id}
```

The endpoint should return the Dottingo submission state, Stripe payment state, MGE draft id, and MGE order id when available. Once `mge_order_id` exists, it should use MGE final order status for display.

## MGE clarification to request if needed

If Dottingo misses the submit response, it needs one of these recovery paths:

- `GET /api/v1/order-drafts/{id}/` must reliably expose `submitted_order_id`.
- Or MGE should provide `GET /api/v1/order-drafts/{id}/submission/`.
- Or MGE should provide an order lookup by `reference_id` / idempotency key / Stripe session id.

Without a reliable bridge from draft id to final order id, Dottingo can retry safely but cannot always show the exact final MGE order after a transient response loss.
