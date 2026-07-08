# Active Work Ledger

Last updated: 2026-06-25

## Why this exists

Agents were losing time re-discovering repo state and answering process questions instead of shipping. This file is the handoff point: read it first, update it when the active objective changes, and keep it short.

## Active objective

Finish the paid MGE checkout bridge.

## Immediate next step

1. Run a live/sandbox checkout smoke with a real order draft and Stripe test payment.
2. Confirm the Stripe webhook reaches Cloudflare and posts to MGE draft submit.
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

2026-06-25: `node --test tests/*.test.ts`, `npm run worker:typecheck`, and `npm run build` passed after adding Stripe webhook -> MGE draft submit. Webhook now submits paid Checkout Sessions with `order_draft_id` metadata to `POST /api/v1/order-drafts/{id}/submit/`, sends a Stripe-derived `Idempotency-Key`, skips unpaid sessions, and treats already-submitted MGE responses as webhook success.

## Open product decision

The MGE previewless returning-account identity contract is now confirmed from the internal schema and testing endpoint. Next product priority remains the paid checkout bridge smoke: real order draft, Stripe test payment, webhook, and exactly-once MGE submit.
