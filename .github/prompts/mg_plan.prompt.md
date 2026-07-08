# Dottingo MG Plan

Create a persistent ledger-style implementation task for this Dottingo repository.

Use when the user asks for `mg_plan`, `/mg_plan`, to plan a new feature, integration, incident repair, deploy change, or checkout/MGE/Stripe/Cloudflare work.

## Workflow

1. Read the request and inspect the current codebase first. Search relevant app routes, components, Pages Functions, Cloudflare Worker code, tests, scripts, docs, and deployment config.
2. Use today's date for a new active task directory:
   `.github/tasks/_active/{YYYYMMDD}_{snake_case_name}/`
   If `_active` does not exist, create it.
3. Create the ledger files:
   - `TASK.md` - current source of truth
   - `LOG.md` - append-only implementation history
   - `DECISIONS.md` - append-only decisions and rationale
   - `TROUBLESHOOTING.md` - optional, create when known failure modes already exist
4. Create initial phase files when the work is clear enough:
   `01_PHASE1_{UPPER_SNAKE_NAME}.md`, `02_PHASE2_{UPPER_SNAKE_NAME}.md`, etc.
5. In `TASK.md`, include status, dates, proposed branch name, overview, goals, non-goals, constraints, current state with real code references, phase index, dependencies, rollout plan, validation strategy, deploy/smoke strategy, and next action.
6. Initialize `LOG.md` with a creation entry: date, author, summary, researched files, commands run, and next action.
7. Stop after writing the ledger and ask whether the plan looks good before expanding or implementing.

## Status Vocabulary

Use only these statuses:

- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `DONE`
- `SKIPPED`
- `SUPERSEDED`

Every phase file should start with:

```markdown
Status: NOT STARTED
Required: yes
Created: YYYY-MM-DD
Updated: YYYY-MM-DD
Depends on: none
Supersedes: none
```

## Dottingo Constraints

- Keep MGE, Stripe, Cloudflare, Resend, and other secrets server-side only. Never write real secret values into the ledger.
- Keep `agentgondolan` GitHub/Cloudflare work separate from Django/Matej account work.
- Treat MGE as source of truth for previews, purchase options, order drafts, validation, submission, and order status.
- For paid checkout work, preserve the target flow:
  `preview -> purchase option -> order draft -> payment gate -> webhook -> MGE submit exactly once -> confirmation`.
- Generated preview/mockup images are display-only. Do not use them as input for another size.
- Cloudflare deploys and live payment/order-submit smokes must be explicit phases; do not bury production-impacting work in a broad implementation phase.
- If Django/MGE API behavior must be confirmed from `C:\Users\matej\Projects\django-https`, mark that as read-only research unless Matej explicitly approves Django edits.

## Validation Ladder

Pick the smallest validation that proves the phase, then climb when the surface is broader:

```powershell
npm run agent:status
node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

For live/deploy work, add:

```powershell
npx wrangler whoami
npx wrangler pages deployment list --project-name hermes-painting-landing
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```

Only run live checkout/payment/MGE submit smokes when the phase explicitly requires it and the user has approved the risk.

## Rules

- Always write the ledger to files.
- Research actual code before planning.
- Keep phases small enough to complete in roughly one focused session.
- Reference real paths and line numbers.
- Prefer adding subphases later over bloating an existing phase.
- Do not invent business data, prices, API responses, endpoints, or fallback behavior.
- Include exact commands and expected evidence for validation.
- Do not require Django Docker commands unless the phase explicitly depends on the Django API repo.
