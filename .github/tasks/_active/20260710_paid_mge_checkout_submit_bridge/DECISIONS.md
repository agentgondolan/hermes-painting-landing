# Decisions

## 2026-07-10 - Use MGE order drafts for saved-preview checkout

MGE confirmed saved-preview checkout/cart UX should use `POST /api/v1/order-drafts/`, then validate, then submit. Dottingo will not use direct `POST /api/v1/orders/` for this flow unless the product scope changes.

## 2026-07-10 - Numeric draft id required before payment

MGE confirmed successful draft creation always returns a numeric `id`. Dottingo treats missing, synthetic, or non-numeric ids as integration errors and blocks Stripe payment.

## 2026-07-10 - Draft validation is the next payment gate

Stripe payment should only start after MGE validates the draft and marks it submit-ready/READY.

## 2026-07-10 - Durable submit state belongs in Dottingo

Dottingo owns Stripe webhook receipt, durable submit state, retry state, and customer-facing status. MGE owns validation, order creation, and final order status.

