Status: DONE
Created: 2026-06-29
Updated: 2026-06-29
Owner: Codex

# Phase 4 - Source Project Variants

## Objective

Use the released MGE identity/project preview contract to let a verified account attach the current ready preview without a second email and generate additional size variants from the saved original source project.

## Scope

- Keep `projects[]` from `GET /api/internal/v1/identity/previews/?brand_id=64` as the canonical account-history view.
- Do not deduplicate same-size badges in Dottingo UI; MGE canonicalizes current variants.
- Add server-side BFF support for `POST /api/internal/v1/identity/previews/`.
- Add server-side BFF support for `POST /api/internal/v1/identity/projects/{source_group_id}/previews/`.
- Add Account panel controls to request missing DOT sizes for a saved source project.
- Preserve local registry fallback for browsers without an MGE identity token.

## Validation

- `node --test tests/account-preview-registry-source.test.ts tests/identity-edge.test.ts tests/identity-preview-library-source.test.ts tests/account-panel-source.test.ts`
- `node --test tests/*.test.ts`
- `npm run worker:typecheck`
- `npm run build`

## Result

Implemented. Verified Account saves now attach to MGE identity when an MGE identity token exists, and saved source projects can request missing size variants through the new MGE endpoint.

Follow-up correction on 2026-06-29:
- Account history no longer shows missing sizes as `+` badges. It renders only saved/current size badges returned by MGE `projects[]`.
- The row action is now `Delete`, not `Hide`.
- Delete calls MGE identity-history delete endpoints: project delete when a `source_group_id` exists, otherwise per-preview delete.
