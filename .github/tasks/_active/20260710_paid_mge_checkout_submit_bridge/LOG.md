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

## 2026-07-10 - Phase 3 implemented

Author: Codex

Summary:
- Added an atomic durable claim before MGE draft submit.
- Concurrent and completed duplicate Stripe deliveries no longer call MGE again.
- Added retry-state handling for transient MGE failures and manual-review handling for permanent failures.
- Required the durable outbox for every paid submit and persisted MGE `OrderDetail.id` responses.

Files changed:
- `lib/stripe/edge.ts`
- `tests/stripe-edge.test.ts`
- `docs/payment-webhook-mge-order-status.md`
- `docs/ACTIVE_WORK.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/03_PHASE3_EXACTLY_ONCE_WEBHOOK_SUBMIT.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/TASK.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/LOG.md`
- `.github/tasks/_active/20260710_paid_mge_checkout_submit_bridge/DECISIONS.md`

Validation:
- `node --test tests/stripe-edge.test.ts` passed (27 tests).
- `node --test tests/*.test.ts` passed (145 tests).
- `npm run worker:typecheck` passed.
- `npm run build` passed.

Next action:
- Implement Phase 4: customer confirmation and checkout status polling.

## 2026-07-10 - Phase 4 implemented

Author: Codex

Summary:
- Added a Stripe-verified, outbox-backed customer checkout status endpoint.
- Replaced the bare success page with automatic polling across paid, submitting, submitted, retrying, and manual-review states.
- Added final MGE order reference display without exposing raw provider data.
- Persisted checkout selections across Stripe cancellation and clear them after confirmed submission.

Files changed:
- `lib/stripe/edge.ts`
- `functions/api/checkout/status.ts`
- `components/checkout/checkout-success-status.tsx`
- `app/checkout/success/page.tsx`
- `app/checkout/cancel/page.tsx`
- `components/cart/multi-project-cart-page.tsx`
- `lib/cart/browser-storage.ts`
- `tests/stripe-edge.test.ts`
- `tests/checkout-status-source.test.ts`
- `tests/cart-page-source.test.ts`
- `docs/payment-webhook-mge-order-status.md`
- `docs/ACTIVE_WORK.md`
- Phase task ledger files.

Validation:
- Focused checkout/Stripe tests passed (45 tests).
- `node --test tests/*.test.ts` passed (151 tests).
- `npm run worker:typecheck` passed.
- `npm run build` passed after rerunning with a longer command timeout.
- Browser verification passed for local success and cancel pages.

Next action:
- Implement Phase 5 only with explicit approval: configure production D1, deploy, and run one Stripe test payment that creates a real MGE order record.

## 2026-07-10 - Phase 5 started; Cloudflare re-authentication required

Author: Codex

Summary:
- Recorded the user's explicit approval for the production Stripe-test/MGE-order smoke.
- Verified the repo, phase prerequisites, Git remote, and existing uncommitted Phase 3/4 scope.
- Confirmed the saved Wrangler OAuth token has expired.
- Started a fresh `wrangler login` flow in the default browser.

External state:
- No D1 database or binding created yet.
- No commit, push, or production deployment performed yet.
- No Stripe payment or MGE order submit performed yet.

Blocker:
- User must complete the Cloudflare sign-in opened by Wrangler.

Next action:
- After login, verify the Cloudflare account/project, download the current Pages configuration, create and initialize D1, add the binding, validate, commit/push/deploy, then run the approved smoke.

## 2026-07-10 - Phase 5 infrastructure ready

Author: Codex

Summary:
- Refreshed Wrangler OAuth and confirmed the `hermes-painting-landing` Pages project.
- Created APAC D1 database `dottingo-payment-submit-outbox`.
- Initialized the durable outbox table and indexes from `docs/payment-submit-outbox-d1.sql`.
- Added the production `PAYMENT_SUBMIT_OUTBOX` binding and `.next/prod` Pages output directory to `wrangler.toml`.
- Confirmed the required production secret names are configured without reading or exposing their values.

Validation:
- Remote D1 query confirmed `payment_submit_outbox` and both indexes.
- `node --test tests/*.test.ts` passed all 151 tests.
- `npm run worker:typecheck` passed.
- `npm run build` passed.

Next action:
- Commit and push the tested revision, deploy it to Cloudflare Pages, then complete the approved Stripe test payment and verify exactly one final MGE order.

## 2026-07-10 - Phase 5 live contract reconciliation

Author: Codex

Summary:
- Created live MGE draft `173` from one saved 60x80 W/STD purchase option without creating a payment or final order.
- Confirmed MGE draft validation requires shipping method and address; attached clearly marked test shipping data and validated the draft successfully.
- Confirmed stored draft lines intentionally omit price while validation lines return canonical `unit_price` and `currency`.
- Updated Stripe checkout to merge validation pricing with stored draft quantities instead of trusting browser prices or requiring price on draft detail.

Validation:
- `node --test tests/stripe-edge.test.ts` passed all 30 tests.
- `node --test tests/*.test.ts` passed all 151 tests.
- `npm run worker:typecheck` passed.
- `npm run build` passed.

Next action:
- Commit, push, and deploy the validation-pricing fix, then resume the approved Stripe test payment for draft `173`.

## 2026-07-10 - Phase 5 paid smoke reached safe manual review

Author: Codex

Summary:
- Deployed commit `fed3118` with the production D1 outbox and Stripe/MGE submit path.
- Created Stripe destination `Dottingo checkout webhook` for `checkout.session.completed`, rotated its signing secret, and configured the rotated value in Cloudflare without committing it.
- Deployed `https://17baddc6.hermes-painting-landing.pages.dev` to production.
- Completed Stripe test payment for numeric MGE draft `173`.
- Sent one correctly signed production webhook replay for the paid Checkout Session because the Stripe destination was created after the original event.
- Confirmed the webhook recorded one durable submit attempt and did not create a duplicate order.
- Replayed the same signed event a second time and confirmed D1 remained at attempt count `1` with no MGE order id.
- MGE rejected submit with `400`: `preview_option_id has expired; create a fresh preview before ordering.`
- Confirmed direct MGE validation returns the same error; draft `173` is `DRAFT` with no submitted order.
- Dottingo correctly exposed `paid + manual_review` on the safe checkout-status endpoint and retained no MGE order id.

Production evidence:
- Outbox before webhook: `checkout_created`, attempt count `0`.
- Outbox after webhook: `mge_failed_manual_review`, attempt count `1`, MGE order id `null`.
- Stripe payment state: `paid`.
- Customer submission state: `manual_review`.
- MGE draft: `173`, status `DRAFT`, `submitted_order_id = null`.

Blocker:
- MGE does not currently guarantee that a validated READY draft remains orderable through the Stripe checkout window.
- See `05A_BLOCKED_MGE_READY_DRAFT_PREVIEW_VALIDITY_CONTRACT.md` and `TROUBLESHOOTING.md`.

Next action:
- Ask MGE to preserve READY-draft preview validity or provide a safe idempotent paid-draft refresh/rebind contract, then repeat the smoke with a fresh preview/draft only after the contract is confirmed.

## 2026-07-13 - Phase 5A contract implemented locally

Author: Codex

Summary:
- Recorded MGE's new READY-draft snapshot and checkout-window contract.
- Real MGE draft checkout now requires `checkout.ready_until` and `checkout.max_payment_session_seconds` from validation.
- Stripe `expires_at` is capped by the MGE ready timestamp, the MGE duration cap, and Stripe's 24-hour maximum.
- Checkout is blocked before Stripe when the MGE window is missing, malformed, expired, or shorter than Stripe's 30-minute minimum.
- Paid draft `173` remains unchanged as historical manual-review evidence.

Validation:
- `node --test tests/stripe-edge.test.ts` passed all 33 tests.
- `node --test tests/*.test.ts` passed all 154 tests.
- `npm run worker:typecheck` passed.
- `npm run build` passed.

Next action:
- Commit, push, deploy, and run one fresh production Stripe-test/MGE-order smoke. Verify the final MGE order id and duplicate-webhook idempotency before marking Phase 5/5A done.
