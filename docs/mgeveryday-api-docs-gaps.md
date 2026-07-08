# MGEeveryday API documentation gaps and integration findings

This file tracks documentation gaps found while integrating API-backed storefronts. The goal is to improve the MGEeveryday docs for Makeyourcraft and future third-party frontend users.

## Current findings

- API docs are public at `https://www.mgeveryday.sg/api/v1/docs/`.
- OpenAPI schema is public at `https://www.mgeveryday.sg/api/v1/schema/`.
- Internal identity Swagger UI is at `https://www.mgeveryday.sg/api/internal/v1/docs/`; the machine-readable internal OpenAPI contract is at `https://www.mgeveryday.sg/api/internal/v1/schema/`.
- Auth scheme is clear: Bearer API key in the `Authorization` header.
- Read-only auth verification works with the saved API key.
- 2026-06-26: returning-account identity login is live. `POST /api/internal/v1/identity/magic-link/request/` accepts `brand_id`, `email`, and `continue_path` without `preview_id`; `POST /api/internal/v1/identity/magic-link/verify/` may return `preview_id: null`; `GET /api/internal/v1/identity/previews/?brand_id=64` returns `current_preview_id: null`, `previews`, and `projects` for previewless sessions.
- 2026-06-29: account-history source-project variants are live. `GET /api/internal/v1/identity/previews/?brand_id=64` treats `projects[]` as the canonical saved-design view; each project returns one current preview per selected size by default. Flat `previews[]` remains the full compatibility/audit list and now includes `variant_key`, `variant_rank`, `is_current_variant`, and `superseded_by_preview_id`.
- 2026-06-29: verified accounts can attach an already-created current preview without another email via `POST /api/internal/v1/identity/previews/` with `brand_id` and `preview_id`, plus `X-MGE-Identity-Token`.
- 2026-06-29: verified accounts can generate a new size variant from the stored original source image via `POST /api/internal/v1/identity/projects/{source_group_id}/previews/` with `brand_id`, `product: "DOT"`, and `preferred_size`.
- 2026-06-29: testing cleanup endpoints are live for identity-history associations only: delete one preview, delete one source project, or clear a test identity history.
- 2026-06-29 follow-up: Account history should render only saved/current size badges from canonical `projects[]`. Missing sizes should not be shown as `+` badges in the saved-design list; deletion uses MGE identity-history `DELETE` endpoints.
- 2026-06-29 delete contract finding: live `DELETE /api/internal/v1/identity/previews/{preview_id}/` and `DELETE /api/internal/v1/identity/projects/{source_group_id}/` require JSON body `{ "brand_id": 64 }`, although the current schema section does not document a request body.
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

## Purchase options contract snapshot

Source: `GET https://www.mgeveryday.sg/api/v1/preview/{preview_id}/purchase-options/` in the OpenAPI schema fetched on 2026-05-25.

Endpoint notes from OpenAPI:

- Call only after `GET /api/v1/preview/{preview_id}/` returns `COMPLETED` or `PARTIAL`.
- Response lists preview options that can be ordered by the calling brand.
- Each item includes a copyable `order_line` with `sku`, `quantity`, and `preview_option_id`.
- Use the returned `order_line` object inside `line_items[]` when creating or validating an order.
- Auth: Bearer API key via `APIKey` security scheme.
- Documented errors: `401` missing API key, `403` ownership mismatch or missing scope, `404` preview not found.

Documented/example response shape:

```json
{
  "preview_id": "11111111-2222-3333-4444-555555555555",
  "status": "COMPLETED",
  "purchase_options": [
    {
      "preview_option_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "product": "DBN",
      "label": "Square / 50 colors / source",
      "description": "Square diamonds. Approx. 50 colors. Natural image filter.",
      "preview_url": "https://cdn.example.com/preview.jpg",
      "mockup_url": "https://cdn.example.com/mockup.jpg",
      "production_speed": {
        "code": "STD",
        "label": "Standard"
      },
      "order_line": {
        "sku": "DBN/VF/40X50/COL50/SQRA/W/STD",
        "quantity": 1,
        "preview_option_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
      },
      "unit_price": "12.50",
      "currency": "EUR"
    }
  ]
}
```

2026-07-07 update: MGE confirmed DOT frame choices are order variants under the same fixed-size generated preview option. A single `preview_option_id` for a generated size/crop can return multiple checkout options such as `DOT/VF/40X50/W/BLACK/STD`, `DOT/VF/40X50/WO/BLACK/STD`, `DOT/VF/40X50/WW/BLACK/STD`, `DOT/VF/40X50/WPM/BLACK/STD`, and `DOT/VF/40X50/WDIYF/BLACK/STD`.

Each purchase-option row may include explicit `frame` and `production_speed` objects:

```json
{
  "preview_option_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "product": "DOT",
  "label": "Source / Without frame / Standard",
  "frame": {
    "code": "WO",
    "label": "Without frame"
  },
  "production_speed": {
    "code": "STD",
    "label": "Standard"
  },
  "order_line": {
    "sku": "DOT/VF/40X50/WO/BLACK/STD",
    "quantity": 1,
    "preview_option_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  },
  "unit_price": "7.14",
  "currency": "EUR"
}
```

Important distinction: frame variants can share a `preview_option_id` only when the generated size/crop/output is the same. Different sizes such as `40X50`, `40X60`, and `60X80` must remain separate generated previews under the same source project.

Dottingo checkout must use `purchase-options` as the source of truth and copy the returned `order_line`. Do not synthesize checkout SKUs from `GET /api/v1/products/pricing/` in the frontend. The pricing catalog can be used for discovery/display only; checkout requires the returned `preview_option_id`, SKU, and current B2B price from `purchase-options`.

The sanitized DOT fixture lives at `tests/fixtures/mge-purchase-options.sample.json` and covers multiple frame variants sharing one `preview_option_id`.

Current Dottingo storefront policy:

- Show only standard-speed checkout options while Express is disabled.
- Show only frame codes `W` and `WO` for now.
- Customer labels should be `With frame` and `Without frame`; do not append `/ Standard` while Express is hidden.
- Keep these choices in `lib/dottingo/project-settings.ts` and expose them on the local admin settings view.

## Account history source thumbnail note

For Dottingo account history, use the original source image fields from MGE for saved-design thumbnails:

- `projects[].source_image.url`
- preview-level `source_image.url`
- preview-level `source_image_url`

Do not fall back to generated `preview_url`, `image_url`, `mockup_url`, or browser `imageUrl` for account-history thumbnails. Those generated DOT/design images are valid for the preview canvas and purchase option views, but the saved-design row should represent the uploaded source photo.

When a verified user saves the current preview, Dottingo should prefer the MGE attach response source fields before storing the local registry fallback.

## Account history variant replacement and manual crop note

MGE confirmed the intended account-history variant replacement shape for Dottingo:

1. Optional cleanup/removal of an old preview association:

```http
DELETE /api/internal/v1/identity/previews/{preview_id}/?brand_id=64
Authorization: Bearer <internal_api_key>
X-MGE-Identity-Token: <identity_token>
```

This revokes only the identity-history association. It does not delete the PreviewSession, source image, generated media, products, or options.

2. Generate a new variant from the saved source project:

```http
POST /api/internal/v1/identity/projects/{source_group_id}/previews/
Authorization: Bearer <internal_api_key>
X-MGE-Identity-Token: <identity_token>
Content-Type: application/json
```

Base body:

```json
{
  "brand_id": 64,
  "product": "DOT",
  "preferred_size": "40X60"
}
```

This uses the stored original source image for the project, not `preview_url` or `mockup_url`. The new PreviewSession is created through the normal preview pipeline and automatically attached to the verified identity.

3. Refresh account history:

```http
GET /api/internal/v1/identity/previews/?brand_id=64
X-MGE-Identity-Token: <identity_token>
```

The new preview should appear under the same `source_group_id`. `projects[].previews` returns canonical variants by default, so duplicate old same-size variants should not appear unless `include_superseded=true` is used.

Manual crop note: Dottingo has a browser-side cropped upload path, but that path is only useful for a standalone preview. It creates a new MGE source image/project when the cropped file is uploaded, so it must not be used for verified account-history variant replacement.

Expected verified-account behavior:

1. User opens a saved source project.
2. User generates or selects a size variant, for example `60X80`.
3. User edits crop/orientation for that size.
4. User saves the recropped DOT preview.
5. Account history shows the saved `60X80` variant on the original source project's row.
6. If the original source project already had a `60X80` variant, the new recropped variant supersedes/replaces that visible size variant.

Implementation contract:

- Call `POST /api/internal/v1/identity/projects/{source_group_id}/previews/`.
- Keep using the stored original source image behind `source_group_id`.
- Send `preferred_size` for the selected variant.
- Send `preferred_orientation` for portrait/landscape intent.
- For manual crop, send `auto_crop=false`.
- Send the selected crop rectangle in `product_params` and `preview_options` so MGE crops the stored source before generating the DOT design.

If this project endpoint fails, Dottingo should not fall back to cropped upload for verified saved-source variants, because that creates a separate saved-design card.
