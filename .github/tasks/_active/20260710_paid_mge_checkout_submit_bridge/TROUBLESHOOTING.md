# Troubleshooting

## Paid checkout enters manual review because preview option expired

Symptoms:

- Stripe Checkout Session is paid.
- `POST /api/stripe/webhook` returns `mgeOrderSubmission.status = manual_review`.
- D1 state is `mge_failed_manual_review` with one attempt.
- MGE draft submit/validate returns `preview_option_id has expired; create a fresh preview before ordering.`

Checks:

1. Query `payment_submit_outbox` by numeric `mge_order_draft_id` and confirm `attempt_count`, `state`, and sanitized `last_error`.
2. Read `GET /api/v1/order-drafts/{id}/` and confirm `status` plus `submitted_order_id`.
3. Call `POST /api/v1/order-drafts/{id}/validate/` to confirm whether the preview option is still orderable.
4. Confirm the Stripe session is paid through `GET /api/checkout/status?session_id=...` without exposing the full session id in logs or task ledgers.

Safe response:

- Keep the outbox row in manual review.
- Do not replay repeatedly; completed/manual-review claims intentionally suppress another MGE submit.
- Do not replace the draft, preview option, SKU, or price after payment without an explicit MGE recovery contract and reconciliation approval.
- Ask MGE to preserve READY-draft preview validity or provide an idempotent paid-draft refresh/rebind endpoint.

## Paid checkout stays queued and Stripe shows zero deliveries

Symptoms:

- Stripe payment completes and Dottingo records `checkout_created`.
- The success page remains in the queued/paid state.
- The configured Stripe destination reports zero event deliveries.
- The paid Checkout Session is not visible in the Stripe account containing that destination.

Cause:

- Production `STRIPE_SECRET_KEY` and the configured webhook destination belong to different Stripe sandbox accounts.

Safe response:

1. Identify the Stripe sandbox account where the paid Checkout Session is visible.
2. Create the `checkout.session.completed` destination in that account.
3. Rotate Cloudflare `STRIPE_WEBHOOK_SECRET` to the new destination secret.
4. Verify a Stripe-origin delivery before enabling real payments.
5. Do not create another test payment unless it is separately approved; use the existing paid smoke evidence while fixing account configuration.
