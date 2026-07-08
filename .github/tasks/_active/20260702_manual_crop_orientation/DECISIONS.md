# Decisions - Manual Crop And Orientation

## 2026-07-02 - Client crop remains the preview input

Decision:
- Manual crop should happen before Dottingo sends the image to MGE.

Rationale:
- The current preview flow already creates a cropped `File` in the browser and sends it to `/api/mge/preview` with `clientCropped=true`.
- The BFF translates that into MGE `auto_crop=false`, so MGE should not apply another automatic crop.

Implications:
- Crop metadata must live in `DotPreviewResult`/preview state per size variant.
- Regeneration should call the existing preview upload path with a newly rendered cropped file.
- Generated preview/mockup URLs remain display-only.

## 2026-07-02 - Manual crop uses browser-rendered preview upload

Decision:
- Manual crop replacement should use the existing browser-cropped upload path, not wait for extra MGE crop/orientation params.

Rationale:
- The current preview flow already renders the cropped image in the browser and calls `/api/mge/preview` with `clientCropped=true`.
- The BFF sends `auto_crop=false`, so MGE receives the exact crop/ratio Dottingo created.
- Orientation is just the chosen output ratio and 3D frame orientation; it does not require an MGE orientation field for manual crop.

Implications:
- Phase 4 is no longer a blocker or external contract phase.
- The implementation should upload the browser-rendered cropped/oriented source image as a new preview, then attach/save that preview to the verified identity.
- Dottingo should not use generated preview images as input.

## 2026-07-02 - Crop and orientation are per variant

Decision:
- Manual crop state is per size variant, not per source image/project.
- Orientation is allowed for every size, so a size can be rendered in portrait or landscape.
- Applying crop/orientation regenerates DOT only when the user presses Apply.
- Account history should show a marker when a variant has custom crop and/or custom orientation.

Rationale:
- The source image is stable, while each generated DOT variant can have its own crop and orientation.
- Replacing one variant should not disturb other saved sizes from the same source project.

Implications:
- Crop/orientation metadata belongs on each `DotPreviewResult`/saved preview variant.
- Save replacement should delete only the existing same-size variant and attach/save the regenerated variant.
- The 3D scene must consume explicit per-variant orientation instead of deriving orientation only from catalog dimensions.

## 2026-07-02 - MGE source-project variant flow is for normal saved-source variants

Decision:
- For normal saved-account variant generation without manual crop, use `POST /api/internal/v1/identity/projects/{source_group_id}/previews/` so MGE generates from the stored original source image and keeps account history grouped under the same source project.
- Use `GET /api/internal/v1/identity/previews/?brand_id=64` after generation to refresh canonical `projects[].previews`.
- Use `DELETE /api/internal/v1/identity/previews/{preview_id}/?brand_id=64` only when intentionally removing a preview association or for cleanup/testing; canonical history should hide superseded same-size variants without requiring delete.

Rationale:
- MGE confirmed the source-project endpoint creates the new PreviewSession through the normal preview pipeline and automatically attaches it to the verified identity.
- MGE confirmed the delete endpoint revokes only identity-history association and does not delete PreviewSession/source/media/products/options.

Implications:
- The UI should rely on canonical `projects[].previews` for saved-history display, not flat `previews[]`.
- If Dottingo wants intentional removal, delete by `preview_id` is enough for one variant; do not delete the whole `source_group_id` project for variant replacement.

## 2026-07-02 - Crop metadata stores source-pixel and normalized coordinates

Decision:
- Store manual crop details as source-image pixel coordinates plus normalized coordinates on each generated preview variant.
- Keep centered crop as the default crop source when no manual crop is supplied.

Rationale:
- Pixel coordinates are what canvas rendering needs to create the exact cropped file for MGE upload.
- Normalized coordinates make the future crop modal resilient to image preview scaling and responsive layout changes.

Implications:
- Phase 2 can render and edit crop boxes in UI space while converting back to source pixels.
- Phase 3 can regenerate previews through the existing browser-cropped upload path without adding MGE-specific crop params.

## 2026-07-02 - Crop modal apply is local-only until regeneration phase

Decision:
- The Phase 2 crop modal applies crop/orientation metadata to preview state only.
- It intentionally does not call MGE, create a new preview, refresh purchase options, or save account history.

Rationale:
- The task phases separate UI editing from preview regeneration and account replacement.
- This keeps Apply reversible and low-risk until Phase 3 wires it to the browser-cropped MGE upload path.

Implications:
- After Phase 2, customers can open the crop editor and adjust crop/orientation locally, but the visible DOT output will not change yet.
- Phase 3 must consume the stored crop metadata, regenerate the preview from the source image, and drive explicit 3D orientation.

## 2026-07-02 - Crop apply regenerates through the normal client-cropped preview path

Decision:
- Phase 3 crop Apply regenerates the active preview by rendering the cropped/oriented source image in the browser and sending it through the existing preview upload client with `clientCropped=true`.
- The 3D scene uses explicit preview orientation when present, falling back to catalog dimensions only when no preview orientation exists.

Rationale:
- This keeps MGE as the preview source of truth while ensuring MGE receives the exact cropped pixels and does not auto-crop again.
- It also keeps orientation as a Dottingo ratio/frame decision, not a new MGE API field.

Implications:
- Manual crop changes now produce a new MGE preview id and fresh purchase options for the active size.
- Verified-account replacement still remains Phase 4/5 work; Phase 3 does not delete or replace saved account history.
