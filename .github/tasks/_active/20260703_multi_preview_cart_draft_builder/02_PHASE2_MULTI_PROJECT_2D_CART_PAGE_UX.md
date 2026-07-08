Status: DONE
Required: yes
Created: 2026-07-03
Updated: 2026-07-06
Depends on: 01_PHASE1_CART_CONTRACT_AND_DRAFT_SYNC_MODEL.md
Supersedes: none

# Phase 2 - Multi-Project 2D Cart Page UX

## Objective

Create the new cart/checkout page that shows all verified account projects as source images with ready 2D DOT design variants.

## Scope

- Add a new page route for cart/checkout selection.
- Load verified identity and MGE account projects.
- Render source thumbnail per project.
- Render ready/orderable 2D design images per preview variant.
- Fetch purchase options for each ready preview as needed.
- Show only enabled orderable options for selection.
- Allow explicit select/unselect per design.
- Allow quantity editing per selected design, defaulting to `1`.
- Show framed/unframed choices from MGE purchase options when those are distinguishable.

## Non-Scope

- No crop/edit modal on this page.
- No Stripe redirect yet unless Phase 4 has been implemented.

## Acceptance

- Page can show designs from multiple source projects in one view.
- The 3D scene is not required for this page.
- Non-orderable previews cannot be selected.
- Quantity and purchase option state is visible and editable for selected designs.
- UI does not expose raw MGE secrets or internal order-line payloads.

## Validation

```powershell
node --test tests/account-preview-registry-source.test.ts tests/purchase-panel-source.test.ts
npm run build
```

## Result

- Added `/checkout` as a new multi-project cart page route.
- Added `MultiProjectCartPage` to load the verified identity, fetch MGE account `projects[]`, and render ready preview variants as 2D design images grouped by source image.
- The page fetches purchase options per ready preview and only enables options with a canonical order line and unit price.
- Customers can explicitly select/unselect a design, choose among orderable purchase options, and edit quantity per selected preview.
- The page shows a local draft summary but intentionally does not call draft sync or Stripe yet; that remains Phase 3 and Phase 4.
- Added source tests for route wiring, verified-project loading, 2D design rendering, orderable option filtering, selection, quantity, and no draft/Stripe calls.

Validation run:

```powershell
node --test tests/account-preview-registry-source.test.ts tests/purchase-panel-source.test.ts tests/cart-page-source.test.ts
npm run build
```

The source tests passed on 2026-07-06. The first parallel `npm run build` timed out without useful output; rerunning it by itself with a longer timeout passed and generated the `/checkout` route.
