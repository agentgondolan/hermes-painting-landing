# Implementation Log

## 2026-07-03 - Codex - Task Created

Summary:
- Created the multi-preview cart/draft-builder task from product decisions supplied by Matej.
- Confirmed the existing active checkout flow is single-preview/single-purchase-option oriented.
- Confirmed old checkout work exists in docs and code, but no active ledger task covers the new multi-preview cart page.

Researched files:
- `AGENTS.md`
- `docs/ACTIVE_WORK.md`
- `.github/prompts/mg_plan.prompt.md`
- `.github/tasks/_active/20260625_account_login_history_flow/TASK.md`
- `.github/tasks/_active/20260702_manual_crop_orientation/TASK.md`
- `docs/plans/2026-05-25-mge-purchase-options-stripe-price-data.md`
- `docs/plans/2026-06-11-mge-identity-projects-integration.md`
- `components/account/account-panel.tsx`
- `components/single-screen-preview/purchase-panel.tsx`
- `lib/mgeveryday/browser-preview.ts`
- `lib/mgeveryday/bff-handler.ts`
- `lib/stripe/edge.ts`
- `tests/mge-purchase-options.test.ts`
- `tests/purchase-panel-source.test.ts`

Commands run:
- `npm run agent:status`
- `git status --short`
- `rg -n "checkout|cart|draft|line_items|purchase option|framing|frame" ...`

Next action:
- Implement Phase 1 only after plan review: define cart line item contract and MGE draft sync model.

## 2026-07-06 - Codex - Phase 1 Implemented

Summary:
- Implemented the multi-preview cart contract at the browser/BFF boundary.
- Added `cart_lines[]` support to the existing order-draft BFF route while preserving the legacy single-preview draft request.
- Added canonicalization for each cart line by re-fetching MGE purchase options for the line's `preview_id`.
- Added replace-style draft sync so selected cart lines become the full MGE draft `line_items[]`.
- Added tests proving canonical MGE order lines and quantities are used, browser-supplied price/order-line data is ignored, tampered SKU lines are rejected, and an existing draft can be cleared.

Files changed:
- `lib/mgeveryday/browser-preview.ts`
- `lib/mgeveryday/bff-handler.ts`
- `tests/mge-purchase-options.test.ts`
- `tests/purchase-panel-source.test.ts`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/TASK.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/01_PHASE1_CART_CONTRACT_AND_DRAFT_SYNC_MODEL.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/DECISIONS.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/LOG.md`

Validation:
- `node --test tests/mge-purchase-options.test.ts tests/purchase-panel-source.test.ts` passed.
- `npm run worker:typecheck` passed.

Notes:
- No cart page or Stripe multi-line handoff was implemented in this phase.
- No deploy was run for this contract-only phase.

Next action:
- Implement Phase 2 only: Multi-Project 2D Cart Page UX.

## 2026-07-06 - Codex - Phase 2 Implemented

Summary:
- Added the `/checkout` route for the multi-project 2D cart UX.
- Added `MultiProjectCartPage` to load the verified identity, fetch all MGE account projects, render source thumbnails with ready 2D DOT designs, and fetch orderable purchase options per preview.
- Added local selection, purchase-option choice, quantity editing, and a read-only draft summary.
- Kept draft sync and Stripe handoff out of scope for this phase.
- Added source tests for the cart page contract.

Files changed:
- `app/checkout/page.tsx`
- `components/cart/multi-project-cart-page.tsx`
- `tests/cart-page-source.test.ts`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/TASK.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/02_PHASE2_MULTI_PROJECT_2D_CART_PAGE_UX.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/LOG.md`

Validation:
- `node --test tests/account-preview-registry-source.test.ts tests/purchase-panel-source.test.ts tests/cart-page-source.test.ts` passed.
- Initial parallel `npm run build` timed out.
- Rerun `npm run build` passed and included route `/checkout`.

Notes:
- No deploy was run for this phase.
- The cart page currently shows local draft state only. MGE draft create/update/delete sync is Phase 3.

Next action:
- Implement Phase 3 only: MGE Draft Create Update Delete Sync.

## 2026-07-06 - Codex - Phase 3 Implemented

Summary:
- Wired the multi-project cart page to call `client.createOrderDraft()` with selected `cart_lines[]`.
- Added local MGE draft id persistence, returned draft rendering, dirty-state messaging, and error handling.
- Kept Stripe/payment untouched; the cart now stops at a synced MGE draft.
- Added source tests that prove draft sync is wired, selected lines carry preview/purchase/quantity fields, stale selections can be cleared against an existing draft, and Stripe is still not called.

Files changed:
- `components/cart/multi-project-cart-page.tsx`
- `tests/cart-page-source.test.ts`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/TASK.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/03_PHASE3_MGE_DRAFT_CREATE_UPDATE_DELETE_SYNC.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/DECISIONS.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/LOG.md`

Validation:
- `node --test tests/cart-page-source.test.ts tests/mge-purchase-options.test.ts` passed.
- `npm run worker:typecheck` passed.
- `node --test tests/*.test.ts` passed, 108 tests.
- `npm run build` passed and generated `/checkout`.

Notes:
- No deploy was run for this phase.
- The cart can sync a draft but cannot yet hand that draft to Stripe; that is Phase 4.

Next action:
- Implement Phase 4 only: Multi-Line Checkout Handoff.

## 2026-07-06 - Codex - Phase 4 Implemented

Summary:
- Added the cart page payment handoff from a synced MGE draft.
- Updated Stripe checkout creation to fetch the MGE order draft by id and convert draft `line_items[]` into multiple Stripe Checkout line items.
- Preserved `order_draft_id` and verified email metadata for webhook submission.
- Kept webhook paid/unpaid/idempotency behavior intact.
- Added tests proving browser cart payload cannot change Stripe pricing after draft sync.

Files changed:
- `components/cart/multi-project-cart-page.tsx`
- `lib/stripe/edge.ts`
- `tests/cart-page-source.test.ts`
- `tests/stripe-edge.test.ts`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/TASK.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/04_PHASE4_MULTI_LINE_CHECKOUT_HANDOFF.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/DECISIONS.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/LOG.md`

Validation:
- `node --test tests/stripe-edge.test.ts tests/mge-purchase-options.test.ts tests/cart-page-source.test.ts` passed, 34 tests.
- `npm run worker:typecheck` passed.
- `npm run build` passed and generated `/checkout`.

Notes:
- No deploy was run for this phase.
- The next phase should deploy and smoke the real cart draft -> Stripe test payment -> webhook -> MGE draft submit path.

Next action:
- Implement Phase 5 only: Validation Deploy And Smoke.

## 2026-07-07 - Codex - Purchase Options Frame Contract Update

Summary:
- Updated the MGE purchase-options normalizer to expose explicit DOT `frame` metadata as `frameCode` and `frameLabel`.
- Updated checkout option labels to prefer MGE `frame.label` plus `production_speed.label` instead of inferring frame choices from pricing/catalog SKU text.
- Updated the sanitized purchase-options fixture to model the new MGE behavior where one fixed-size `preview_option_id` returns multiple frame checkout rows such as W, WO, and WW.
- Documented that checkout must copy returned `order_line` from `purchase-options` and must not synthesize DOT checkout SKUs from `/products/pricing/`.

Files changed:
- `lib/mgeveryday/bff-handler.ts`
- `lib/mgeveryday/browser-preview.ts`
- `components/cart/multi-project-cart-page.tsx`
- `tests/fixtures/mge-purchase-options.sample.json`
- `tests/mge-purchase-options.test.ts`
- `tests/cart-page-source.test.ts`
- `docs/mgeveryday-api-docs-gaps.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/LOG.md`

Validation:
- `node --test tests/mge-purchase-options.test.ts tests/cart-page-source.test.ts` passed, 26 tests.
- `npm run worker:typecheck` passed.

Notes:
- No deploy was run for this update.
- `/api/v1/products/pricing/` remains discovery/display only; order draft and checkout must use purchase-options `order_line`.

## 2026-07-07 - Codex - Admin Settings And W/WO Checkout Policy

Summary:
- Centralized Dottingo storefront knobs in `lib/dottingo/project-settings.ts`.
- Limited checkout purchase options to standard-speed `W` and `WO` frame codes for now.
- Simplified customer option labels to `With frame` and `Without frame` while Express is hidden.
- Added an `/admin` settings page visible to `matejgondolan@gmail.com` after verified login.
- Added an Admin link next to the verified email badge on checkout for the configured admin account.

Files changed:
- `lib/dottingo/project-settings.ts`
- `components/cart/multi-project-cart-page.tsx`
- `app/admin/page.tsx`
- `components/admin/admin-settings-page.tsx`
- `tests/admin-settings-source.test.ts`
- `tests/cart-page-source.test.ts`
- `docs/mgeveryday-api-docs-gaps.md`
- `.github/tasks/_active/20260703_multi_preview_cart_draft_builder/LOG.md`

Validation:
- `node --test tests/admin-settings-source.test.ts tests/cart-page-source.test.ts tests/mge-purchase-options.test.ts` passed, 30 tests.
- `npm run worker:typecheck` passed.
- `npm run build` passed and generated `/admin` plus `/checkout`.
- Local HTTP smoke passed for `http://127.0.0.1:3206/admin` and `http://127.0.0.1:3206/checkout`.
- Local BFF probe confirmed the filtered intended standard rows for preview `181fd0fa-1aee-4137-8508-ce30e512a499`: `W` and `WO`.
