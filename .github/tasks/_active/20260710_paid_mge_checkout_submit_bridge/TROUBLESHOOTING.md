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

## Checkout Session is absent after rotating the Stripe secret

Symptoms:

- Cloudflare lists `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as configured.
- Dottingo successfully creates a Stripe Checkout page.
- `GET /v1/checkout/sessions/{session_id}` with the intended account key returns `404`.
- The intended Stripe account's session list is empty.

Cause:

- The active Pages deployment still uses the previous Stripe account configuration even though the secret names exist. Cloudflare's encrypted secret list cannot prove the active value or account ownership.

Safe response:

1. Re-upload both account-paired secrets without printing their values.
2. Run `npm run build` to successful completion.
3. Deploy the completed `.next/prod` output to the production branch.
4. Create a new unpaid Checkout Session.
5. Query that Session with the intended Stripe account key before clicking Pay.
6. Continue only when the intended account returns the open unpaid Session.

## Deployment URL returns 404 after an interrupted build

Symptoms:

- `npm run build` was interrupted or timed out.
- `.next/prod` exists, so a subsequent Pages deploy appears to succeed.
- The new deployment URL returns `404` for `/checkout` or `/checkout/success`.

Cause:

- An incomplete `.next/prod` output was deployed.

Safe response:

1. Do not trust the existence or timestamp of `.next/prod` after an interrupted build.
2. Rerun `npm run build` and require exit code `0` plus the expected route table.
3. Deploy only that completed output.
4. Verify `/checkout` and `/checkout/success` return `200` on the immutable deployment URL and custom domain.
