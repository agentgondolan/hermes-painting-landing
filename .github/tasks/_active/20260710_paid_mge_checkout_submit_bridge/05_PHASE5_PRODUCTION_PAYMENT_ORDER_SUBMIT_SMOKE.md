Status: NOT STARTED
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

