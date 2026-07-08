Status: DONE
Required: yes
Created: 2026-06-25
Updated: 2026-06-26
Depends on: 02_PHASE2_IDENTITY_CONTRACT_CONFIRMATION.md
Supersedes: none

# Phase 3 - History Rendering And Tests

## Objective

Finish the returning-user account experience after verification.

## Scope

- Ensure verified identity loads MGE preview projects/history into the Account panel.
- Make empty, loading, and failed-history states read like account/history states.
- Preserve local fallback history from `lib/account/preview-registry.ts`.
- Keep saved-preview links opening `/?preview_id=...&size_id=...`.
- Add or update tests for login copy, history copy, and magic-link return behavior.

## Out of Scope

- Do not alter purchase-option polling or Stripe checkout behavior unless a regression is found.
- Do not deploy without an explicit deploy/smoke phase.

## Validation

```powershell
node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

## Expected Evidence

- Returning account flow can verify without a current preview and show saved history from MGE `projects[]`.
- First-user save flow still works for a ready current preview.
- Full local validation passes before implementation is marked done.

## Completion Notes

- Live MGE schema confirmed `preview_id` is optional for magic-link request and testing session.
- Live previewless testing session returned `preview_id: null` and an identity token.
- Live previewless identity preview fetch returned `current_preview_id: null`, `previews`, and `projects`.
- Dottingo now omits `preview_id` for returning-account magic-link requests and accepts `preview_id: null` from verification.
