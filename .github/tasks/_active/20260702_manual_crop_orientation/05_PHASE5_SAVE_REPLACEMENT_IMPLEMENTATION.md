Status: NOT STARTED
Required: yes
Created: 2026-07-02
Updated: 2026-07-02
Depends on: 04_PHASE4_VERIFIED_ACCOUNT_REPLACEMENT_CONTRACT.md
Supersedes: none

# Phase 5 - Save Replacement Implementation

## Objective

Polish verified-account save behavior and custom crop/orientation metadata after Phase 4 replacement works.

## Scope

- When Save is pressed after crop/orientation changes, detect if the same verified account already has that size saved.
- Attach/save the regenerated preview.
- Refresh account history so the updated variant appears and duplicate same-size badges do not.
- Preserve source thumbnails and crop/orientation metadata locally where useful.
- Handle failures without deleting local UI state prematurely.

## Validation

```powershell
node --test tests/account-preview-registry-source.test.ts tests/identity-edge.test.ts tests/identity-preview-library-source.test.ts
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

Manual check:
- Save `40 x 50`.
- Edit crop and regenerate `40 x 50`.
- Save again.
- Account history shows one `40 x 50` badge for that project, and opening it uses the updated preview.

## Done When

- Verified save replacement works without duplicate same-size variants.
- Failure states are visible and recoverable.
