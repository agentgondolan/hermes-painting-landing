# Decisions

## 2026-06-25 - Treat account entry as two intents

Decision:
- Plan the Account panel around two explicit intents: saving the current ready preview for first-user UX, and logging into saved history for returning-user UX.

Rationale:
- The current UI only offers the email form when `hasCurrentDesign` is true. Returning users can reasonably expect Account to let them verify by email and recover saved designs before creating a new preview.

## 2026-06-25 - Confirm MGE identity contract before previewless BFF changes

Decision:
- Do not assume the existing MGE magic-link request endpoint supports previewless account login.

Rationale:
- The current Dottingo BFF validates `preview_id` and the upstream MGE request body includes `preview_id`. Changing that blindly could create a UI that looks like login but fails at the server boundary.

## 2026-06-25 - Keep previewless send blocked in Phase 1

Decision:
- Phase 1 opens the login/history email form without a current preview, but does not send a previewless magic link yet.

Rationale:
- The existing BFF and MGE request path still require `preview_id`. Blocking the actual send with clear status copy lets the Account UI take the right shape now without fabricating unsupported backend behavior.

## 2026-06-25 - Keep magic-link login preview-scoped until MGE confirms otherwise

Decision superseded on 2026-06-26:
- The Dottingo BFF continues to reject `/api/identity/request-magic-link` without `preview_id`.

Rationale:
- All current request, verify, idempotency, and identity-session paths carry `preview_id`, and `GET /api/internal/v1/identity/previews/` is only available after a verified MGE identity token. Without a confirmed MGE previewless account-link contract, strict rejection is safer than sending an invented request shape upstream.

## 2026-06-26 - Enable previewless returning-account login after MGE release

Decision:
- Supersede the temporary preview-scoped-only restriction for the Account login intent. Dottingo now omits `preview_id` when no current preview exists and accepts MGE verify responses where `preview_id` is `null`.

Rationale:
- Live MGE internal schema and testing endpoints confirmed the returning-account contract. This lets returning customers verify by email and fetch account history before creating a new image, while checkout and saved-preview open links remain preview-scoped.

## 2026-06-29 - Let MGE own canonical size variants

Decision:
- Dottingo uses MGE `projects[]` as the canonical saved-design account history and does not deduplicate same-size preview badges in the UI.

Rationale:
- The released MGE identity/project API now returns one current preview per selected size inside each source project by default, while flat `previews[]` remains the audit list. Additional sizes must be generated from MGE's stored original source image through the project variant endpoint, not from generated preview media.
