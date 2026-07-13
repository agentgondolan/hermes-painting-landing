# Active Work Ledger

Last updated: 2026-07-13

## Why this exists

Agents were losing time re-discovering repo state and answering process questions instead of shipping. This file is the handoff point: read it first, update it when the active objective changes, and keep it short.

## Active objective

Finish the paid MGE checkout bridge.

Current phase ledger:

- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/TASK.md`

## Immediate next step

1. Align Stripe's `checkout.session.completed` destination with the same sandbox account used by production `STRIPE_SECRET_KEY`.
2. Rotate production `STRIPE_WEBHOOK_SECRET` to that account's destination.
3. Verify one Stripe-origin webhook delivery; do not create another test payment without fresh approval.
4. Keep paid draft `173` in manual review as historical failure evidence.

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

2026-07-10 Phase 3: Exactly-once webhook submit implemented. Paid Stripe webhooks now require the durable outbox, atomically claim one active MGE submit, skip concurrent/completed duplicates, retry transient MGE failures with the same idempotency key, persist final MGE order ids, and route permanent failures to manual review. Next gap is Phase 4 customer status polling. Production still needs the `PAYMENT_SUBMIT_OUTBOX` D1 binding before a paid smoke.

2026-07-10 Phase 4: Customer confirmation and status polling implemented. The new server endpoint verifies Dottingo Stripe sessions and returns only safe durable status fields; the success page polls paid/submitting/submitted/retrying/manual-review states, and cancelled checkout restores persisted selections. Next is the explicitly approved Phase 5 production D1/deploy/payment smoke.

2026-07-10 Phase 5 infrastructure: Cloudflare OAuth refreshed; APAC D1 `dottingo-payment-submit-outbox` created and initialized; `wrangler.toml` binds it as `PAYMENT_SUBMIT_OUTBOX`. All 151 tests, Worker typecheck, and production build pass. Next is commit, deploy, and the approved payment/order-submit smoke.

2026-07-10 Phase 5 live contract: MGE draft `173` returns canonical SKU/quantity without price, while `POST /api/v1/order-drafts/173/validate/` returns canonical `unit_price` and `currency`. Stripe checkout now prices from validation output. The draft validates after test shipping is attached; no Stripe payment or MGE order exists yet.

2026-07-10 Phase 5 paid smoke: Stripe test payment completed and the signed production webhook reached the D1-backed submit path exactly once. MGE rejected draft `173` because its previously valid `preview_option_id` expired before submit. Dottingo correctly retained the paid session in `mge_failed_manual_review` with one attempt and no final order id. Phase 5 is blocked on the MGE READY-draft preview-validity contract in `05A_BLOCKED_MGE_READY_DRAFT_PREVIEW_VALIDITY_CONTRACT.md`.

2026-07-13 Phase 5A resumed: MGE now freezes preview-backed line items in READY drafts and returns `checkout.ready_until` plus `checkout.max_payment_session_seconds`. Dottingo requires that window and sets Stripe `expires_at` to the earliest MGE/Stripe cap; payment is blocked for missing or sub-30-minute windows. All 154 tests, Worker typecheck, and production build pass. Next is deploy plus one fresh paid smoke.

2026-07-13 Phase 5A verified: production draft `184` validated with one frozen preview reservation and the MGE checkout window, Stripe test payment completed, and the signed production webhook submitted final order `MGE0980926F`. D1 is `mge_submitted` with one attempt; duplicate replay returned the same order without another submit. The success page displayed the final order. Remaining gate: the automatic Stripe destination is configured under a different sandbox account than production `STRIPE_SECRET_KEY`, so it recorded zero deliveries and the smoke required a signed replay. Deployment: `https://df7dde82.hermes-painting-landing.pages.dev`.

## Open product decision

The MGE previewless returning-account identity contract is confirmed. The MGE paid checkout bridge is proven through final order creation; the next production priority is aligning the Stripe webhook destination account so normal Stripe-origin delivery reaches the already-proven submit path automatically.
