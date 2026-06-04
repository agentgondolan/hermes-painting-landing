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

## Current gaps

### 1. Identity is mostly invisible after verification

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

Right now that product surface does not exist.

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

1. **Purchase-panel identity polish** — request/sending/sent/resend/change-email states. ✅ Done in current slice.
2. **Verified identity visibility** — badge, saved-to-email copy, change-email state after verification.
3. **Deep return path** — magic link returns to the exact preview/design context.
4. **Checkout success identity** — success/cancel pages understand verified email + preview/order context.
5. **Analytics identity events** — measure verification and checkout friction.
6. **Recovery path** — magic-link based “recover my design”.
7. **Brand-aware identity config** — remove remaining Dottingo hard-coding.

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

---

## First implementation slice completed

The first UI slice now makes the pre-verification flow coherent:

- `Send link`
- disabled `Sending`
- disabled `Email sent to {email}`
- `Please check your emails to verify.`
- quiet `Send again` that reopens email editing

This gives immediate product value without requiring a new database or account area.

---

## Open decisions

1. Should raw email be allowed in PostHog, or should we use hashed email only?
2. Should the first recovery surface be `Recover design`, `My designs`, or `Order status`?
3. Should the canonical design URL be `/?preview_id=...` for now, or do we create `/design/{previewId}`?
4. Do we want verified identity to survive for 30 days as currently implemented, or shorten/extend it?
5. Should changing email preserve the existing design, or force a fresh verification before any checkout action?
