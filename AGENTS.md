# Agent Runbook — Hermes Painting Landing

This repo is the Makeyourcraft / Dottingo paint-by-number storefront prototype.

## Start here every session

1. Read this file.
2. Read `docs/ACTIVE_WORK.md` for the current objective, blocked items, and verification commands.
3. Run `npm run agent:status` before making changes.
4. Inspect `git status --short`; the tree often contains active work from another session. Do not reset, format broadly, or include unrelated files.
5. Work on the smallest deliverable that moves the checkout flow forward.

## Current product priority

Finish the paid MGE flow:

`preview -> purchase option -> order draft -> payment gate -> webhook -> MGE submit exactly once -> confirmation`

Do not block this on future UCP / agentic-commerce ideas. Keep MGE as the source of truth for preview, purchase options, order draft, validation, submission, and order status.

## Architecture rules

- Keep MGE API tokens server-side only. Never expose them in browser code, logs, screenshots, analytics, or commits.
- Use `/api/mge/*` / Cloudflare Pages Functions as the browser-facing BFF.
- Do not use generated preview images as input for another size. Use the original/source image.
- Checkout is preview-scoped: selected preview id + selected purchase option/SKU + verified identity.
- If MGE says purchase options are unavailable, allow viewing/restoring the preview but block checkout with the API reason.

## Useful commands

- `npm run agent:status` — concise repo status, recent commits, active work ledger.
- `npm run agent:verify` — read-only verification for source tests, worker typecheck, and production build.
- `node --test tests/*.test.ts` — all current Node tests.
- `npm run worker:typecheck` — Cloudflare worker/BFF TypeScript check.
- `npm run build` — Next production build.

## Ledger workflow

This repo uses a Dottingo-specific copy of Matej's mg ledger workflow:

- `.github/prompts/mg_plan.prompt.md`
- `.github/prompts/mg_breakdown.prompt.md`
- `.github/prompts/mg_implement.prompt.md`
- `.github/tasks/_active/`

Use these local prompts for `mg_plan`, `mg_breakdown`, and `mg_implement` style work. They intentionally replace Django-specific assumptions with Next.js, Cloudflare Pages/Functions, Worker, Stripe, and MGE validation steps. Do not use Django migration, Celery, `/releases/`, or `bump_version` rules in this repo unless a task explicitly crosses into `C:\Users\matej\Projects\django-https`.

## Delivery rule

Every task should end with a verified artifact or a clear blocker. If verification fails, report the failing command and the next concrete fix. Do not answer with only a plan when code or checks can be run.
