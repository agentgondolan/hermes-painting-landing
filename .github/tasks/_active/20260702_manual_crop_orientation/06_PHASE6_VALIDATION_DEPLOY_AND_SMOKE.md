Status: NOT STARTED
Required: yes
Created: 2026-07-02
Updated: 2026-07-02
Depends on: 05_PHASE5_SAVE_REPLACEMENT_IMPLEMENTATION.md
Supersedes: none

# Phase 6 - Validation Deploy And Smoke

## Objective

Deploy and validate the full manual crop/orientation flow.

## Scope

- Run full local verification.
- Deploy to Cloudflare Pages.
- Smoke preview URL first.
- Smoke `https://dottingo.sg/` after production is updated.
- Report exact URLs and exact behavior to test.

## Validation Commands

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```

## Smoke Checklist

- Upload new image.
- Generate DOT.
- Open crop modal.
- Move crop and apply.
- Confirm DOT preview updates.
- Toggle orientation and confirm 3D frame updates.
- Save verified preview.
- Open Account history and confirm replacement behavior.
- Reopen saved preview and confirm selected size/orientation still render correctly.

## Done When

- The final response includes the Cloudflare preview URL, `https://dottingo.sg/`, and the exact manual test path.
