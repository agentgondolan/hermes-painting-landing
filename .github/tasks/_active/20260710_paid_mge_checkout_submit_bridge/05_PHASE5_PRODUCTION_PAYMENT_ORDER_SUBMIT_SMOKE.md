Status: BLOCKED
Required: yes
Created: 2026-07-10
Updated: 2026-07-10
Depends on: 04_PHASE4_CUSTOMER_CONFIRMATION_AND_STATUS_POLLING.md
Supersedes: none

# Phase 5 - Production Payment Order Submit Smoke

## Objective

Run one explicit production smoke that proves the full flow:

`saved preview -> cart selection -> MGE draft validate READY -> Stripe test payment -> webhook -> MGE submit -> final order id on success page`

## Preconditions

- User explicitly approves the live smoke.
- Stripe remains in test/sandbox mode.
- MGE draft submit risk is understood: this can create a real MGE order record even if payment is test-mode.
- Tokenized dev-login route is available but not visible in production UI.
- `https://dottingo.sg/checkout` is deployed from the expected commit.

## Smoke Steps

1. Open hidden dev-login URL for `matejgondolan@gmail.com`.
2. Go to `https://dottingo.sg/checkout`.
3. Select one saved ready design.
4. Choose W or WO option.
5. Confirm MGE draft id is numeric and validation succeeds.
6. Continue to Stripe test payment.
7. Complete test payment.
8. Return to `https://dottingo.sg/checkout/success?session_id=...`.
9. Confirm status reaches submitted and shows an MGE order id.
10. Confirm duplicate webhook/session retry does not create a second MGE order.

## Acceptance Criteria

- Production deployment URL is recorded.
- `https://dottingo.sg/checkout` works for the verified test account.
- Stripe test payment returns to success page.
- Success page shows submitted or retrying with durable state.
- MGE final order id is recorded when submit succeeds.
- Any failure includes exact endpoint/status evidence without exposing secrets.

## Validation Commands

```powershell
npm run worker:typecheck
npm run build
npx wrangler pages deployment list --project-name hermes-painting-landing
```

## Current Status

- Cloudflare OAuth was refreshed and the `hermes-painting-landing` Pages project was confirmed.
- D1 database `dottingo-payment-submit-outbox` was created in APAC and initialized from `docs/payment-submit-outbox-d1.sql`.
- `wrangler.toml` now binds the database as `PAYMENT_SUBMIT_OUTBOX` and declares `.next/prod` as the Pages output directory.
- All 151 tests, Worker typecheck, and production build pass.
- Production deployment is active from commit `fed3118`; the latest secret-bound deployment is `https://17baddc6.hermes-painting-landing.pages.dev`.
- Live MGE draft `173` was created from one 60x80 W/STD purchase option, patched with clearly marked test shipping data, and validated successfully.
- Live contract evidence confirmed that draft detail lines omit price while draft validation lines return canonical `unit_price` and `currency`; Stripe checkout now merges those validation prices with stored draft quantities.
- Stripe test payment completed for the numeric draft and returned to the Dottingo success page.
- Stripe destination `Dottingo checkout webhook` is active for `checkout.session.completed`; its rotated signing secret is configured in Cloudflare production.
- A signed replay for the paid session reached the production webhook and produced exactly one MGE submit attempt.
- Replaying the same signed paid-session event again returned manual review without another MGE call; D1 remained at attempt count `1` with no order id.
- MGE rejected submit with `400` because the validated draft's `preview_option_id` expired before submit. Dottingo correctly stored `mge_failed_manual_review`, attempt count `1`, and no MGE order id.
- Direct MGE validation now returns the same expiry error; draft `173` is `DRAFT` with no submitted order.
- Phase 5 is blocked by [Phase 5A - MGE Ready-Draft Preview Validity Contract](05A_BLOCKED_MGE_READY_DRAFT_PREVIEW_VALIDITY_CONTRACT.md).

## Blocker

MGE must preserve preview-option validity for the READY/Stripe checkout window or provide a safe paid-draft refresh/rebind contract. Dottingo will not silently substitute a new preview option after payment.
