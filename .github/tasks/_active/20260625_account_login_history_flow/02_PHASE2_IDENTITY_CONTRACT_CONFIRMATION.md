Status: DONE
Required: yes
Created: 2026-06-25
Updated: 2026-06-25
Depends on: 01_PHASE1_ACCOUNT_LOGIN_ENTRYPOINT.md
Supersedes: none

# Phase 2 - Identity Contract Confirmation

## Objective

Decide and implement the safe magic-link request contract for login/history when there is no current preview.

## Scope

- Inspect existing tests and BFF expectations around `/api/identity/request-magic-link`.
- Confirm whether MGE supports a previewless account/history magic-link request, or whether a verified preview anchor is mandatory.
- If previewless login is supported, add a browser helper and BFF tests for account-login magic links without weakening checkout identity validation.
- If previewless login is not supported, keep the BFF strict and make the UI fallback explicit.

## Out of Scope

- Do not invent new MGE endpoints.
- Do not send live emails unless Matej explicitly approves the smoke.

## Validation

```powershell
node --test tests/identity-edge.test.ts tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts
npm run worker:typecheck
```

## Expected Evidence

- Tests document whether account login can omit `preview_id`.
- Checkout code still submits identity token with the selected preview.
- Any unsupported no-preview path fails with clear user-facing copy instead of a silent broken login.

## Result

- Current Dottingo BFF and MGE request path remain preview-scoped for magic-link requests.
- `requestMagicLink` rejects account login without `preview_id` before calling MGE.
- The Account panel Phase 1 fallback remains the correct no-current-preview behavior until MGE provides or confirms a previewless account-link endpoint.
- Verified identity history still loads through `/api/internal/v1/identity/previews/` after an MGE identity token exists.

## Validation Result

```powershell
node --test tests/identity-edge.test.ts tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts
npm run worker:typecheck
```

Both commands passed on 2026-06-25.
