# Clear Recommendations Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a clear, conversion-focused recommendations layer that tells customers exactly what kit size, style, and production option to buy after preview generation.

**Architecture:** Keep recommendations deterministic and explainable first. Use the existing preview result, selected size, purchase options, and checkout state to compute one primary recommendation plus 1-2 alternatives. Google/Apple auth should not block launch; document it as a future account/retention improvement.

**Tech Stack:** Next.js 15, React 19, TypeScript, Cloudflare Pages/Functions, MGE BFF, Stripe Checkout, PostHog.

---

## Product Decisions

1. Do not add Google/Apple auth in this iteration.
2. Prioritize a low-friction anonymous checkout flow.
3. Make one recommendation visually dominant: “Recommended for your photo”.
4. Use simple, trust-building explanations rather than opaque scoring.
5. Track every recommendation impression, selection, and checkout click in PostHog.

---

## Future Improvements: Google / Apple Auth

Add social auth later when there is a clear reason to create accounts:

- Save generated previews across devices.
- Let customers reopen unfinished kits.
- Support order history and reorders.
- Build email/SMS recovery for abandoned previews.
- Enable loyalty/referral flows.

Do not add it before checkout is working and measured. Auth before checkout adds friction and will likely reduce conversion unless it unlocks a concrete user benefit.

---

## Implementation Tasks

### Task 1: Define recommendation model

**Objective:** Create a typed recommendation shape that can be used by UI, analytics, and checkout.

**Files:**
- Create: `components/single-screen-preview/recommendation-types.ts`
- Create: `components/single-screen-preview/recommendation-engine.ts`

**Recommended fields:**

```ts
export type PurchaseRecommendation = {
  id: string
  purchaseOptionId: string
  label: string
  badge: 'recommended' | 'best-value' | 'fastest' | 'premium'
  reason: string
  confidence: 'high' | 'medium' | 'low'
  rank: number
}
```

**Verification:**
- TypeScript compiles.
- Engine returns stable ranking for the same preview/options input.

### Task 2: Implement deterministic recommendation rules

**Objective:** Pick the best option without ML or backend dependency.

**Initial rule order:**
1. Prefer purchase options matching the currently selected preview option.
2. Prefer the customer-selected size if available.
3. Prefer standard production unless express is clearly selected.
4. Highlight best value when price delta is small for a larger kit.
5. Fall back to first valid option with a clear explanation.

**Files:**
- Modify: `components/single-screen-preview/recommendation-engine.ts`
- Test: `tests/recommendation-engine.test.ts`

**Verification:**
- Unit tests cover empty options, one option, multiple sizes, express/standard variants, and fallback behavior.

### Task 3: Add recommendation UI inside purchase panel

**Objective:** Make the recommended option obvious and easy to select.

**Files:**
- Modify: `components/single-screen-preview/purchase-panel.tsx`
- Optional create: `components/single-screen-preview/recommendation-card.tsx`

**UI requirements:**
- Show one primary “Recommended for your photo” card.
- Explain why in one short sentence.
- Keep alternatives secondary and compact.
- Do not add extra steps before checkout.

**Verification:**
- Recommendation appears after purchase options load.
- Clicking an alternative updates selected purchase option.
- Existing checkout button still works.

### Task 4: Add analytics events

**Objective:** Measure whether recommendations improve selection and checkout conversion.

**Files:**
- Modify: `components/single-screen-preview/purchase-panel.tsx`
- Update docs: `docs/analytics-posthog.md`

**Events:**
- `recommendation_shown`
- `recommendation_selected`
- `recommendation_checkout_clicked`

**Properties:**
- `preview_id`
- `selected_size`
- `recommended_purchase_option_id`
- `selected_purchase_option_id`
- `recommendation_badge`
- `recommendation_rank`
- `recommendation_confidence`

**Verification:**
- Events fire once per recommendation load/selection/checkout click.
- No duplicate event spam on rerender.

### Task 5: Copy pass for clarity

**Objective:** Make recommendations feel like expert guidance, not upsell pressure.

**Recommended copy examples:**
- “Recommended for your photo”
- “Best balance of detail, price, and painting time.”
- “Choose this if you want the clearest result.”
- “Faster production, same final kit.”

**Files:**
- Modify: `components/single-screen-preview/purchase-panel.tsx`
- Later: move copy into brand config when multibrand config is active.

**Verification:**
- Copy is short on mobile.
- No paragraph text in the purchase panel.

### Task 6: End-to-end smoke test

**Objective:** Verify the recommendation flow on the live project URL after deployment.

**Commands:**
- `npm run lint`
- `npm run build`

**Manual checks:**
- Upload image.
- Generate preview.
- Confirm recommended option appears.
- Change size/style and confirm recommendation updates.
- Click checkout on non-Dottingo environments where checkout is enabled.
- Confirm PostHog events arrive.

---

## Recommended Build Order

1. Recommendation types and pure engine.
2. Unit tests for recommendation ranking.
3. Purchase panel UI integration.
4. Analytics events.
5. Copy polish.
6. Deploy and smoke-test live URL.

## Not In This Iteration

- Google/Apple auth.
- Customer accounts.
- Saved galleries.
- Personalized ML recommendations.
- Backend recommendation API.
- Complex A/B testing before baseline events exist.
