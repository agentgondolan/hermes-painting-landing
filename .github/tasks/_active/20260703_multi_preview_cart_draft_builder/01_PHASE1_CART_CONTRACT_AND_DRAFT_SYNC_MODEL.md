Status: DONE
Required: yes
Created: 2026-07-03
Updated: 2026-07-06
Depends on: none
Supersedes: none

# Phase 1 - Cart Contract And Draft Sync Model

## Objective

Define the browser/BFF contract for a multi-preview cart before building the page. The contract must support multiple selected ready preview variants, one purchase option/framing choice per variant, quantity per variant, and one MGE draft as the source of truth.

## Scope

- Add typed cart line item shapes in browser-safe code.
- Extend BFF draft input planning from one selected preview to a list of desired cart lines.
- Define a server-side canonicalization flow that re-fetches purchase options for each selected `preview_id`.
- Decide whether draft sync replaces the entire draft `line_items[]` or patches individual add/remove operations. Default recommendation: replace the draft `line_items[]` from the selected cart state so deletes and preview replacements cannot leave stale lines.
- Add tests that lock the expected payload shape without changing production payment behavior yet.

## Acceptance

- Contract includes `preview_id`, `preview_option_id`, selected purchase option/SKU, quantity, and display metadata only where safe.
- Server-side code never trusts browser price, SKU, or order line without re-fetching MGE purchase options.
- Contract can express removing a line when a preview is deleted or replaced.
- Existing single-preview checkout tests keep passing.
- Phase does not create a live payment path.

## Validation

```powershell
node --test tests/mge-purchase-options.test.ts tests/purchase-panel-source.test.ts
npm run worker:typecheck
```

## Result

- Added browser-safe `BffCartDraftLineInput` and extended `BffOrderDraftInput` with `cart_lines[]`.
- Added BFF support for syncing a multi-preview cart draft through the existing `/api/mge/order-draft` route.
- Kept the existing single-preview draft request path intact for the current purchase panel.
- Cart sync re-fetches canonical MGE purchase options per `preview_id` and writes canonical `orderLine` values only.
- Cart sync replaces draft `line_items[]` from selected cart lines instead of appending, so removed or changed previews can remove stale lines.
- Empty `cart_lines[]` with an existing `order_draft_id` clears the draft lines.

Validation run:

```powershell
node --test tests/mge-purchase-options.test.ts tests/purchase-panel-source.test.ts
npm run worker:typecheck
```

Both passed on 2026-07-06.
