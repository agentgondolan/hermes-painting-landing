# Dottingo MG Breakdown

Break or extend an existing Dottingo `.github/tasks` ledger into detailed phase and subphase files.

Use when the user asks for `mg_breakdown`, `/mg_breakdown`, to expand `TASK.md`, create phase files, add subphases discovered during implementation, or turn a task ledger into production-ready implementation steps with validation.

## Workflow

1. Find the relevant task under `.github/tasks/_active/` first, then other task folders. If ambiguous, ask a concise clarification.
2. Read `TASK.md`, `LOG.md`, `DECISIONS.md`, and existing phase files. If the task still uses legacy `PLAN.md`, read it and propose conversion to ledger style before large changes.
3. Research the codebase for each phase or subphase so file paths, line numbers, commands, and implementation details are real.
4. Create numbered phase files named like `{NN}_PHASE{N}_{UPPER_SNAKE_NAME}.md`. For discovered work inside an existing phase, create subphases like `02a_new_detail.md`, `02b_edge_case.md`.
5. Each phase or subphase file must include status, priority, effort estimate, dependencies, required/follow-up classification, files touched, sub-tasks, real file references, current state, concrete changes, deploy/secret impact, and validation steps.
6. Update `TASK.md`: phase index table, overall status, updated date, and next action.
7. Append to `LOG.md` with what was broken down, added, or changed.

## Subphase Classification

When implementation reveals new work, classify it as one of:

- `Required before DONE`
- `Follow-up`
- `Optional`
- `Blocked`

## Dottingo-Specific Phase Guidance

- Split production-impacting work into explicit phases:
  - code change
  - local/source validation
  - Cloudflare deploy
  - live smoke
  - payment/order-submit smoke
- Keep secret setup as operational steps that name secret keys only, never values.
- For Stripe webhook or MGE submit changes, include duplicate webhook/idempotency validation.
- For Pages Functions or Worker changes, include the relevant Wrangler command and route-level smoke.
- For frontend changes, include browser validation at desktop and mobile viewport sizes when layout or interaction changes.
- If a task depends on Django/MGE API behavior, create a read-only research phase unless Matej explicitly asks to change Django.

## Validation Ladder

Use the fastest command that proves the phase, then climb as needed:

```powershell
npm run agent:status
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

For Cloudflare/Pages work:

```powershell
npx wrangler whoami
npx wrangler pages deployment list --project-name hermes-painting-landing
```

For Worker work:

```powershell
npm run worker:typecheck
npm run worker:deploy
```

## Rules

- Keep phases independently verifiable.
- Split phases that are too large.
- Prefer specific validation over general "test it" notes.
- Do not include fabricated business values or silent fallback behavior.
- Do not rewrite completed phase history; append logs and mark superseded when needed.
- Do not deploy or trigger real payment/order-submit smokes unless the phase explicitly says so and the user has approved it.
