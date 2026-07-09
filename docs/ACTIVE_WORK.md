# Active Work Ledger

Last updated: 2026-06-25

## Why this exists

Agents were losing time re-discovering repo state and answering process questions instead of shipping. This file is the handoff point: read it first, update it when the active objective changes, and keep it short.

## Active objective

Finish the paid MGE checkout bridge.

Current phase ledger:

- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/TASK.md`

## Immediate next step

1. Implement Phase 3 in `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/03_PHASE3_EXACTLY_ONCE_WEBHOOK_SUBMIT.md`: gate MGE submit through the durable outbox so duplicate/retried Stripe events do not run parallel or repeated submits.
2. Confirm the Stripe webhook reaches Cloudflare and posts to MGE draft submit through the durable path.
3. Confirm MGE duplicate-submit behavior with the Stripe idempotency key.
4. Improve checkout success/cancel pages to show the submitted MGE order status once the live response shape is confirmed.

## Current known repo state

The working tree may contain existing active changes in:

- `components/account/account-panel.tsx`
- `components/single-screen-preview/purchase-panel.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `lib/account/preview-registry.ts`
- `tests/account-panel-source.test.ts`
- `tests/magic-link-return-source.test.ts`
- `tests/purchase-panel-source.test.ts`

Untracked artifacts/plans may exist. Do not sweep them into commits unless they are part of the task.

## Verification ladder

Use the fastest command that proves the requested work, then climb if the change touches broader flow:

1. `node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts`
2. `node --test tests/*.test.ts`
3. `npm run worker:typecheck`
4. `npm run build`
5. Smoke-test the verified deployed URL before sharing it.

## Latest verification

2026-07-09: `node --test tests/identity-edge.test.ts tests/account-panel-source.test.ts`, `node --test tests/stripe-edge.test.ts`, `npm run worker:typecheck`, and `npm run build` passed. Production deploy `https://81a2c08f.hermes-painting-landing.pages.dev` reached `https://dottingo.sg/`. Token-gated Matej test login works on production, production MGE draft creation works, Stripe test Checkout Session creation works, and browser test payment returned to `/checkout/success`. Remaining gap is direct webhook-to-MGE-submit observability.

2026-07-09 follow-up: Live MGE schema confirms `POST /api/v1/order-drafts/{id}/submit/` returns final `OrderDetail.id`, while draft detail/list expose `submitted_order_id`. Post-submit status should therefore anchor on the MGE order id. Read-only probes showed the current fallback `previewOptionId:SKU` draft id returns 404 from MGE draft endpoints, so paid checkout must use a real MGE integer draft id before live submit can be reliable. See `docs/payment-webhook-mge-order-status.md`.

2026-07-09 MGE confirmation: successful `POST /api/v1/order-drafts/` must return a real numeric draft `id`; `201 Created` without `id` is an API/integration error. Dottingo now rejects missing, synthetic, or non-numeric draft ids before Stripe payment/webhook submit. Next gap is validation before payment, then durable webhook submit tracking.

2026-07-10 planning: Created `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/` to finish the full draft/payment/order-submit flow in five phases: validation gate, durable submit outbox, exactly-once webhook submit, customer status page, and production smoke.

2026-07-10 Phase 1: MGE draft validation gate implemented. Stripe checkout now validates the numeric MGE draft with `POST /api/v1/order-drafts/{id}/validate/` before creating a Checkout Session and blocks payment on unreadable/invalid/unavailable validation responses.

2026-07-10 Phase 2: Durable payment submit outbox implemented in `lib/stripe/edge.ts`. Checkout creation records `checkout_created`, paid Stripe webhooks record `paid` before MGE submit, submit success records `mge_submitted` with the MGE order id, and submit failure records `mge_retrying` with sanitized error text. D1 schema is documented in `docs/payment-submit-outbox-d1.sql`. Next gap is Phase 3 exactly-once submit/retry behavior.

## Open product decision

The MGE previewless returning-account identity contract is now confirmed from the internal schema and testing endpoint. Next product priority remains the paid checkout bridge smoke: real order draft, Stripe test payment, webhook, and exactly-once MGE submit.
