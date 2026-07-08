# Decisions

## 2026-07-03 - Cart Scope Is All Saved Projects

The cart page should allow selection from all verified account projects, not only the currently opened 3D preview or current source project. The intended customer behavior is to add more photos/designs, then select some of those ready variants into one order.

## 2026-07-03 - Use A New Page For Cart/Checkout

The cart/draft builder should be a new page rather than a modal/drawer over the 3D view. The 3D view is useful for inspecting one design; the cart page is for comparing multiple ready 2D designs and configuring order lines.

## 2026-07-03 - MGE Draft Is Source Of Truth

After a draft exists, MGE draft state should be treated as the source of truth. Browser state can help with optimistic UI and restore, but the selected cart line items must be synced back to MGE and validated before payment.

## 2026-07-03 - Purchase Options Own Framing

Framed/unframed and similar settings should come from MGE purchase options. Dottingo should not invent a separate framing setting unless MGE lacks an explicit field needed to distinguish options.

## 2026-07-03 - No Editing From Cart

The cart page should not expose crop or edit controls. If the customer changes or deletes a preview elsewhere, the draft must be updated or the affected line must be removed.

## 2026-07-06 - Cart Sync Replaces Draft Lines

For the multi-preview cart contract, Dottingo syncs the selected cart state by replacing the MGE draft `line_items[]` instead of appending to existing draft lines. This makes preview deletion, recrop replacement, quantity changes, and unselect actions deterministic: the draft should contain exactly the selected orderable cart lines after each sync.

## 2026-07-06 - Browser Stores Draft Id Only As Helper

The checkout cart page stores the MGE `orderDraftId` in browser localStorage only as a resume helper. MGE remains the authoritative source for draft line items after sync; local browser selection state must be re-synced before payment whenever it changes.

## 2026-07-06 - Stripe Reads The MGE Draft By Id

The multi-line payment handoff sends only the synced `order_draft_id` and verified identity token from the browser to Stripe checkout. The edge handler fetches the MGE draft server-side and builds Stripe `line_items[]` from that validated draft, so browser cart lines cannot change the Stripe amount after draft sync.
