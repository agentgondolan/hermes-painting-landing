# Log

## 2026-06-25 - Created

Author: Codex

Summary:
- Created an active mg ledger for making Account behave like login/history when the user has no current image but may have saved MGE previews.
- Researched the Account panel, browser identity helper, Cloudflare identity BFF, shell magic-link return handling, local preview registry, and current source tests.

Commands run:
- `npm run agent:status`
- `git status --short`
- `rg -n "account|magic|email|history|preview|identity|restore|login|sign" components lib app functions tests docs .github -g '!node_modules'`

Researched files:
- `AGENTS.md`
- `docs/ACTIVE_WORK.md`
- `.github/prompts/mg_plan.prompt.md`
- `components/account/account-panel.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `lib/account/preview-registry.ts`
- `lib/identity/browser.ts`
- `lib/identity/edge.ts`
- `functions/api/identity/request-magic-link.ts`
- `tests/account-panel-source.test.ts`
- `tests/magic-link-return-source.test.ts`

Next action:
- Implement Phase 1 after plan approval.

## 2026-06-25 - Phase 1 implemented

Author: Codex

Summary:
- Split Account panel email state into explicit save/login intent.
- Added a returning-user "Log in to saved designs" entrypoint when no ready current preview exists.
- Kept first-user save copy and save-current-preview behavior in place.
- Left previewless magic-link sending blocked with clear status copy until the Phase 2 MGE contract confirmation.

Files changed:
- `components/account/account-panel.tsx`
- `tests/account-panel-source.test.ts`
- `.github/tasks/_active/20260625_account_login_history_flow/TASK.md`
- `.github/tasks/_active/20260625_account_login_history_flow/01_PHASE1_ACCOUNT_LOGIN_ENTRYPOINT.md`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`
- `.github/tasks/_active/20260625_account_login_history_flow/DECISIONS.md`

Validation run:
- `node --test tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/purchase-panel-source.test.ts` - passed, 14 tests.
- `npm run build` - passed.
- Cloudflare Pages deploy - succeeded; preview URL `https://02ddaecb.hermes-painting-landing.pages.dev`.
- Production smoke `https://dottingo.sg/` - returned HTTP 200.
- Production unauthenticated `DELETE /api/identity/projects/test_source` - returned HTTP 401 with `X-MGE-Identity-Token is required`.
- Production BFF safe delete probe using a non-existent source group and testing identity token - returned HTTP 404 with `source_project_not_found`, confirming the deployed BFF now sends the required `brand_id` body to MGE.

Blockers:
- None for Phase 1.

Next action:
- Implement Phase 2: confirm whether MGE supports previewless account/history magic links or requires a preview anchor.

## 2026-06-25 - Phase 2 implemented

Author: Codex

Summary:
- Confirmed from current BFF code and tests that magic-link requests are preview-scoped.
- Added an edge test proving previewless account login is rejected with `preview_id is required` before any upstream MGE call.
- Kept the BFF strict and preserved the Phase 1 Account panel blocked-send fallback.

Files changed:
- `tests/identity-edge.test.ts`
- `.github/tasks/_active/20260625_account_login_history_flow/TASK.md`
- `.github/tasks/_active/20260625_account_login_history_flow/02_PHASE2_IDENTITY_CONTRACT_CONFIRMATION.md`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`
- `.github/tasks/_active/20260625_account_login_history_flow/DECISIONS.md`

Validation run:
- `node --test tests/identity-edge.test.ts tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts` - passed, 22 tests.
- `npm run worker:typecheck` - passed.

Blockers:
- None for Phase 2.

Next action:
- Implement Phase 3: finish returning-user history rendering states around the confirmed preview-scoped identity contract.

## 2026-06-26 - Phase 3 implemented

Author: Codex

Summary:
- Verified the released MGE previewless returning-account contract against the live internal schema and no-email testing endpoint.
- Enabled Account login without a current preview by omitting `preview_id` from returning-account magic-link requests.
- Updated magic-link verification and browser identity storage to accept `preview_id: null`.
- Kept direct preview restoration and saved-preview open links preview-scoped when a preview id exists.
- Documented the internal docs/schema behavior and cleared the stale active-work blocker.

Files changed:
- `components/account/account-panel.tsx`
- `lib/identity/browser.ts`
- `lib/identity/edge.ts`
- `tests/account-panel-source.test.ts`
- `tests/identity-edge.test.ts`
- `tests/identity-preview-library-source.test.ts`
- `tests/magic-link-return-source.test.ts`
- `docs/ACTIVE_WORK.md`
- `docs/mgeveryday-api-docs-gaps.md`
- `.github/tasks/_active/20260625_account_login_history_flow/TASK.md`
- `.github/tasks/_active/20260625_account_login_history_flow/03_PHASE3_HISTORY_RENDERING_AND_TESTS.md`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`
- `.github/tasks/_active/20260625_account_login_history_flow/DECISIONS.md`

Validation run:
- Live sanitized MGE probe: internal schema contains identity endpoints; previewless testing session returned `201`, `preview_id: null`, and identity token; previewless identity preview fetch returned `200`, `current_preview_id: null`, `previews`, and `projects`.
- `node --test tests/identity-edge.test.ts tests/account-panel-source.test.ts tests/magic-link-return-source.test.ts tests/identity-preview-library-source.test.ts` - passed, 26 tests.
- `node --test tests/*.test.ts` - passed, 65 tests.
- `npm run worker:typecheck` - passed.
- `npm run build` - passed with network permission for Next Google Fonts fetch.

Blockers:
- None for Phase 3.

Next action:
- Deploy/smoke-test the previewless returning-account login flow when Matej is ready to send a real magic-link email from production.

## 2026-06-29 - Phase 4 implemented

Author: Codex

Summary:
- Confirmed the released MGE account-history source-project variant contract from the live internal schema and a sanitized account-history probe.
- Added server-side BFF endpoints for attaching an existing preview to a verified identity and generating a new DOT size variant from a saved source project.
- Updated Account history to trust canonical `projects[]`, expose missing-size variant buttons per source project, and save current previews to the verified MGE identity without sending another magic link.
- Removed the temporary client-side same-size badge dedupe path from the local implementation.

Files changed:
- `components/account/account-panel.tsx`
- `functions/api/identity/attach-preview.ts`
- `functions/api/identity/projects/[source_group_id]/previews.ts`
- `lib/identity/browser.ts`
- `lib/identity/edge.ts`
- `tests/account-preview-registry-source.test.ts`
- `tests/identity-edge.test.ts`
- `tests/identity-preview-library-source.test.ts`
- `docs/mgeveryday-api-docs-gaps.md`
- `.github/tasks/_active/20260625_account_login_history_flow/TASK.md`
- `.github/tasks/_active/20260625_account_login_history_flow/04_PHASE4_SOURCE_PROJECT_VARIANTS.md`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`

Validation run:
- Live sanitized MGE probe before implementation: internal schema contains canonical project variant fields plus attach, project-variant, delete, and testing clear endpoints; `matejgondolan@gmail.com` account history returned canonical `projects[]` without duplicate size groups.
- `node --test tests/account-preview-registry-source.test.ts tests/identity-edge.test.ts tests/identity-preview-library-source.test.ts tests/account-panel-source.test.ts` - passed, 33 tests.
- `node --test tests/*.test.ts` - passed, 71 tests.
- `npm run worker:typecheck` - passed.
- `npm run build` - passed after tightening Account panel TypeScript guards.
- Cloudflare Pages deploy - succeeded; preview URL `https://218fbfe7.hermes-painting-landing.pages.dev`.
- Production smoke `https://dottingo.sg/` - returned HTTP 200.
- Production smoke `OPTIONS /api/identity/attach-preview` and `OPTIONS /api/identity/projects/test_source/previews` - returned HTTP 204.
- Production smoke unauthenticated `POST /api/identity/attach-preview` and `POST /api/identity/projects/test_source/previews` - returned HTTP 401 with `X-MGE-Identity-Token is required`.

Blockers:
- None.

Next action:
- Manually smoke-test the verified source-project size variant flow with a real magic-link account.

## 2026-06-29 - Phase 4 UX correction

Author: Codex

Summary:
- Removed the `+ 40x50` / `+ 40x60` / `+ 60x80` missing-size controls from Account history.
- Kept Account history limited to saved/current size badges returned by MGE canonical `projects[]`.
- Changed the row action from `Hide` to `Delete`.
- Added server-side BFF delete routes for MGE identity preview and source project deletion.
- Wired Account delete to call the source-project delete endpoint when `source_group_id` is available, with per-preview delete as fallback.

Files changed:
- `components/account/account-panel.tsx`
- `functions/api/identity/previews/[preview_id].ts`
- `functions/api/identity/projects/[source_group_id].ts`
- `lib/identity/browser.ts`
- `lib/identity/edge.ts`
- `tests/account-preview-registry-source.test.ts`
- `tests/identity-edge.test.ts`
- `docs/mgeveryday-api-docs-gaps.md`
- `.github/tasks/_active/20260625_account_login_history_flow/04_PHASE4_SOURCE_PROJECT_VARIANTS.md`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`

Validation run:
- `node --test tests/account-preview-registry-source.test.ts tests/identity-edge.test.ts tests/identity-preview-library-source.test.ts tests/account-panel-source.test.ts` - passed, 35 tests.
- `node --test tests/*.test.ts` - passed, 73 tests.
- `npm run worker:typecheck` - passed.
- `npm run build` - passed.
- Cloudflare Pages deploy - succeeded; preview URL `https://431d25bf.hermes-painting-landing.pages.dev`.
- Production smoke `https://dottingo.sg/` - returned HTTP 200.
- Production smoke unauthenticated `DELETE /api/identity/previews/test_preview` and `DELETE /api/identity/projects/test_source` - returned HTTP 401 with `X-MGE-Identity-Token is required`.
- Source check confirmed Account panel no longer contains `missingSizeOptions`, `handleGenerateProjectSize`, `FRAME_SIZE_OPTIONS`, or `Generate ${option.label} saved preview`.

Blockers:
- None.

Next action:
- Manually test Account history at `https://dottingo.sg/`: only saved size badges should show, and Delete should remove the selected saved source project from MGE identity history.

## 2026-06-29 - Phase 4 delete contract fix

Author: Codex

Summary:
- Reproduced the MGE delete rejection safely with a non-existent source group and a testing identity token.
- Found live MGE DELETE returns `brand_id: This field is required` unless the request includes JSON body `{ "brand_id": 64 }`.
- Updated Dottingo identity preview/project delete BFF calls to include `brand_id`.
- Improved MGE error extraction so field-level validation errors are surfaced instead of the generic fallback.

Files changed:
- `lib/identity/edge.ts`
- `tests/identity-edge.test.ts`
- `docs/mgeveryday-api-docs-gaps.md`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`

Validation run:
- Live safe MGE probe with a non-existent `source_group_id`: DELETE without body returned `400` / `brand_id` required; DELETE with `{ "brand_id": 64 }` returned expected `404` / `source_project_not_found`.
- `node --test tests/identity-edge.test.ts tests/account-preview-registry-source.test.ts` - passed, 27 tests.
- `node --test tests/*.test.ts` - passed, 73 tests.
- `npm run worker:typecheck` - passed.
- `npm run build` - passed.

Blockers:
- None.

Next action:
- Retest Account Delete at `https://dottingo.sg/` with a real saved design.

## 2026-06-29 - Phase 4 current-preview delete reset

Author: Codex

Summary:
- Updated Account delete success handling so deleting the group that contains the currently loaded preview resets the main preview flow to the default blank canvas.
- Removed `preview_id` and `size_id` from the browser URL after that reset so the deleted preview is not restored again.
- Added source tests for the reset and URL cleanup path.

Files changed:
- `components/account/account-panel.tsx`
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `tests/account-preview-registry-source.test.ts`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`

Validation run:
- `node --test tests/account-preview-registry-source.test.ts tests/account-panel-source.test.ts tests/identity-edge.test.ts` - passed, 32 tests.
- `node --test tests/*.test.ts` - passed, 74 tests after rerunning one transient browser-preview polling failure.
- `npm run worker:typecheck` - passed.
- `npm run build` - passed.
- Cloudflare Pages deploy - succeeded; preview URL `https://eca003f5.hermes-painting-landing.pages.dev`.
- Production smoke `https://dottingo.sg/` - returned HTTP 200.
- Production unauthenticated `DELETE /api/identity/projects/test_source` - returned HTTP 401 with `X-MGE-Identity-Token is required`.

Blockers:
- None.

Next action:
- Retest deleting the currently loaded saved preview at `https://dottingo.sg/`.

## 2026-06-29 - Phase 4 source thumbnail correction

Author: Codex

Summary:
- Removed the Account history fallback that used generated preview/DOT image URLs as source thumbnails.
- Preserved MGE `source_image.url`, `source_image_url`, and `source_group_id` fields through the preview BFF and browser client so newly saved previews can show the original source image immediately.
- Updated save-current-preview to prefer the MGE attach response source fields before writing the local account preview registry.

Files changed:
- `components/account/account-panel.tsx`
- `lib/mgeveryday/bff-handler.ts`
- `lib/mgeveryday/browser-preview.ts`
- `tests/account-preview-registry-source.test.ts`
- `tests/mge-purchase-options.test.ts`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`

Validation run:
- `node --test tests/account-preview-registry-source.test.ts tests/mge-purchase-options.test.ts` - passed, 18 tests.
- `node --test tests/*.test.ts` - passed, 75 tests.
- `npm run worker:typecheck` - passed.
- `npm run build` - passed.
- Cloudflare Pages deploy - succeeded; preview URL `https://39c76a0b.hermes-painting-landing.pages.dev`.
- Production smoke `https://dottingo.sg/` - returned HTTP 200.
- Preview smoke `https://39c76a0b.hermes-painting-landing.pages.dev/` - returned HTTP 200.

Blockers:
- None.

Next action:
- Retest at `https://dottingo.sg/`: after upload + Save, Account history should show the uploaded source photo thumbnail, not the generated DOT/design image.

## 2026-07-01 - Phase 4 immediate source thumbnail fallback

Author: Codex

Summary:
- Fixed the verified bottom Save path so it enriches the local account preview registry with a source-photo thumbnail instead of writing a preview record with no source image.
- Added a small browser-side source thumbnail derived from the uploaded `selectedFile`; this is used only when MGE has not yet returned a source image URL.
- Passed the same fallback into the Account panel save path, while preserving MGE `source_image` as the preferred source of truth.

Files changed:
- `components/single-screen-preview/single-screen-preview-shell.tsx`
- `components/account/account-panel.tsx`
- `tests/account-preview-registry-source.test.ts`
- `tests/purchase-panel-source.test.ts`
- `.github/tasks/_active/20260625_account_login_history_flow/LOG.md`

Validation run:
- `node --test tests/account-preview-registry-source.test.ts tests/purchase-panel-source.test.ts tests/account-panel-source.test.ts` - passed, 18 tests.
- `node --test tests/*.test.ts` - passed, 75 tests.
- `npm run worker:typecheck` - passed.
- `npm run build` - first run timed out at 184 seconds, rerun with longer timeout passed.
- Cloudflare Pages deploy - succeeded; preview URL `https://5761cc3b.hermes-painting-landing.pages.dev`.
- Production smoke `https://dottingo.sg/` - returned HTTP 200.
- Preview smoke `https://5761cc3b.hermes-painting-landing.pages.dev/` - returned HTTP 200.

Blockers:
- None.

Next action:
- Retest at `https://dottingo.sg/`: upload a new image, generate DOT, click Save, and confirm Account history shows the source photo thumbnail immediately.
