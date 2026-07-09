# Log

## 2026-07-10 - Task created

Author: Codex

Summary:
- Created dedicated paid MGE checkout submit bridge ledger.
- Split remaining work into five phases: validation gate, durable outbox, exactly-once submit, customer status, and production smoke.
- Captured MGE confirmation that `POST /api/v1/order-drafts/` must return numeric `id` and that order drafts are the right saved-preview checkout flow.

Researched:
- `docs/ACTIVE_WORK.md`
- `docs/payment-webhook-mge-order-status.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/TASK.md`
- MGE response pasted by user on 2026-07-10.

Commands:
- `npm run agent:status`
- `git status --short --branch`

Next action:
- Implement Phase 1: MGE draft validation gate before Stripe payment.

## 2026-07-10 - Phase 1 implemented

Author: Codex

Summary:
- Implemented the MGE draft validation gate before Stripe Checkout Session creation.
- Checkout now reads the numeric MGE order draft, calls `POST /api/v1/order-drafts/{id}/validate/`, and only proceeds when MGE marks the draft valid/ready.
- Validation failures block Stripe before payment and redact the MGE token from details.

Files changed:
- `lib/stripe/edge.ts`
- `tests/stripe-edge.test.ts`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/01_PHASE1_MGE_DRAFT_VALIDATION_GATE.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/TASK.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/LOG.md`
- `docs/ACTIVE_WORK.md`

Validation:
- `node --test tests/stripe-edge.test.ts tests/mge-purchase-options.test.ts` passed.
- `npm run worker:typecheck` passed.
- `npm run build` initially timed out at the command wrapper with no reported build error; rerun with a longer timeout passed.

Next action:
- Implement Phase 2: durable payment submit outbox.

## 2026-07-10 - Phase 2 implemented

Author: Codex

Summary:
- Added a durable payment submit outbox boundary to the Stripe edge flow.
- Checkout creation now records `checkout_created` after Stripe returns a session id when `PAYMENT_SUBMIT_OUTBOX` is configured.
- Paid Stripe webhooks record `paid` before MGE submit, then record `mge_submitting`, `mge_submitted`, or `mge_retrying`.
- If a paid webhook cannot be durably recorded, Dottingo returns non-2xx and skips MGE submit so Stripe retries.
- Added a D1-compatible schema in `docs/payment-submit-outbox-d1.sql`.

Files changed:
- `lib/stripe/edge.ts`
- `tests/stripe-edge.test.ts`
- `docs/payment-submit-outbox-d1.sql`
- `docs/payment-webhook-mge-order-status.md`
- `docs/ACTIVE_WORK.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/02_PHASE2_DURABLE_PAYMENT_SUBMIT_OUTBOX.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/TASK.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/LOG.md`

Validation:
- `node --test tests/stripe-edge.test.ts` passed.

Next action:
- Implement Phase 3: exactly-once webhook submit through the durable outbox.
