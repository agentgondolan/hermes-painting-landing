Status: IN PROGRESS
Required: yes
Created: 2026-07-03
Updated: 2026-07-03
Depends on: 04_PHASE4_MULTI_LINE_CHECKOUT_HANDOFF.md
Supersedes: none

# Phase 5 - Validation Deploy And Smoke

## Objective

Verify the multi-preview cart/draft flow end to end on Cloudflare preview and production only after the code-level contract, page, draft sync, and checkout handoff pass local checks.

## Scope

- Run full local tests and build.
- Deploy to Cloudflare preview.
- Smoke cart selection with multiple verified account projects.
- Confirm MGE draft line items match selected variants, purchase options, and quantities.
- Confirm deleting/replacing a preview updates/removes the draft line.
- Deploy to `https://dottingo.sg/` after preview smoke passes.
- Run one final production smoke focused on cart/draft selection. Live payment smoke requires explicit approval.

## Acceptance

- Cloudflare preview URL is shared and verified.
- Production URL is shared and verified.
- Manual smoke confirms multi-project cart and MGE draft sync.
- Any live payment/MGE submit test is explicitly called out before running.

## 2026-07-09 Progress

- Full local test suite passed: `node --test tests/*.test.ts` returned 125/125 passing.
- Worker typecheck passed: `npm run worker:typecheck`.
- Production build passed: `npm run build`.
- Deployed with Wrangler to Cloudflare Pages:
  - Preview URL: `https://4d542def.hermes-painting-landing.pages.dev`
  - Production URL: `https://dottingo.sg/`
- HTTP route smoke passed:
  - `https://4d542def.hermes-painting-landing.pages.dev/checkout` returned 200.
  - `https://dottingo.sg/checkout` returned 200.
- Verified cart/draft smoke passed locally on the built Wrangler bundle at `http://127.0.0.1:3206/checkout`:
  - verified account loaded saved designs,
  - selecting one ready design created/synced an MGE draft,
  - W/WO purchase option switching updated the draft summary and total,
  - unselecting the design returned the cart to an empty state.

Remaining production smoke blocker:

- The in-app browser was not verified on `https://dottingo.sg/checkout`, so production could only be verified to the logged-out/account-required state. A verified production cart/draft smoke still needs Matej to complete magic-link login on `https://dottingo.sg/`, then reopen `https://dottingo.sg/checkout`.

Live payment/MGE submit:

- Matej explicitly approved moving to the live/sandbox payment smoke.
- Production checkout exposed an MGE draft-read gap: Stripe handoff could create/update a draft, but `GET /api/v1/order-drafts/{id}/` returned an HTML 404 from MGE. The Stripe handoff now still prefers the MGE draft read, but falls back to the already-synced BFF draft payload only for that specific 404 case.
- Added a temporary production Account-panel helper, `Send Matej test link`, which requests a real magic link for `matejgondolan@gmail.com` without bypassing email verification.
- Deployed the updated bundle:
  - Preview URL: `https://21ab999c.hermes-painting-landing.pages.dev`
  - Production URL: `https://dottingo.sg/`
- Requested a production magic link for `matejgondolan@gmail.com` with `continue_path: /checkout`.

Current checkpoint:

- Waiting for Matej to click the production magic link so `https://dottingo.sg/checkout` is verified again. After that, continue the Stripe test payment smoke from `https://dottingo.sg/checkout`.

## Validation

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```
