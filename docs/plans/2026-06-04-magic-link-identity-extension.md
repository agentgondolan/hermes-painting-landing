# Magic Link Identity Extension Plan

**Date:** 2026-06-04

**Goal:** Make the verified email/magic-link identity useful throughout the Dottingo flow, not just as a one-time checkout gate.

---

## What we have accomplished

### 1. Real email verification works

The live magic-link flow now verifies an email address and shows the success state:

- Brand: `Dottingo`
- Heading: `Email verified`
- Message: `Verified {email}. Your design is saved to this email.`
- CTA: `Return to design`

The screenshot confirms the intended user-facing result: the user can verify an email and return to the design flow.

### 2. Browser-side identity persistence exists

The app stores a verified identity in browser storage under:

- `dottingo_verified_identity_v1`

Stored identity shape:

- `email`
- `previewId`
- `identityToken`
- `expiresAt`

This means the app can remember that a specific email owns a specific generated design for the duration of the session token.

### 3. Identity is preview-scoped

The current helper `readVerifiedIdentity(previewId)` rejects stored identity when the preview ID does not match.

That is good: a user cannot verify one design and automatically claim another unrelated design.

### 4. Server-side verification is in place

The `/api/identity/verify` route delegates to the edge identity library.

Verification order:

1. Try MGEeveryday magic-link verification.
2. Fall back to the local legacy magic-token verifier when needed.
3. Return an app identity token scoped to email + preview.

### 5. Magic-link request endpoint exists

The `/api/identity/request-magic-link` route requests a magic link through MGEeveryday.

It normalizes delivery status and returns a safe response to the browser without exposing fallback links or secrets.

### 6. Checkout already requires verified identity

Stripe checkout session creation now verifies the submitted `identity_token` before creating dynamic checkout.

Important protection already implemented:

- `preview_id` is required.
- `preview_option_id` is required.
- `sku` is required.
- `identity_token` is verified server-side.
- The token preview ID must match the checkout preview ID.
- Verified email is passed to Stripe as `customer_email` and metadata.

### 7. Stripe webhook sends continuation magic link

When Stripe reports `checkout.session.completed`, the webhook can send a continuation magic link using the verified/customer email and preview ID.

This is the first step toward letting the customer return to their design/order state after payment.

### 8. Analytics hooks exist around identity

The purchase panel already captures events for:

- `magic_link_verified`
- `magic_link_verification_failed`

That gives us a base for measuring email verification friction.

### 9. Magic-link request UI now has a clear sent-but-not-verified state

The purchase panel flow is now:

1. User enters email and clicks `Send link`.
2. While the request is in flight, the button is disabled and says `Sending`.
3. After the email handoff is confirmed, the input is hidden.
4. The disabled terminal button says `Email sent to {email}`.
5. The helper message says `Please check your emails to verify.`
6. A quiet `Send again` action lets the user reopen/edit the email and request another link.

This avoids implying that identity is verified before the user clicks the email link.

### 10. Regression coverage and production build pass

Verified on 2026-06-04:

- `node --test tests/purchase-panel-source.test.ts tests/identity-edge.test.ts` — 19/19 passing.
- `npm run build` — Next production build passing.

---

## Working core flow to preserve

This is the current verified identity contract that now works in production and should be protected as the app grows:

1. A generated preview has a stable `preview_id`.
2. The purchase panel asks for email only when the current preview has no matching verified identity.
3. `request-magic-link` sends a branded magic link for that email + preview.
4. `/auth/magic` verifies the token server-side, stores browser identity, and returns the user to the design with `preview_id`.
5. The design page restores the canvas from `preview_id`:
   - first from matching browser storage when available
   - otherwise by fetching/polling the preview from the preview client
6. The purchase panel shows the verified state as `Saved to {email}`.
7. Checkout is allowed only when the identity token is valid and scoped to the same `preview_id`.
8. Stripe checkout receives the verified email and preview metadata, so later success/order/continuation flows can stay attached to the same identity.

Important invariant: verified identity is **email + preview scoped**, not a global account login. Reuse the identity across the app only when the `preview_id` matches, unless we explicitly build a server-side recovery/account layer.

---

## Current gaps

### 1. Identity is not yet visible after Stripe checkout

After the email is verified, the app knows the identity, but the rest of the product does not fully behave like “this design belongs to this email.”

The user should see this relationship throughout the flow.

### 2. The standalone success page returns to `/`

The CTA currently points to `/`.

This is simple, but it can lose context unless the app has enough persisted preview state in the same browser.

Better target behavior:

- Return directly to the exact preview/design when possible.
- If the preview cannot be restored, show a recovery state using the verified email.

### 3. Identity is localStorage-only on the browser

There is no durable server-side customer/design lookup in this app yet.

So if the user opens the magic link on another device/browser, identity verification can succeed, but the design recovery experience depends on what the MGE preview ID and app state can reconstruct.

### 4. No “my designs / my order” surface yet

The verified email should become the anchor for:

- recovering saved designs
- showing current draft/order status
- continuing checkout
- post-payment confirmation
- support/admin lookup
- account/settings access
- preview visibility/deletion controls

Right now that product surface does not exist.

### 4a. Account button MVP exists, but the account backend does not

The user has already given an email, so the product now exposes a lightweight account surface without asking for a password.

Implemented behavior:

- Top-right `Account` button in the header.
- Account panel/drawer opens from the button.
- If verified for the current preview, it shows the saved email and `Change email`.
- If not verified, it can request the same magic-link email verification for the current preview.
- It keeps the account passwordless: email + magic link is the identity layer.

Still missing:

- Real saved preview list from MGE/app backend.
- `Open preview`, `Continue checkout`, `Hide`, and `Delete` controls.
- Order history connected to verified email.

### 5. Analytics identity is not fully connected

PostHog can capture magic-link events, but the verified email identity should also be connected carefully to user identity/person properties, without leaking unnecessary PII into public/client events.

### 6. Brand identity is still partly hard-coded

The identity flow uses Dottingo copy and brand behavior, but parts of the app still have hard-coded brand values.

Magic-link identity should use the same brand config layer planned for Dottingo/Makeyourcraft.

---

## Proposed changes

## Phase A — Make verified identity visible and useful in the purchase panel

**Objective:** After verification, the user should always understand that the design is saved to their email.

### Changes

- Add a persistent verified-email badge in the purchase panel.
- Show copy like: `Saved to matej@example.com`.
- Add a small `Change email` action.
- When identity exists for the current preview, skip repeated email prompts.
- If identity is expired or mismatched, show a clear re-verification state.

### Files likely involved

- `components/single-screen-preview/purchase-panel.tsx`
- `lib/identity/browser.ts`

### Verification

- Verify email once.
- Return to the design.
- Confirm email stays visible in the panel.
- Confirm checkout can start without re-entering email.
- Confirm changing email clears/replaces identity safely.

---

## Phase B — Return magic links to the exact design context

**Objective:** Magic-link success should return the user to their design, not just the homepage.

### Changes

- Include `preview_id` in the return/continue path.
- Add a safe continue URL builder.
- Make `/auth/magic` send the user back to the design URL with enough context to restore the selected preview.
- Preserve token removal from the URL after verification.

### Candidate URL shapes

Preferred:

- `/?preview_id={previewId}`

Later, if we add a dedicated page:

- `/design/{previewId}`

### Files likely involved

- `app/auth/magic/page.tsx`
- `lib/identity/browser.ts`
- `lib/identity/edge.ts`
- `components/single-screen-preview/use-preview-flow.ts`

### Verification

- Open magic link in the same browser.
- Open magic link in a clean browser.
- Confirm success page CTA returns to the intended preview.
- Confirm invalid/expired links do not redirect blindly.

---

## Phase C — Use verified identity in checkout and order continuation

**Objective:** Verified email becomes the customer identity for checkout, payment continuation, and later order lookup.

### Changes

- Keep passing verified email as Stripe `customer_email`.
- Ensure Stripe metadata includes:
  - `verified_email`
  - `preview_id`
  - `order_draft_id`
  - `brand_key`
- On checkout success page, read the Stripe session/order context and show: `Order for {verified_email}`.
- After payment, continuation magic link should deep-link back to the specific order/design.

### Files likely involved

- `lib/stripe/edge.ts`
- `app/checkout/success/page.tsx`
- `app/checkout/cancel/page.tsx`
- `functions/api/stripe/webhook.ts`

### Verification

- Verified email appears as Stripe customer email.
- Checkout metadata keeps preview/order identity.
- Success page shows the verified email/order context.
- Webhook continuation magic link points to the correct design/order context.

---

## Phase C2 — Add account button and email-based account panel

**Objective:** Turn the verified email into a lightweight account surface that users can access anywhere in the app.

### Product behavior

- Add a small account/email button in the top-right header.
- Before verification, button copy can be `Account` or `Save with email`.
- After verification, button copy can be the verified email or a compact avatar/initial.
- Clicking opens an account panel/drawer.

### Account panel sections

1. **Identity / settings**
   - Show verified email.
   - `Change email` starts a fresh magic-link verification.
   - Changing email should not silently transfer existing previews; each preview must be attached deliberately to the new verified email.

2. **Active previews**
   - List previews saved to this verified email.
   - Show thumbnail/status when available.
   - Actions:
     - `Open preview`
     - `Continue checkout`
     - `Hide from account`
     - `Delete preview`

3. **Order history**
   - List paid/completed orders for this verified email.
   - First version can show only orders we can reliably recover from Stripe/MGE metadata.
   - Each order should link back to the related design/order status when possible.

### Hide vs delete semantics

- **Hide** should only remove the preview from the customer-facing account list.
- **Delete** should be treated as destructive and require confirmation.
- If the supplier/backend cannot physically delete a preview yet, mark it deleted/hidden in our app layer and stop showing it.
- Deleting must not break already-paid orders; paid order records remain visible in order history.

### Data model needed

Browser storage alone is not enough. Add a small server-side account/preview registry keyed by verified email identity:

- `email_hash` or backend-owned customer identity ID
- `preview_id`
- `order_draft_id`
- `stripe_session_id` when checkout starts/completes
- `brand_key`
- `status`: `active`, `hidden`, `deleted`, `ordered`
- timestamps: created/updated/deleted

Avoid raw email in public/client analytics. Raw email can remain server-side only where needed for magic-link delivery and order communication.

### Files likely involved

- `components/single-screen-preview/layout-frame.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- new `components/account/account-button.tsx`
- new `components/account/account-panel.tsx`
- `lib/identity/browser.ts`
- new account API routes under `functions/api/account/*`
- preview creation/checkout/webhook routes that should register/update previews

### Verification

- Anonymous user sees account button and can request magic link.
- Verified user sees their email/account state.
- Current preview appears in active previews after email verification.
- Opening an active preview restores the canvas by `preview_id`.
- Hide removes a preview from the active list without deleting server records.
- Delete requires confirmation and removes the preview from future account lists.
- Paid orders remain visible even if the preview is hidden/deleted from active previews.

---

## Phase D — Add a lightweight “recover my design” path

**Objective:** If the user loses the page, email should be enough to recover the design/order path.

### Changes

- Add a `Recover design` entry point.
- User enters email.
- App sends a magic link.
- Magic link verifies email and opens latest/selected recoverable preview.

### Important note

This likely needs server-side persistence or supplier-side lookup. Browser localStorage alone is not enough for cross-device recovery.

### Possible first version

Use MGE preview/order references where available:

- preview ID
- draft ID
- Stripe session ID
- MGE order ID later

### Verification

- Generate design on browser A.
- Verify email.
- Open recovery link on browser B.
- Confirm app can show either the design, order status, or a clear “we found your design but need to regenerate preview” state.

---

## Phase E — Connect identity to analytics safely

**Objective:** Measure conversion by verified identity state without exposing sensitive data unnecessarily.

### Changes

- Add event properties:
  - `identity_verified: true/false`
  - `identity_source: magic_link`
  - `preview_id`
  - `brand_key`
- On verification, optionally identify the PostHog person using a hashed email or backend-controlled distinct ID.
- Avoid sending raw email to public analytics unless explicitly accepted as policy.

### Events to add/improve

- `magic_link_requested`
- `magic_link_accepted`
- `magic_link_verified`
- `identity_loaded_from_storage`
- `identity_expired`
- `checkout_blocked_identity_required`
- `checkout_started_verified_identity`
- `continuation_magic_link_sent`

### Files likely involved

- `components/single-screen-preview/purchase-panel.tsx`
- `components/analytics-provider.tsx`
- `lib/analytics/posthog.ts`
- `lib/stripe/edge.ts`

### Verification

- Events appear in PostHog with brand and preview context.
- No secrets/tokens are captured.
- No raw magic-link token appears in URL events.

---

## Phase F — Make identity brand-aware

**Objective:** Magic-link copy, sender, brand ID, domains, and analytics source should come from brand config.

### Changes

- Move hard-coded Dottingo identity values into brand config.
- Use brand config for:
  - email sender/from name
  - auth success page brand label
  - CTA copy
  - `brand_id`
  - continuation path/domain
  - analytics metadata

### Files likely involved

- `lib/brand/*`
- `lib/identity/edge.ts`
- `app/auth/magic/page.tsx`
- `lib/stripe/edge.ts`

### Verification

- Dottingo uses brand ID `64`.
- Makeyourcraft standby config does not accidentally use Dottingo identity settings.
- Production host cannot be spoofed by a client-selected brand.

---

## Recommended execution order

1. **Purchase-panel identity polish** — request/sending/sent/resend/change-email states. ✅ Done.
2. **Verified identity visibility** — badge, saved-to-email copy, change-email state after verification. ✅ Done.
3. **Deep return path** — magic link returns to the exact preview/design context. ✅ Done.
4. **Account button MVP** — visible account entry point, verified email state, change-email action. ✅ Done.
5. **Account preview registry** — active preview list with open/hide/delete controls.
6. **Checkout success identity** — success/cancel pages understand verified email + preview/order context.
7. **Order history** — paid orders connected to verified email/account panel.
8. **Analytics identity events** — measure verification and checkout friction.
9. **Recovery path** — magic-link based “recover my design”.
10. **Brand-aware identity config** — remove remaining Dottingo hard-coding.

---

## Next implementation slices

### Slice 1: Verified identity badge and re-use

- Show `Saved to {email}` once the magic link has been verified.
- Keep checkout enabled only when the verified identity matches the current preview.
- Keep `Change email` as the intentional escape hatch.
- Add events for loaded/expired/mismatched identity.

### Slice 2: Return to exact design after verification

- Preserve `preview_id` through the magic-link request.
- Make `/auth/magic` return to `/?preview_id={previewId}` when safe.
- If preview restoration fails, show a recovery/explanation state instead of dumping the user on `/`.

### Slice 3: Checkout and order continuation

- Show the verified email on checkout success/cancel pages.
- Keep `preview_id`, selected option, brand, and verified email in metadata.
- Make the post-payment continuation magic link deep-link to the same design/order context.

### Slice 4: Account button MVP

- Add an account/email button to the top-right header.
- Open an account panel/drawer.
- If no verified identity exists, use the panel to request a magic link.
- If verified, show email, current preview, and `Change email`.

### Slice 5: Active preview list controls

- Register each verified preview against the verified email identity.
- Show active previews in the account panel.
- Add `Open`, `Continue checkout`, `Hide`, and `Delete` actions.
- Implement hide/delete safely before exposing order history.

---

## First implementation slice completed

The first UI slice now makes the pre-verification flow coherent:

- `Send link`
- disabled `Sending`
- disabled `Email sent to {email}`
- `Please check your emails to verify.`
- `Send again` reopens the email field intentionally.

## Second implementation slice completed

The verified-email identity is now more useful after the user clicks the email link:

- `/auth/magic` verifies the token, stores the browser identity session, then redirects straight back to the design surface.
- The redirect carries `preview_id` plus a short `identity_verified=1` notice flag.
- The main preview surface consumes that notice, removes the notice flag from the URL, and shows the verified banner.
- If the magic token lands directly on `/`, the main preview surface still consumes it, stores identity, removes the token, and shows the same banner.
- The purchase panel reads the verified identity for the current preview and shows `Saved to {email}`.
- Checkout stays blocked until the verified identity matches the current preview.

This gives immediate product value without requiring a new database or account area.

## Third implementation slice completed

The verified return URL now restores the actual canvas preview from the server-side `preview_id`:

- Direct `/?preview_id={previewId}` URLs are read on the design page.
- If browser storage already has a matching preview, local restore is still used.
- If storage is missing or belongs to another preview, the app fetches the preview by ID through the preview client.
- Terminal preview responses are restored onto the canvas with the selected orderable option.
- Non-terminal preview responses are polled until ready before restore.
- Restore success/failure analytics include `restore_source: preview_id_url`.

This fixes the cross-tab/cross-browser weak spot after email verification: the magic link can now return with enough context to rebuild the design view instead of relying only on localStorage.

Verification on 2026-06-04:

- `node --test tests/magic-link-return-source.test.ts` — 4/4 passing.
- `node --test tests/*.test.ts` — 42/42 passing.
- `npm run build` — Next production build passing.
- Deployed to Cloudflare Pages production deployment `aacde719` after Matej confirmed the flow works.
- Smoke-tested `https://dottingo.sg/`, `/auth/magic`, and the deployment URL: all returned HTTP 200.
- Browser smoke test on `https://dottingo.sg/`: page loaded with no console or JS errors.
- User-tested production magic-link verification: confirmed working.

---

## Fourth implementation slice completed

The app now has the first account surface built on top of the magic-link identity:

- Header accepts a right-side action slot.
- The design surface renders a top-right `Account` button.
- Clicking it opens an account panel/drawer.
- The panel shows the current preview ID when one exists.
- If the current preview is already verified, it shows `Saved to {email}` and a `Change email` action.
- If the current preview is not verified, the panel can request a magic link for that preview.
- Account magic-link request analytics are captured as `account_magic_link_requested` / `account_magic_link_failed`.
- The panel now keeps a device-local list of verified previews for the verified email.
- Saved previews expose `Open preview`, `Continue checkout`, and `Hide` actions.

Verification on 2026-06-05:

- `node --test tests/*.test.ts` — 49/49 passing.
- `npx tsc --noEmit` — passing.
- `npm run worker:typecheck` — passing.
- `npm run build` — Next production build passing.
- Static local smoke from `.next/prod` on port `3206`: homepage and `/auth/magic` returned HTTP 200.
- Browser smoke on `https://hermes-painting-landing.pages.dev/?v=identity-smoke-20260605`: page loads, title is `Custom Dot Art from Your Photo | Dottingo`, top-right `Account` button is present.
- Browser smoke on `https://a149fc74.hermes-painting-landing.pages.dev/auth/magic?token=fake-token&preview_id=test-preview&v=identity-smoke-20260605`: invalid token correctly shows `Link problem` and `Return to design`.

Deployment on 2026-06-05:

- Cloudflare Pages deployment URL: `https://a149fc74.hermes-painting-landing.pages.dev`
- Stable testing URL verified: `https://hermes-painting-landing.pages.dev`

---

## Open decisions

1. Should raw email be allowed in PostHog, or should we use hashed email only?
2. Should the account button label be `Account`, `My designs`, or the verified email after login?
3. Should hide/delete be reversible at first, or should delete be permanent once backend deletion exists?
4. Should the first recovery surface be `Recover design`, `My designs`, or `Order status`?
5. Should the canonical design URL be `/?preview_id=...` for now, or do we create `/design/{previewId}`?
6. Do we want verified identity to survive for 30 days as currently implemented, or shorten/extend it?
7. Should changing email preserve the existing design, or force a fresh verification before any checkout action?
