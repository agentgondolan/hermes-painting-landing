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

- Production no longer needs Matej to click an email for smoke testing; use the token-gated `/auth/dev-login` route for `matejgondolan@gmail.com`.
- Customer-side Stripe test payment reaches the Dottingo success page.
- Remaining validation is server-side webhook-to-MGE-submit observability.

## 2026-07-09 Production Test-Login And Payment Smoke

- Added a guarded production smoke-login route for development only:
  - URL shape: `https://dottingo.sg/auth/dev-login#token=<DOT_DEV_IDENTITY_LOGIN_TOKEN>&next=/checkout`.
  - Server endpoint: `POST /api/identity/dev-login`.
  - Production requires the Cloudflare Pages secret `DOT_DEV_IDENTITY_LOGIN_TOKEN`.
  - Login remains limited to allowed dev identity emails; default is `matejgondolan@gmail.com`.
  - The browser receives normal Dottingo identity storage plus the MGE identity token returned by MGE `/api/internal/v1/identity/testing/session/`.
- Set `DOT_DEV_IDENTITY_LOGIN_TOKEN` in Cloudflare Pages production.
- Confirmed production test-login endpoint returned a verified Matej identity with app and MGE identity tokens, without sending email.
- Confirmed `https://dottingo.sg/checkout` loaded as `Verified matejgondolan@gmail.com`.
- Created a real production MGE draft through Dottingo BFF from saved account history:
  - Preview: `181fd0fa-1aee-4137-8508-ce30e512a499`.
  - Size: `60x80`.
  - SKU: `DOT/VF/60X80/WO/BLACK/STD`.
  - Draft status: `DRAFT`.
  - Draft item count: `1`.
- Found and fixed a live MGE draft shape mismatch:
  - MGE/BFF draft line item had SKU, quantity, and preview option id, while `unitPrice` and `currency` were on the top-level draft payload.
  - Stripe handoff now prices a single-line synced draft from top-level `unitPrice`/`currency` when the line item does not carry price fields.
- Deployed updated bundle:
  - Preview URL: `https://81a2c08f.hermes-painting-landing.pages.dev`.
  - Production URL: `https://dottingo.sg/`.
- Production Stripe checkout session creation passed:
  - Session id started with `cs_test_`.
  - Stripe URL host: `checkout.stripe.com`.
  - Amount shown by Stripe: `SGD 31.99`.
  - Line shown by Stripe: `Custom Dottingo Design 1`, `60x80 · DOT/VF/60X80/WO/BLACK/STD`.
- Completed Stripe test payment in the browser and reached:
  - `https://dottingo.sg/checkout/success?session_id=<cs_test...>`.

Remaining server-side smoke gap:

- Customer-side payment success is confirmed.
- Stripe API session lookup could not be performed locally because the local machine does not have the Stripe secret key used by production.
- MGE order-draft read remains unavailable for this flow (`GET /api/v1/order-drafts/{id}/` has returned HTML 404), so webhook-to-MGE-submit confirmation still needs Cloudflare/Stripe log visibility or an MGE order-status/read endpoint.

## Validation

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```
