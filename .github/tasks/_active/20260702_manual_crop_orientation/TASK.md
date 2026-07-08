# Manual Crop And Orientation

Status: IN PROGRESS
Created: 2026-07-02
Updated: 2026-07-02
Proposed branch: `codex/manual-crop-orientation`

## Overview

Add manual crop editing for DOT previews. The customer should be able to open a crop modal for the selected size, adjust the crop, optionally switch orientation, regenerate the DOT preview from the browser-cropped image, and save the updated cropped result into the verified account history.

This is more than a UI modal. The crop state must become part of the preview-generation contract, the selected orientation must drive the 3D frame ratio, and verified-account save must replace the existing saved variant for the same size instead of leaving duplicate saved previews.

## Goals

- Add a crop modal that shows the selected ratio for the active size, such as `40 x 50 cm`, `40 x 60 cm`, or `60 x 80 cm`.
- Allow customer-controlled crop position and zoom for each size variant.
- Allow orientation changes for the active size, and make the 3D frame update immediately to the changed orientation.
- Regenerate the DOT preview after crop/orientation changes using the cropped source pixels, not a generated preview image.
- Save the updated crop as the source input for the active variant.
- If a saved preview already exists for the same verified account and size, delete or supersede that existing saved variant before saving the regenerated variant.
- Preserve the current checkout/purchase-options behavior: checkout must still use the selected generated preview option returned by MGE.

## Non-Goals

- Do not build a general photo editor.
- Do not use generated DOT/design images as inputs for another generation.
- Do not expose MGE tokens or identity tokens to the browser beyond the existing safe BFF/session shape.
- Do not change Stripe/order-draft semantics in this task.
- Do not deploy or live-test payment in this task.

## Constraints

- MGE remains the source of truth for generated previews, purchase options, and saved account history.
- The current BFF already sends `auto_crop=false` when the browser has cropped the file before upload in `lib/mgeveryday/bff-handler.ts:137`.
- The current browser flow generates previews by calling `prepareArtworkForFrame(file, { preferredSizeId })` and then `createPreview(preparedArtwork.file, preferredSizeId.toUpperCase(), true)` in `components/single-screen-preview/use-preview-flow.ts:144` and `components/single-screen-preview/use-preview-flow.ts:164`.
- Account history currently deletes saved source projects via `deleteVerifiedIdentityProject` when a `sourceGroupId` exists, or preview rows via `deleteVerifiedIdentityPreview` otherwise in `components/account/account-panel.tsx:449`.
- Existing API shape can create a preview from a project source with `createVerifiedIdentityProjectPreview`, but that uses MGE's stored source image and does not accept a new crop payload or replacement file from the browser in `lib/identity/browser.ts:223`.
- MGE confirmed that `POST /api/internal/v1/identity/projects/{source_group_id}/previews/` creates a normal new size variant from the stored original source image and attaches it to the verified identity under the same source project.
- Manual crop does not need MGE-side orientation handling: Dottingo should render the chosen crop/orientation in the browser, upload the resulting cropped image through the existing preview upload path, and send `clientCropped=true` so the BFF passes `auto_crop=false`.
- MGE confirmed `DELETE /api/internal/v1/identity/previews/{preview_id}/?brand_id=64` removes only the identity-history association, not the PreviewSession/source/media/options.
- MGE canonical project history should hide superseded same-size variants in `projects[].previews`; deletion is mainly for cleanup/testing or intentional removal.
- The current 3D scene derives orientation from `selectedSize.widthCm >= selectedSize.heightCm`, so orientation cannot yet differ from the catalog size dimensions in `components/product-scene-canvas.tsx:925`.
- Generated test images or crop debug artifacts must stay out of Git. If needed, put disposable visual files under ignored `artifacts/` or another ignored tmp location, not source static folders.

## Current State

- `lib/image-processing.ts:33` defines `CropDetails` as centered crop coordinates only.
- `lib/image-processing.ts:99` exposes `getFrameRatio(sizeId, orientation)`.
- `lib/image-processing.ts:124` chooses a closest frame size from source ratio and orientation.
- `lib/image-processing.ts:134` implements `getCenteredCrop`; there is no manual crop state yet.
- `lib/image-processing.ts:343` derives orientation from the selected frame size when `preferredSizeId` is supplied.
- `lib/image-processing.ts:377` draws the centered crop into the output canvas.
- `components/single-screen-preview/preview-state.ts:44` stores `sourceImageUrl` and `sourceGroupId` on each `DotPreviewResult`, but no crop or orientation metadata.
- `components/single-screen-preview/preview-state.ts:70` supports `SET_SIZE`, but no crop/orientation events.
- `components/single-screen-preview/guided-controls.tsx:123` renders size buttons only; there is no crop edit button or modal entrypoint.
- `components/single-screen-preview/preview-scene-panel.tsx:18` passes selected size to the 3D scene.
- `components/product-scene-canvas.tsx:925` infers orientation from size dimensions rather than explicit preview state.
- `lib/mgeveryday/bff-handler.ts:137` sends `auto_crop=false` when the client already cropped the upload.
- `components/account/account-panel.tsx:406` attaches the current preview to the verified identity before local registry save.
- `components/single-screen-preview/single-screen-preview-shell.tsx:89` enriches local registry save with a local source thumbnail fallback, but that thumbnail is display-only and not an MGE source replacement.

## Open Product And API Questions

Answered product decisions:

1. Orientation should be available for every size. Example: `40 x 60 cm` can become horizontal `60 x 40 cm`.
2. Crop is per size variant, not per source image/project.
3. Crop changes should regenerate DOT only after the user presses Apply.
4. Each size variant keeps its own independent crop.
5. Account history should show a marker for custom crop/orientation variants.
6. Replacement should affect only the existing size variant, not the whole source project.
7. The original source image should remain the source image; crop should be applied from that source to create/replace the selected generated variant.

Answered MGE replacement flow:

1. Dottingo can remove an old account-history preview association with `DELETE /api/internal/v1/identity/previews/{preview_id}/?brand_id=64`.
2. For normal saved-source size generation, Dottingo should use `POST /api/internal/v1/identity/projects/{source_group_id}/previews/`.
3. For manual crop, Dottingo should create a fresh preview from the browser-rendered cropped/oriented source image via the existing `/api/mge/preview` upload path, then attach it to the verified identity.
4. The resulting preview/history should be refreshed with `GET /api/internal/v1/identity/previews/?brand_id=64`.
5. Canonical `projects[].previews` should hide superseded same-size variants by default.
6. Deleting the old preview is usually not required for UI correctness; use it for cleanup/testing or intentional removal.

Remaining API note:

1. No separate MGE orientation param is required for manual crop. Dottingo sends the correctly cropped/oriented image ratio as the preview input.

## Phase Index

1. [DONE - Phase 1 - Crop Model And Image Processing](01_PHASE1_CROP_MODEL_AND_IMAGE_PROCESSING.md)
2. [DONE - Phase 2 - Crop Modal UX](02_PHASE2_CROP_MODAL_UX.md)
3. [DONE - Phase 3 - Regenerate Preview And 3D Orientation](03_PHASE3_REGENERATE_PREVIEW_AND_3D_ORIENTATION.md)
4. [NOT STARTED - Phase 4 - Verified Account Save Replacement](04_PHASE4_VERIFIED_ACCOUNT_REPLACEMENT_CONTRACT.md)
5. [NOT STARTED - Phase 5 - Save Replacement Implementation](05_PHASE5_SAVE_REPLACEMENT_IMPLEMENTATION.md)
6. [NOT STARTED - Phase 6 - Validation Deploy And Smoke](06_PHASE6_VALIDATION_DEPLOY_AND_SMOKE.md)

## Dependencies

- The frontend can implement local crop/orientation and preview regeneration first using the existing `/api/mge/preview` upload path.
- Replacing account history should target upload cropped/oriented preview, attach the new preview to the verified identity, then rely on canonical `projects[].previews`; delete-one-preview is optional cleanup unless the user intentionally removes the old variant.

## Rollout Plan

1. Ship manual crop for unsaved/current previews first.
2. Implement verified-account attach/save for the regenerated cropped preview.
3. Add replacement save behavior behind the existing verified Save action.
4. Deploy to a Cloudflare Pages preview URL and smoke locally on that preview.
5. Deploy to `https://dottingo.sg/` only after the preview URL passes upload, crop, orientation, save, account history, and size-switch checks.

## Validation Strategy

Focused checks:

```powershell
node --test tests/preview-size-switch-source.test.ts tests/account-preview-registry-source.test.ts tests/purchase-panel-source.test.ts
```

Broader checks:

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

Visual checks:

- Crop modal opens from the active preview flow.
- Crop box matches selected size ratio.
- Orientation toggle changes crop ratio and 3D frame shape.
- Applying crop regenerates the DOT preview.
- Saving a verified regenerated preview does not leave duplicate same-size badges.

## Deploy And Smoke Strategy

No deploy is part of planning. Implementation phases that alter preview/account behavior should end with:

```powershell
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```

Smoke URLs to report:

- Cloudflare preview URL returned by Wrangler.
- Production URL: `https://dottingo.sg/`.

Manual smoke on `https://dottingo.sg/` after release:

1. Upload a portrait image.
2. Generate `40 x 50 cm`.
3. Open crop modal and move crop.
4. Apply crop and confirm DOT preview updates.
5. Toggle orientation and confirm the 3D frame changes.
6. Save while verified.
7. Reopen Account history and confirm the old same-size variant is gone and the updated variant is present.

## Next Action

Implement Phase 4 only: Verified Account Save Replacement.
