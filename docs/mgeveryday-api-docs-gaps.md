# MGEeveryday API documentation gaps and integration findings

This file tracks documentation gaps found while integrating API-backed storefronts. The goal is to improve the MGEeveryday docs for Makeyourcraft and future third-party frontend users.

## Current findings

- API docs are public at `https://www.mgeveryday.sg/api/v1/docs/`.
- OpenAPI schema is public at `https://www.mgeveryday.sg/api/v1/schema/`.
- Auth scheme is clear: Bearer API key in the `Authorization` header.
- Read-only auth verification works with the saved API key.
- Current default integration brand is `brand_id=116`, `brand_short_code=WHTE`, user `agentgondolan@gmail.com`, role `admin`.
- DOT variants are available through `GET /api/v1/products/types/DOT/variants/?product_type=VF`.
- The intended storefront sequence appears to be preview → order draft → validate → submit.
- Order drafts are well named and map cleanly to a smart-cart concept.
- Existing app currently has local mock preview processing; MGE preview should replace that for real DOT testing.
- Deployment finding: the current Next.js app is configured as `output: 'export'` and the GitHub workflow deploys a static export to Cloudflare Pages. That means Next.js API routes/server actions cannot be used in the deployed app until we add a separate server boundary (Cloudflare Worker/Pages Function) or migrate deployment to OpenNext/serverless.
- Phase 0 implementation therefore creates a server-only MGE client library and typed resource wrappers first, without wiring it into browser code or changing deployment behavior yet.

## Documentation gaps

### 1. End-to-end DOT tutorial

Add a single copy-pasteable tutorial for:

1. Discover brand ID.
2. Upload image for DOT preview.
3. Poll preview until complete/partial.
4. Select an orderable preview option.
5. Create order draft.
6. Attach preview/asset/order contract to draft line item.
7. Validate draft.
8. Submit draft.

The current docs expose the endpoints, but a third-party frontend implementer still has to infer the full sequence.

### 2. Exact `PreviewCreate` multipart fields

The preview endpoint description is useful, but integration needs exact request examples for each product family.

Needed examples:

- DOT custom photo, default size.
- DOT custom photo with requested size/manufacturing preference.
- DBN custom photo.
- PHT custom photo.
- How to pass multiple product families, if supported.
- Which fields are required vs optional.

### 3. Preview result lifecycle

Document preview status handling in one place:

- All possible statuses.
- Which statuses are terminal.
- Recommended polling interval and timeout.
- Meaning of `COMPLETED` vs `PARTIAL`.
- Whether partial previews are safe/orderable.
- Error payload examples for bad image, quota, unsupported product, and internal failure.

### 4. Preview image URL behavior

Frontend integration needs to know:

- Whether preview image URLs are absolute or relative.
- Whether URLs are public, signed, or require auth.
- Expiry policy.
- CORS behavior for browser rendering.
- Whether URLs are stable enough to store in a draft/account page.

### 5. Preview option → order draft mapping

The docs mention `preview_option_id`, `order_contract`, `order_contract_version`, and orderable options, but the exact order-draft line-item shape should be shown.

Needed:

- Copy-paste JSON example from a selected DOT preview option to order draft line item.
- Whether clients should send `preview_option_id`, `order_contract`, `asset_url`, `asset_token`, or generated SKU.
- Which field is canonical and future-proof.
- Whether edited previews require `editor_session_id` only, or both `editor_session_id` and `preview_option_id`.

### 6. Order draft patch examples

`POST /api/v1/order-drafts/` is clear enough for creation, but examples should show how to add/update:

- Shipping method.
- Shipping address.
- Line items.
- Preview-derived assets.
- Notes/reference IDs.

### 7. Idempotency and duplicate-submit guidance

Storefronts need safe retry behavior.

Document:

- Whether `reference_id` is unique per brand or advisory only.
- Recommended idempotency key behavior for `submit` / direct `orders` creation.
- What happens when submit is retried after a network timeout.
- How to detect an already-submitted draft.

### 8. Test/sandbox guidance

Add a safe testing section:

- How to create test drafts/orders without production consequences.
- Whether there is a sandbox brand or test mode.
- Recommended reference prefix like `MYC-TEST-*`.
- Whether test orders can be cancelled automatically.
- Which endpoints are safe for read-only verification.

### 9. Error response consistency

Add a common error reference:

- Auth errors.
- Scope errors.
- Brand access errors.
- Quota not configured/exhausted.
- Validation errors.
- Unsupported SKU/product family.
- Duplicate reference/order.

Each should include status code, JSON shape, and recovery advice.

### 10. Singapore storefront notes

For the Singapore DOT test, add or later expand:

- Supported shipping methods for Singapore.
- Currency behavior, since current brand reports preferred currency `EUR`.
- Payment/order timing expectations once PayNow/Stripe is added.
- Whether order submit should wait for payment confirmation.

## Integration implication for Makeyourcraft

Phase 0 should not expose the MGEeveryday API token to the browser. The Next.js app needs a server-side API boundary that owns MGE auth and returns sanitized JSON to the client.

Phase 1 should start with DOT only and avoid over-generalizing until one real preview → draft → submit path is proven.
