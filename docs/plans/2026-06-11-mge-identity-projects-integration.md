# MGE Identity Projects Integration Plan

**Date:** 2026-06-11
**Repo state inspected:** `main` at `a06633b`; untracked artifacts/reference files exist and should not be swept into this change accidentally.

## Goal

Make Dottingo's saved-design experience source-photo/project-centered while keeping MGE previews as the supplier API's core unit.

Target user flow:

1. User uploads one source photo.
2. MGE generates one preview for the selected size.
3. The same source photo can have more generated preview sizes later.
4. User saves/verifies by email magic link.
5. Magic-link verification returns the latest MGE identity token.
6. The account panel loads MGE `projects[]` grouped by source photo.
7. User selects one preview variant.
8. Checkout/order draft uses exactly that selected preview.

## Non-negotiable invariants

- After magic-link verification, replace stored identity with the newest returned token payload. Never keep using an older localStorage/session token.
- Treat MGE `projects[]` as canonical for saved/account UI when present.
- Keep flat `previews[]` only as compatibility/local fallback.
- A generated `preview_url`, option image URL, or `mockup_url` is display-only. Never use generated imagery as input for another size.
- Size changes must use original `source_image.url` or source context only when MGE says refresh/source is available.
- Checkout remains preview-scoped: selected preview id + selected option/SKU + verified identity.
- If `purchase_options_available=false`, show/restorable preview is allowed, but checkout must be blocked with the API reason.

## Existing state

- Cloudflare Pages Functions own identity routes under `functions/api/identity/*`.
- `lib/identity/browser.ts` already overwrites `dottingo_verified_identity_v1` during `verifyMagicToken()`.
- The browser stores both the app checkout identity token and `mgeIdentityToken` returned by MGE.
- `lib/identity/edge.ts` currently normalizes identity previews to flat `previews[]` only.
- Account UI still reads device-local `dottingo_preview_registry_v1` as the primary saved list.
- Restored source hydration exists via `sourceImageUrl`, and `HYDRATE_SOURCE_IMAGE` caches real source bytes for size regeneration.

## Phase 1 — Preserve and expose the full MGE identity library response

**Objective:** The app proxy must return both `projects[]` and `previews[]` without dropping source/project fields.

Changes:

- Extend edge normalization to return `{ ok, previews, projects }`.
- Normalize project rows with project/source identifiers, source image, current preview, and preview variants.
- Preserve unknown raw fields only as safe non-secret data when useful for UI decisions.
- Keep URL proxying for HTTP(S) image URLs through `/api/mge/image?url=...`.

Tests:

- Identity preview proxy includes `projects[]`.
- `source_image.url` is proxied.
- `preview_url`/`mockup_url` remain display fields.
- Existing flat `previews[]` contract remains compatible.

## Phase 2 — Browser identity helper returns grouped saved projects

**Objective:** `fetchVerifiedIdentityPreviews()` should expose a library object, not only a flat list.

Changes:

- Add browser types for `IdentityPreviewProject` and `IdentityPreviewLibrary`.
- Make the helper return `{ previews, projects }`.
- Preserve token replacement behavior during magic-link verification.
- Add a compatibility wrapper only where old callers need flat rows.

Tests:

- Newest `mgeIdentityToken` from verification is stored.
- Fetch helper reads with `X-MGE-Identity-Token` from latest stored identity.
- Empty/no MGE token returns empty library safely.

## Phase 3 — Account panel becomes project/source-photo-centered

**Objective:** Saved UI shows photo projects first, then preview variants/sizes.

Changes:

- When verified identity exists, fetch MGE identity library.
- If `projects[]` exists, render projects as canonical saved designs.
- Show source thumbnail/name and preview variants under each project.
- Pick `is_current=true` preview as the preferred action target.
- Fallback to local flat registry only when no projects are available.
- Rename UI copy from `Verified previews` to `Saved photo projects` when project data exists.

Tests:

- Project list renders before local registry fallback.
- `Open preview` and `Continue checkout` use the selected/current preview and `selected_size`.
- Hidden local registry does not hide canonical MGE projects unless server supports that action.

## Phase 4 — Restore current preview and selected size from MGE fields

**Objective:** Magic-link return should restore the right current preview and size.

Changes:

- After verification, fetch identity library using the new MGE token.
- Select the `is_current=true` preview when present.
- Initialize URL/flow with API `selected_size` or `preferred_size` instead of defaulting to `40x50`.
- Hydrate source only from `source_image.url`, not generated preview URLs.

Tests:

- `is_current` chooses restored preview.
- `selected_size` wins over stale local state/default size.
- Generated preview/mockup URLs are never passed to source hydration/regeneration.

## Phase 5 — Size-change and checkout gating

**Objective:** Avoid fake regeneration and invalid checkout for restored saved previews.

Changes:

- Respect `fixed_size`, `size_change_mode`, `refresh_available`, and `refresh_unavailable_reason`.
- If source refresh is unavailable, disable other sizes with clear copy.
- If refresh is available, create new preview from original source context.
- Respect `purchase_options_available` and `purchase_options_unavailable_reason` before checkout.

Tests:

- Fixed-size preview does not offer other size regeneration.
- Refresh-unavailable preview does not show a spinner or call preview creation.
- Non-orderable preview disables checkout but can still be opened.

## Phase 6 — Verification and release readiness

Run, in order:

1. Focused source tests for identity/account/restored-size/purchase behavior.
2. Full `node --test tests/*.test.ts`.
3. TypeScript check if available.
4. Worker typecheck.
5. `npm run build`.
6. Browser smoke: account CTA, saved projects panel, open preview, continue checkout gating, no JS console errors.

Final report must split status by requested item:

- Identity token replacement.
- Saved projects UI.
- Preview restoration/current selection.
- Checkout gating.
- Tests/build.
- Browser/deployed URL smoke.

Do not claim real email delivery unless a real provider send is verified. A supplier testing-session token or seeded localStorage smoke is integration/UI proof only.
