Status: NOT STARTED
Required: yes
Created: 2026-07-02
Updated: 2026-07-02
Depends on: 03_PHASE3_REGENERATE_PREVIEW_AND_3D_ORIENTATION.md
Supersedes: none

# Phase 4 - Verified Account Save Replacement

## Objective

Implement verified-account save replacement for a manually cropped/oriented preview.

## Scope

- Use the existing browser-cropped preview upload path for the manually cropped/oriented image.
- Attach/save the newly generated preview to the verified identity.
- Refresh canonical identity history after save.
- Rely on canonical `projects[].previews` to hide superseded same-size variants by default.
- Delete old `preview_id` only for intentional cleanup/removal, not as a required UI-correctness step.

## Confirmed MGE Flow

1. Optional cleanup/removal:
   `DELETE /api/internal/v1/identity/previews/{preview_id}/?brand_id=64`
2. Normal non-manual-crop generation from stored source project:
   `POST /api/internal/v1/identity/projects/{source_group_id}/previews/`
3. Refresh canonical history:
   `GET /api/internal/v1/identity/previews/?brand_id=64`

MGE notes:
- Delete revokes only identity-history association.
- Source-project variant generation uses the stored original source image, not `preview_url` or `mockup_url`.
- The new preview should appear under the same `source_group_id`.
- `projects[].previews` returns canonical variants by default, so superseded duplicate old variants should not appear unless `include_superseded=true`.
- Deleting the old preview is usually not required for UI correctness.

## Manual Crop Path

For manual crop, Dottingo should not wait for source-project crop params. It should:

1. Render the chosen crop/orientation in the browser from the original source image.
2. Upload the cropped/oriented file through `/api/mge/preview` with `clientCropped=true`, which makes the BFF send `auto_crop=false`.
3. Attach/save that generated preview to the verified identity.
4. Refresh account history.

## Validation

- Add/update tests for the upload/attach/refresh save flow.
- Confirm Account history does not show duplicate same-size badges from `projects[].previews`.

## Done When

- A manually cropped/oriented preview can be saved to a verified account and refreshed from canonical history.
