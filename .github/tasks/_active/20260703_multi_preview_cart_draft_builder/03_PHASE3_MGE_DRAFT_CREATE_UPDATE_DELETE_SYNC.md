Status: DONE
Required: yes
Created: 2026-07-03
Updated: 2026-07-06
Depends on: 01_PHASE1_CART_CONTRACT_AND_DRAFT_SYNC_MODEL.md, 02_PHASE2_MULTI_PROJECT_2D_CART_PAGE_UX.md
Supersedes: none

# Phase 3 - MGE Draft Create Update Delete Sync

## Objective

Make the cart page create and maintain one MGE order draft whose `line_items[]` match the selected cart lines.

## Scope

- Create draft when the first selected line is synced.
- Update draft when selected purchase option, quantity, or selected design changes.
- Remove draft line when the user unselects a design.
- Remove or replace draft line when the underlying preview is deleted or replaced by account/crop flow.
- Re-fetch the MGE draft after sync and render that state back into the cart page.
- Handle stale purchase options by blocking the affected line and showing an actionable message.

## Acceptance

- MGE draft can represent multiple selected previews from different source projects.
- Draft sync does not append duplicates when updating the same selected preview.
- Removing a selected design removes the corresponding MGE draft line.
- Browser display state reconciles with MGE draft state after each sync.
- Existing payment/webhook flow is not broadened until Phase 4.

## Validation

```powershell
node --test tests/mge-purchase-options.test.ts tests/*.test.ts
npm run worker:typecheck
```

## Result

- Wired the `/checkout` cart page to sync selected designs into one MGE order draft through the Phase 1 `cart_lines[]` contract.
- The cart page stores the returned `orderDraftId`, displays the MGE draft id and line count, and marks the draft dirty when selections, purchase option, or quantity changes.
- Selected cart lines include `preview_id`, `preview_option_id`, canonical SKU choice, quantity, selected size, source group, source image URL, design image URL, and display label.
- Removing or replacing previews in the loaded account project list prunes stale local selections; syncing after that sends the new full cart state to MGE.
- Existing draft ids can be reused so syncing an empty selection can clear existing draft lines.
- Stripe/payment handoff remains untouched for Phase 4.

Validation run:

```powershell
node --test tests/cart-page-source.test.ts tests/mge-purchase-options.test.ts
npm run worker:typecheck
node --test tests/*.test.ts
npm run build
```

All passed on 2026-07-06.
