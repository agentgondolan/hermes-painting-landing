# Dottingo MG Implement

Implement exactly one phase or subphase from an existing Dottingo `.github/tasks` ledger and stop.

Use when the user asks for `mg_implement`, `/mg_implement`, to execute a phase, continue a task, update `TASK.md`/`LOG.md`/phase status, validate the change, or complete one planned implementation phase.

## Workflow

1. Find the task under `.github/tasks/_active/` first, then other task folders. If the user gives a task or phase number, use it. Otherwise choose the first required phase/subphase whose status is not done.
2. Read `TASK.md`, `LOG.md`, `DECISIONS.md`, and the target phase file thoroughly. If the task still uses legacy `PLAN.md`, read it and either follow it or propose ledger conversion if the request is not urgent.
3. Track sub-tasks with a todo list while working.
4. For each sub-task, read current target files, apply the scoped change, run listed commands when appropriate, and validate with the phase's steps plus focused checks needed by the change.
5. If implementation reveals new work, do not silently expand scope. Add a subphase file when the work is needed but distinct, classify it as required/follow-up/optional/blocked, update `TASK.md`, and append `LOG.md`.
6. Update statuses:
   - Mark the phase file `DONE`, `BLOCKED`, `SKIPPED`, or leave `IN PROGRESS` with a clear reason.
   - Update the phase row/status in `TASK.md`.
   - Update `TASK.md` next action.
   - Append `LOG.md` with files changed, validation run, result, blockers, and next action.
   - Add to `DECISIONS.md` when a non-obvious design or operational decision was made.
   - Add to `TROUBLESHOOTING.md` when a failure mode or repair path was discovered.
7. If this was the final required phase, add a short `Business Summary` to `TASK.md`, but do not deploy or release production unless the user explicitly approves that phase.
8. Report what changed, what was validated, and what the user should manually verify.
9. End every successful phase implementation with a short `Next Step Business Impact` summary:
   - next phase/subphase name from `TASK.md`
   - business outcome the next step unlocks or protects
   - expected product/code changes
   - direction or risk the user should review before approving the next implementation phase

## Dottingo Guardrails

- Implement exactly one phase.
- Keep MGE, Stripe, Cloudflare, Resend, and other secrets server-side only.
- Do not print, commit, screenshot, or ledger real secret values.
- Do not touch `C:\Users\matej\Projects\django-https` unless the user explicitly asks for Django changes. Read-only API research is allowed when the phase requires it.
- For webhook/payment/MGE submit work, preserve signed-webhook verification and idempotency.
- For Cloudflare deploy work, verify Wrangler identity and target project before deploying.
- Do not trigger live payment, MGE submit, email delivery, or custom-domain changes unless the phase explicitly requires it and the user has approved the risk.
- Keep untracked handover/reference assets out of commits unless the phase says to add them.

## Validation Ladder

Use the phase-specific validation first. Common commands:

```powershell
npm run agent:status
node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts
node --test tests/*.test.ts
npm run worker:typecheck
npm run build
```

For local browser validation:

```powershell
npm run dev
```

Open `http://127.0.0.1:3206`.

For Cloudflare Pages deploy validation:

```powershell
npx wrangler whoami
npm run build
npx wrangler pages deploy .next/prod --project-name hermes-painting-landing --branch main
```

Record exact deployment URL and smoke result in the ledger.

## Rules

- Follow the phase file unless code research shows it is wrong.
- Keep changes scoped.
- Every implementation session must end by updating the ledger unless blocked before any repo context was found.
- Ask before moving to the next phase.
- Do not add fallback logic unless the user explicitly requests it.
- Do not fabricate business data, test responses, prices, or API behavior.
