Status: DONE
Required: yes
Created: 2026-07-02
Updated: 2026-07-02
Depends on: 02_PHASE2_CROP_MODAL_UX.md
Supersedes: none

# Phase 3 - Regenerate Preview And 3D Orientation

## Objective

Make crop/orientation changes regenerate the active DOT preview and update the 3D frame shape.

## Scope

- On crop modal Apply, render the selected manual crop into a new `File`.
- Send that cropped file through the existing `createPreview(..., clientCropped=true)` path.
- Mark the active size as processing while MGE generates the new preview.
- Replace the active `DotPreviewResult` with the regenerated preview.
- Make `ProductSceneCanvas` consume explicit orientation from preview state instead of inferring it only from size dimensions.
- Ensure size switching preserves crop/orientation per size.

## Validation

```powershell
node --test tests/preview-size-switch-source.test.ts tests/browser-preview.test.ts
npm run build
```

Visual checks:
- Apply crop updates DOT image.
- Orientation toggle changes the 3D frame from portrait to landscape or landscape to portrait.
- Existing size buttons still work.

## Done When

- The current unsaved preview can be manually cropped and regenerated.
- 3D canvas frame dimensions update from explicit orientation.
