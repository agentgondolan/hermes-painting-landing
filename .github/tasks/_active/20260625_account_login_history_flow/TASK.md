Status: DONE
Created: 2026-06-25
Updated: 2026-06-26
Owner: Codex
Proposed branch: codex/account-login-history-flow

# Account Login History Flow

## Overview

The Account panel currently feels like a first-user save flow. If there is no ready current preview, the panel tells the user to create a design first and does not offer the email magic-link path. That is correct for saving a brand-new preview, but it is wrong for returning customers who already have saved designs in MGE identity history. They should be able to enter their email, receive a magic link, verify, and land in their account/history even before uploading or generating a new image.

Target behavior:

`Account -> enter email -> magic link -> verified identity -> load saved previews/projects -> open a saved preview`

The existing paid checkout priority still stands. This task only improves the account entry shape around history/login and must not weaken preview-scoped checkout validation.

## Goals

- Let the Account panel show a login-style email form when no current preview exists.
- Preserve the first-user copy and save behavior when the user has a ready current preview.
- Keep checkout preview-scoped: checkout still requires selected preview id, selected purchase option/SKU, and verified identity.
- Load saved MGE identity previews after verification and keep local fallback history working.
- Make return messaging feel like login/history, not only "save this current preview."
- Add focused source tests that lock the no-current-preview login path and the existing save-current-preview path.

## Non-Goals

- Do not build a password account system.
- Do not add UCP or agentic-commerce concepts.
- Do not use generated preview images as input for other sizes.
- Do not expose MGE identity, API, Stripe, Resend, or Cloudflare secrets.
- Do not require live payment, live MGE submit, or deploy work for this UX task.

## Constraints

- MGE remains the source of truth for identity preview history.
- MGE production now supports previewless returning-account magic-link login. Dottingo must omit `preview_id` in that mode, not send an empty value.
- Magic-link tokens and identity session data stay server-side/browser-local only as already implemented; never log token values.

## Current State

- `components/account/account-panel.tsx:291` defines `hasCurrentDesign` as a ready selected preview.
- `components/account/account-panel.tsx:292` gates `showEmailForm` behind `hasCurrentDesign`, so the email form cannot open on an empty account panel.
- `components/account/account-panel.tsx:301` returns early in `handleSendMagicLink` if there is no `previewId`, which blocks login-like usage.
- `components/account/account-panel.tsx:421` renders the "Current preview" block even when the account intent is history/login.
- `components/account/account-panel.tsx:423` currently says "Create a design first, then save it to your email." when no ready preview exists.
- `components/account/account-panel.tsx:451` labels the email form "Save your design and continue later.", which is first-user copy rather than returning-user login copy.
- `components/account/account-panel.tsx:593` empty history copy says "Verify a design by email and it will appear here on this device.", again assuming a current design path.
- `lib/identity/browser.ts` exposes `requestDesignMagicLink(email, previewId, sizeId)` and now omits `preview_id` for returning-account login.
- `lib/identity/edge.ts` validates email and allows missing `preview_id` for returning-account login.
- `lib/identity/edge.ts` sends to MGE `/api/internal/v1/identity/magic-link/request/` with `preview_id` only when a current preview exists.
- `lib/identity/edge.ts:119` already supports loading preview history from `/api/internal/v1/identity/previews/` once a verified MGE identity token exists.
- `components/single-screen-preview/single-screen-preview-shell.tsx:63` consumes magic-link returns on the main page and stores verified identity.
- `components/single-screen-preview/single-screen-preview-shell.tsx:123` hydrates the source image when a verified saved preview matches the current selected preview.
- `lib/account/preview-registry.ts:91` provides local per-email saved-preview fallback, but it cannot discover a returning user's MGE history without a verified identity.
- `tests/account-panel-source.test.ts:21` currently locks the first-user account MVP copy and magic-link call shape.
- `tests/magic-link-return-source.test.ts` keeps direct preview restoration preview-scoped, while previewless account login returns with `identity_verified=1` only.

## Phase Index

1. [DONE - Phase 1 - Account Login Entrypoint](01_PHASE1_ACCOUNT_LOGIN_ENTRYPOINT.md)
2. [DONE - Phase 2 - Identity Contract Confirmation](02_PHASE2_IDENTITY_CONTRACT_CONFIRMATION.md)
3. [DONE - Phase 3 - History Rendering And Tests](03_PHASE3_HISTORY_RENDERING_AND_TESTS.md)
4. [DONE - Phase 4 - Source Project Variants](04_PHASE4_SOURCE_PROJECT_VARIANTS.md)

## Dependencies

- Current active checkout work may have unrelated local edits in Stripe files; do not touch or stage them for this task.
- MGE behavior must be confirmed before changing BFF request semantics. Prefer mocked/unit-level confirmation first; use live MGE only if the phase explicitly calls for it and Matej approves.
- Existing source tests are intentionally string-based; keep additions focused unless a more durable component test harness is introduced.

## Rollout Plan

- Implement behind the existing Account panel with no new route unless MGE requires a separate previewless endpoint.
- Keep the first-user "save current preview" path visible only when there is a ready current preview.
- For no-current-preview users, show a login/history email flow and then render verified preview history once identity is verified.
- If contract confirmation shows previewless login is unsupported, implement the best supported variant: login only from an existing saved preview anchor plus clear copy for empty devices.

## Validation Strategy

Start with the account-focused source tests:

```powershell
node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts
```

Then run all local tests if the BFF/browser identity contract changes:

```powershell
node --test tests/*.test.ts
npm run worker:typecheck
```

Run `npm run build` if component structure, imports, or worker types change broadly.

## Deploy And Smoke Strategy

No deploy is required for the planning task. Implementation should be locally verified first. If the final implementation changes Cloudflare Pages Functions for identity login semantics, deployment and a sandbox magic-link smoke must be a later explicit phase before sharing a production URL.

## Business Summary

Returning customers can now log in by email from Account before creating a new image, then load their saved MGE design history. First-time users still keep the save-current-preview flow when they have a ready design.

## Next Action

Deploy/smoke-test the source-project variant flow on production: create a 40x50 preview, save it to a verified account, reopen it from Account, request a missing size such as 40x60, and confirm the same saved project gains the second size badge.
