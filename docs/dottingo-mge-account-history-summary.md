# Dottingo MGE Account History Summary

## Core Flow

- Browser code must call Dottingo BFF routes, not MGE directly.
- MGE tokens stay server-side in Cloudflare Pages Functions.
- A verified identity stores saved designs as MGE identity projects grouped by `source_group_id`.
- `projects[]` is the primary account-history view. `previews[]` is compatibility/audit data.

## Source And Variants

- The source image is the original customer upload stored by MGE.
- Generated DOT preview images must not be reused as input for another size.
- Size variants are generated from the saved source project:
  - `POST /api/internal/v1/identity/projects/{source_group_id}/previews/`
  - body includes `brand_id`, `product`, and `preferred_size`.
- A project can have multiple saved variants, for example one `40x50` and one `40x60`.
- For the default account-history UI, same-size duplicates should collapse to the current canonical variant.
- A manual-crop replacement of an existing size must remain a variant of the same `source_group_id`. It must not create a separate saved-design project.
- If a user opens a saved source project, creates an unsaved size such as `60x80`, edits its crop/orientation, and saves it, the saved `60x80` badge should appear on the original source project row.
- If the same project already has a `60x80` variant, saving a recropped `60x80` should replace/supersede that size variant for the same `source_group_id`, not add a second visible `60x80` row.

## Browser State Rules

- Opening a saved preview by `preview_id` may restore the DOT preview without its source image metadata.
- The source image can still be recovered from the verified identity project library by matching the preview to its project.
- When a new size is being generated from an account project, the 3D canvas should show the source image while MGE builds the DOT preview.
- After requesting a new size, poll fresh identity history and restore the variant only after the matching project row has a usable preview image.
- Identity history fetches must bypass cache because manual refresh can otherwise see a newer project state than the active polling loop.
- Browser-side cropped uploads are not allowed for verified account project replacement, because a cropped upload is a new source image from MGE's point of view.
- Verified manual crop must call the source-project generation endpoint with crop/orientation parameters so MGE crops the stored source image and generates a DOT preview under the original `source_group_id`.

## UX Expectations

- Saved size badges show only sizes already available for the project.
- Unsaved size buttons can start generation from the project source.
- A stale `processing` size should be retriable; it should not block future clicks forever.
- Deleting a saved project removes the identity-history association, not the underlying MGE preview sessions or media.
- A saved recrop should not create a new account-history card when the user's intent is to update a size variant of the currently selected source project.
- Account project cards must fit at least three saved size badges, such as `40x50`, `40x60`, and `60x80`, as a compact vertical stack next to the source thumbnail.

## Verified Manual Crop Contract

The browser can crop and upload a new DOT preview with `clientCropped=true`, but that flow creates a new MGE source project and must not be used for verified saved-source variants.

For verified account projects, Dottingo should:

- Keep the original `source_group_id`.
- Send the selected size, orientation, and crop rectangle to `POST /api/internal/v1/identity/projects/{source_group_id}/previews/`.
- Set `auto_crop=false` for manual crop.
- Send orientation through `preferred_orientation`.
- Send crop coordinates in `product_params` and `preview_options`.
- Poll identity history and preview status until the generated preview image is available.

If this call fails, Dottingo should show/retry the project variant generation. It should not silently fall back to cropped upload, because that creates a separate saved-design card.
