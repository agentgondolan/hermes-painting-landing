Status: DONE
Required: yes
Created: 2026-07-02
Updated: 2026-07-02
Depends on: none
Supersedes: none

# Phase 1 - Crop Model And Image Processing

## Objective

Add a reusable crop model and image-processing support for manual crop and explicit orientation, without changing UI yet.

## Scope

- Extend `lib/image-processing.ts` with manual crop input support.
- Add a normalized crop model that can represent:
  - size id
  - orientation
  - crop x/y in source pixels or normalized percentages
  - crop width/height
  - zoom/scale if the UI uses zoom
- Preserve current centered-crop behavior as the default.
- Extend `DotPreviewResult` in `components/single-screen-preview/preview-state.ts` with crop/orientation metadata.
- Add reducer events needed later for crop/orientation updates.

## Validation

```powershell
node --test tests/preview-size-switch-source.test.ts
npm run build
```

## Done When

- Existing auto-centered preview generation still works.
- Crop metadata can be stored per size variant.
- Manual crop rendering can output a cropped `File` for MGE upload.
