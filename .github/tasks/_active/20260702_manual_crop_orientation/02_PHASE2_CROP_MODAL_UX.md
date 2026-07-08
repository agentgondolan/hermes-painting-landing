Status: DONE
Required: yes
Created: 2026-07-02
Updated: 2026-07-02
Depends on: 01_PHASE1_CROP_MODEL_AND_IMAGE_PROCESSING.md
Supersedes: none

# Phase 2 - Crop Modal UX

## Objective

Add the manual crop modal and controls.

## Scope

- Add an "Edit crop" control near the current preview controls once a source image exists.
- Build a modal that shows the source image inside a fixed-ratio crop frame for the selected size.
- Show the active ratio/size label, for example `40 x 50 cm`.
- Support crop drag and zoom.
- Add an orientation toggle.
- Keep modal controls compact and usable on mobile.
- Do not regenerate MGE preview until Apply is pressed.

## Validation

```powershell
node --test tests/account-panel-source.test.ts tests/purchase-panel-source.test.ts
npm run build
```

## Done When

- Modal opens and closes without changing preview state.
- Crop box ratio follows selected size and orientation.
- Applying crop updates local crop state but does not yet have to save to account history.
