Status: DONE
Required: yes
Created: 2026-06-25
Updated: 2026-06-25
Depends on: none
Supersedes: none

# Phase 1 - Account Login Entrypoint

## Objective

Refactor the Account panel state and copy so it clearly supports two intents:

- Save the current ready preview.
- Log into existing saved history.

## Scope

- Split the current `saveFormOpen` / `showEmailForm` logic into intent-aware state.
- Allow opening the email form from Account even when there is no ready current preview.
- Keep the existing "Save and get back later" first-user action when a ready preview exists.
- Add source-test coverage that no-current-preview Account exposes login/history copy and is not hidden behind "Create a design first" only.

## Out of Scope

- Do not change BFF request semantics yet.
- Do not run live magic-link email delivery.

## Validation

```powershell
node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts
```

## Expected Evidence

- Account panel source contains a distinct login/history intent.
- Existing save-current-preview strings and behavior remain present.
- Tests prove the Account panel no longer only frames email entry as saving a current design.

## Result

- `components/account/account-panel.tsx` now uses `EmailFlowIntent = "save" | "login"` instead of a single save-form boolean.
- Users without a ready current preview see "Log in to saved designs" and can open the email form with login/history copy.
- The first-user "Save and get back later" and verified "Save current preview" paths remain present.
- Previewless magic-link sending remains blocked with clear status copy until Phase 2 confirms the MGE account-link contract.

## Validation Result

```powershell
node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts
npm run build
```

Both commands passed on 2026-06-25.
