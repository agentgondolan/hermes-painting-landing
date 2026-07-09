Status: IN PROGRESS
Created: 2026-07-03
Updated: 2026-07-06
Owner: Codex
Proposed branch: codex/multi-preview-cart-draft-builder

# Multi-Preview Cart Draft Builder

## Overview

Dottingo now has verified account projects with multiple ready MGE preview variants. The current checkout surface is still centered on one active 3D preview and one selected purchase option. That is too narrow for the intended ordering flow.

Target behavior:

`verified account projects -> 2D checkout/cart page -> select ready designs -> choose purchase option/framing + quantity -> sync one MGE order draft -> delivery/payment -> Stripe webhook submits MGE draft once`

The cart page should use MGE previews that are already ready/orderable. The customer can add more source photos, generate variants, then choose some of the ready designs from across all saved source projects for one order. MGE order draft state should become the source of truth for selected cart line items whenever possible.

## Goals

- Add a new checkout/cart page for selecting multiple ready MGE preview variants from all verified account projects.
- Show project source images and each ready 2D DOT design image, not the 3D scene.
- Fetch MGE purchase options for each ready preview and show only orderable choices.
- Let the customer toggle designs into the cart, choose framing/purchase option, and set quantity per selected preview variant.
- Create or update one MGE order draft with multiple `line_items[]`, one per selected design variant.
- Treat MGE order draft as the cart source of truth after it exists.
- If a preview is changed or deleted in account history, update or remove its draft line item before checkout/payment.
- Keep each order line preview-scoped: selected `preview_id`, selected `preview_option_id`, selected purchase option/SKU, quantity.
- Preserve the existing payment rule: Stripe is only entered after a valid MGE draft exists.

## Non-Goals

- Do not edit crop or regenerate previews from the cart page.
- Do not use generated preview/mockup images as input for another size.
- Do not expose MGE, Stripe, Cloudflare, Resend, or identity secrets to the browser.
- Do not submit MGE orders before Stripe payment succeeds.
- Do not build a full account/order-history system beyond the draft/cart needed for checkout.
- Do not add non-MGE cart pricing rules if MGE purchase options already provide the selected framing/SKU.

## Product Decisions

- Cart scope: all verified account projects, not only the currently selected source project.
- Cart surface: new page, not the 3D preview panel.
- Visual structure: source image with individual ready 2D DOT designs underneath/alongside it.
- Framing/settings: use MGE purchase options, mainly framed vs unframed variants.
- Quantity: per selected design variant; default should be `1`, but editable.
- Selection: customers explicitly select which of the ready designs enter the cart.
- Availability: only orderable MGE purchase options are enabled for selection.
- Edits: no crop/edit controls at this stage. Customers go back to preview/account flow to change designs.
- Draft behavior: one MGE order draft with multiple `line_items[]`.
- Persistence: MGE draft should become the source of truth; browser state is a helper, not the authority.

## Constraints

- MGE remains the source of truth for previews, purchase options, order drafts, validation, submission, and order status.
- Generated preview URLs and mockup URLs are display-only.
- Every selected cart item must be reconstructed server-side from MGE purchase options before it is written into the draft.
- Browser-provided price, SKU, and order line data cannot be trusted.
- Checkout must block or remove stale draft lines when the related preview is no longer present/orderable.
- Multi-line Stripe payment must match the validated MGE draft total/line items, not a browser-calculated total.
- Live deploy/payment/order-submit smoke must be a separate explicit phase.

## Current State

- `components/account/account-panel.tsx:116` groups MGE identity `projects[]` into saved preview groups.
- `components/account/account-panel.tsx:610` renders the verified preview/account drawer, but not a cart page.
- `components/account/account-panel.tsx:649` opens a saved preview by `preview_id`, `size_id`, and orientation.
- `components/single-screen-preview/purchase-panel.tsx:87` polls purchase options for only the currently selected preview.
- `components/single-screen-preview/purchase-panel.tsx:178` starts checkout from one selected preview and one selected purchase option.
- `components/single-screen-preview/purchase-panel.tsx:213` calls `client.createOrderDraft()` with one `preview_id`, `preview_option_id`, and SKU.
- `lib/mgeveryday/browser-preview.ts:111` defines `BffOrderDraftInput` as a single-preview draft request.
- `lib/mgeveryday/browser-preview.ts:233` posts draft creation to `/api/mge/order-draft`.
- `lib/mgeveryday/bff-handler.ts:192` handles `/api/mge/order-draft` as a single selected preview.
- `lib/mgeveryday/bff-handler.ts:222` sends `line_items` to MGE, currently appending the selected canonical order line to any existing draft lines.
- `tests/mge-purchase-options.test.ts:239` locks that draft creation posts to MGE `/api/v1/order-drafts/`.
- `tests/mge-purchase-options.test.ts:376` proves the BFF can patch an existing draft by merging `line_items`, but there is not yet a replace/sync whole-cart contract.
- `lib/stripe/edge.ts:120` currently creates one Stripe `line_items[0]` quantity.
- `lib/stripe/edge.ts:338` reads checkout context from one preview/purchase option.
- `docs/ACTIVE_WORK.md:11` still names the paid MGE checkout bridge as the active objective.
- `docs/plans/2026-05-25-mge-purchase-options-stripe-price-data.md` planned one selected preview option first, then MGE order draft and Stripe.

## Phase Index

1. [DONE - Phase 1 - Cart Contract And Draft Sync Model](01_PHASE1_CART_CONTRACT_AND_DRAFT_SYNC_MODEL.md)
2. [DONE - Phase 2 - Multi-Project 2D Cart Page UX](02_PHASE2_MULTI_PROJECT_2D_CART_PAGE_UX.md)
3. [DONE - Phase 3 - MGE Draft Create Update Delete Sync](03_PHASE3_MGE_DRAFT_CREATE_UPDATE_DELETE_SYNC.md)
4. [DONE - Phase 4 - Multi-Line Checkout Handoff](04_PHASE4_MULTI_LINE_CHECKOUT_HANDOFF.md)
5. [IN PROGRESS - Phase 5 - Validation Deploy And Smoke](05_PHASE5_VALIDATION_DEPLOY_AND_SMOKE.md)

## Dependencies

- Verified account history and source-project variant flow must remain stable.
- Manual crop replacement must keep updated variants under the original source project so the cart page sees the current canonical ready variants.
- MGE purchase options must include enough data to distinguish framed and unframed options. If the frame distinction is not explicit, Phase 1 must document the missing field for MGE/API follow-up before UX implementation.
- Existing payment/webhook code must not be broadened to multi-line until the draft sync shape is tested.

## Rollout Plan

1. Build the cart model and BFF draft sync contract without changing production payment behavior.
2. Add the new page behind an explicit navigation/action from the existing preview or account surface.
3. Let the page create/update MGE drafts, but keep Stripe handoff gated until multi-line totals and metadata are validated.
4. Update Stripe handoff only after the MGE draft is the source of truth for selected line items.
5. Deploy to Cloudflare preview first, smoke the draft/cart behavior, then release to `https://dottingo.sg/`.

## Validation Strategy

Focused source/unit tests:

```powershell
node --test tests/account-preview-registry-source.test.ts tests/mge-purchase-options.test.ts tests/purchase-panel-source.test.ts
```

Broader checkout tests:

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

Expected implementation-specific tests:

- Cart page reads verified identity projects and renders all ready project variants.
- Cart page excludes or disables non-orderable purchase options.
- BFF rejects browser-supplied SKU/price/order-line data that does not match canonical MGE purchase options.
- Draft sync can create, replace, and remove line items rather than only append.
- Deleting or replacing a preview removes/replaces the matching draft line before checkout.
- Stripe handoff uses the validated MGE draft, not raw browser cart state.

## Deploy And Smoke Strategy

No deploy is required for this planning task.

Implementation phases that change UI or BFF behavior should end with:

```powershell
npm run worker:typecheck
npm run build
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```

Smoke URLs to report:

- Cloudflare preview URL returned by Wrangler.
- Production URL: `https://dottingo.sg/`.

Manual smoke checklist after release:

1. Log in to a verified account with at least two source projects and multiple ready variants.
2. Open the cart/checkout page.
3. Confirm all projects appear with source thumbnails and ready 2D design images.
4. Select several design variants from different source photos.
5. Choose framed/unframed purchase options where available.
6. Change quantity for one selected variant.
7. Confirm MGE draft has matching multiple `line_items[]`.
8. Delete or replace a preview and confirm the draft line is removed or updated.
9. Continue to payment only after draft validation succeeds.

## Next Action

Complete Phase 5 verified production smoke: log in to `https://dottingo.sg/` with the magic-link account, open `https://dottingo.sg/checkout`, select a ready design, switch W/WO purchase option, confirm the MGE draft syncs, then stop before live payment unless explicitly approved.
