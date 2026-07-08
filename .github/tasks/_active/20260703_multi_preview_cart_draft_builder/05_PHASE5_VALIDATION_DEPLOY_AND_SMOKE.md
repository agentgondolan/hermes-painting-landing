Status: NOT STARTED
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

## Validation

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```
