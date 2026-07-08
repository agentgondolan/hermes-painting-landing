# Log - Manual Crop And Orientation

## 2026-07-02 - Task created

Author: Codex

Summary:
- Created a ledger for manual crop and orientation support.
- Scoped the work into frontend crop model, modal UX, preview regeneration, MGE/account replacement contract, save implementation, and deploy/smoke phases.
- Identified the key contract gap: Dottingo can already upload a client-cropped image to MGE with `auto_crop=false`, but verified-account replacement needs confirmed behavior for deleting/replacing an existing saved size variant.

Researched files:
- `AGENTS.md`
- `docs/ACTIVE_WORK.md`
- `.github/prompts/mg_plan.prompt.md`
- `lib/image-processing.ts`
- `lib/mgeveryday/bff-handler.ts`
- `lib/identity/browser.ts`
- `components/single-screen-preview/use-preview-flow.ts`
- `components/single-screen-preview/preview-state.ts`
- `components/single-screen-preview/guided-controls.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `components/account/account-panel.tsx`
- `components/product-scene-canvas.tsx`
- `tests/account-preview-registry-source.test.ts`
- `tests/preview-size-switch-source.test.ts`
- `tests/purchase-panel-source.test.ts`

Commands run:
- `npm run agent:status`
- `git status --short`
- `rg -n "prepareArtworkForFrame|crop|orientation|FrameSize|selectedSize" components lib tests -g "*.ts" -g "*.tsx"`
- `rg -n "createPreview|attachVerifiedIdentityPreview|deleteVerifiedIdentityPreview|deleteVerifiedIdentityProject|upsertAccountPreview|sourceImage|sourceGroup|preview_id|size_id" components lib functions tests -g "*.ts" -g "*.tsx"`

Next action:
- Review the open questions in `TASK.md`.
- If approved, start Phase 1 only.

## 2026-07-02 - Product decisions recorded

Author: Codex

Summary:
- Recorded product decisions from Matej's answers.
- Orientation is available for every size.
- Crop is per variant, not per source project.
- DOT regeneration happens only on Apply.
- Account history should mark custom crop/orientation variants.
- Save replacement should delete only the existing variant, not the whole source project.
- Remaining uncertainty is now limited to the exact MGE API path for delete-one-variant plus attach-new-cropped-preview while preserving history grouping.

Next action:
- Implement Phase 1 unless Matej wants the MGE replacement question sent first.

## 2026-07-02 - MGE replacement flow recorded

Author: Codex

Summary:
- Recorded MGE's intended account-history replacement flow.
- Confirmed old preview removal is `DELETE /api/internal/v1/identity/previews/{preview_id}/?brand_id=64` and only revokes identity-history association.
- Confirmed new variants should use `POST /api/internal/v1/identity/projects/{source_group_id}/previews/` so MGE generates from the stored original source image and keeps the preview under the same source project.
- Confirmed canonical `projects[].previews` should hide superseded same-size variants by default, so delete is mostly cleanup/testing or intentional removal.
- Narrowed the remaining API uncertainty to the exact crop/product params required for manual crop/orientation.

Next action:
- Confirm MGE crop/orientation request params, or implement Phase 1 frontend crop model while that API detail is pending.

## 2026-07-02 - Corrected manual crop architecture

Author: Codex

Summary:
- Corrected the plan after Matej pointed out that manual crop is already a browser-side input path.
- Removed the false blocker around MGE crop/orientation params.
- Reframed orientation as client-side ratio/frame state; Dottingo sends the correctly cropped/oriented image, not an orientation instruction.
- Reframed source-project preview generation as the normal saved-source variant path, not the required manual-crop path.
- Updated Phase 4 to implement verified-account save replacement using upload cropped preview -> attach/save -> refresh canonical history.

Next action:
- Implement Phase 1 frontend crop model.

## 2026-07-02 - Phase 1 implemented

Author: Codex

Summary:
- Added reusable manual crop input types and a normalized crop model in `lib/image-processing.ts`.
- Preserved centered crop generation as the default when no manual crop is supplied.
- Added explicit orientation and manual crop support to `prepareArtworkForFrame`.
- Extended `DotPreviewResult` and preview reducer events so each size variant can store crop and orientation metadata.
- Stored prepared artwork crop/orientation metadata when a DOT preview generation succeeds.
- Added `tests/manual-crop-source.test.ts` to guard the Phase 1 contract.

Files changed:
- `lib/image-processing.ts`
- `components/single-screen-preview/preview-state.ts`
- `components/single-screen-preview/use-preview-flow.ts`
- `tests/manual-crop-source.test.ts`
- `.github/tasks/_active/20260702_manual_crop_orientation/TASK.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/01_PHASE1_CROP_MODEL_AND_IMAGE_PROCESSING.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/LOG.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/DECISIONS.md`

Validation:
- `node --test tests/preview-size-switch-source.test.ts tests/manual-crop-source.test.ts` passed.
- `npm run build` passed after rerunning with a longer timeout. The first attempt timed out at 124 seconds before producing a result.

Blockers:
- None for Phase 1.

Next action:
- Implement Phase 2 only: Crop Modal UX.

## 2026-07-02 - Phase 2 implemented

Author: Codex

Summary:
- Added `CropModal` with source-image display, fixed-ratio crop overlay, drag positioning, zoom slider, orientation toggle, and Apply/Cancel actions.
- Added an `Edit crop` entrypoint near the existing Replace photo control when a selected source file exists.
- Wired Apply into preview flow as a local metadata update through `SET_PREVIEW_CROP`; it does not call MGE or regenerate the preview in this phase.
- Added `tests/crop-modal-source.test.ts` to guard the modal entrypoint, no-regeneration contract, and local metadata update path.

Files changed:
- `components/single-screen-preview/crop-modal.tsx`
- `components/single-screen-preview/guided-controls.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `components/single-screen-preview/use-preview-flow.ts`
- `tests/crop-modal-source.test.ts`
- `.github/tasks/_active/20260702_manual_crop_orientation/TASK.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/02_PHASE2_CROP_MODAL_UX.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/LOG.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/DECISIONS.md`

Validation:
- `node --test tests/account-panel-source.test.ts tests/purchase-panel-source.test.ts tests/crop-modal-source.test.ts` passed.
- `npm run build` passed.
- Local dev server started and `curl.exe -I --max-time 20 http://127.0.0.1:3206/` returned HTTP 200.
- Local HTML smoke showed the Dottingo upload screen at `http://127.0.0.1:3206/`.

Browser smoke:
- In-app browser automation could not attach to the local webview, so interactive upload/modal testing was not completed in this phase.
- This is a tooling limitation from the browser attach path; the local HTTP server is up.

Blockers:
- None for Phase 2 code.

Next action:
- Implement Phase 3 only: Regenerate Preview And 3D Orientation.

## 2026-07-02 - Phase 3 implemented

Author: Codex

Summary:
- Changed crop Apply from local metadata-only to active preview regeneration.
- Reused the existing browser-cropped upload path by passing manual crop and explicit orientation into `prepareArtworkForFrame`, then calling `createPreview(..., clientCropped=true)`.
- Kept the active size in processing state while MGE regenerates the cropped DOT preview.
- Preserved crop/orientation metadata on processing, success, failure, and size-switch paths.
- Passed explicit preview orientation into `ProductSceneCanvas` so the 3D frame can switch between portrait and landscape independently of catalog size dimensions.
- Added tests for the `clientCropped` BFF flag, regeneration path, and explicit scene orientation.

Files changed:
- `components/single-screen-preview/preview-state.ts`
- `components/single-screen-preview/use-preview-flow.ts`
- `components/single-screen-preview/preview-scene-panel.tsx`
- `components/product-scene-canvas.tsx`
- `tests/preview-size-switch-source.test.ts`
- `tests/browser-preview.test.ts`
- `tests/crop-modal-source.test.ts`
- `.github/tasks/_active/20260702_manual_crop_orientation/TASK.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/03_PHASE3_REGENERATE_PREVIEW_AND_3D_ORIENTATION.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/LOG.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/DECISIONS.md`

Validation:
- `node --test tests/preview-size-switch-source.test.ts tests/browser-preview.test.ts tests/crop-modal-source.test.ts` passed.
- `npm run build` passed.

Blockers:
- None for Phase 3 code.

Next action:
- Implement Phase 4 only: Verified Account Save Replacement.
