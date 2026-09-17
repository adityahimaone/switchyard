# Operations and Trust Parity Implementation Plan

> Worker: use TDD red → green. Follow `docs/superpowers/specs/2026-09-17-hermes-webui-parity-roadmap-design.md`. Security additions fail closed.

**Goal:** Complete high-value Hermes WebUI operations: provider/model discovery, cron polish, notification center, stronger authentication, and PWA shell.

**Architecture:** Keep secrets server-side. Reuse existing provider and cron domains. Project event hub into a bounded notification store. Authentication changes remain optional and disabled until fully configured.

**Tech stack:** Go, SQLite, existing auth middleware, React/TanStack Query, Web APIs, existing PWA/static serving.

## Files

Create:
- `internal/kanban/notifications.go` and tests.
- `cmd/server/notification_routes.go`.
- `web/src/features/notifications/NotificationCenter.tsx`.
- `web/public/manifest.webmanifest` and `web/public/sw.js`.

Modify:
- `cmd/server/main.go` — route registration.
- Existing provider routes/domain — CRUD, validation, model discovery.
- Existing cron page/API — schedule builder and watch state.
- Existing auth domain/routes — passkey/OIDC only after contract review.
- `web/src/api.ts`, `SettingsPage.tsx`, `CronPage.tsx`, `App.tsx`, `plan.md`.

### Task 1: Provider/model contract

- [ ] Inventory current provider route and config representation.
- [ ] Add provider CRUD with server-side secret references; never return keys.
- [ ] Add URL scheme/host SSRF guard and bounded `/v1/models` request.
- [ ] Add profile-scoped model cache invalidation.
- [ ] Add tests for redaction, unsafe URL, timeout, and malformed model payload.
- [ ] Commit `feat(providers): add guarded provider discovery`.

### Task 2: Cron UX parity

- [ ] Add schedule preset builder with explicit timezone and expression preview.
- [ ] Add skill picker from profile-scoped skills.
- [ ] Add live run watch using existing SSE/poll fallback.
- [ ] Surface stable run errors and completion state.
- [ ] Add tests for schedule serialization and invalid combinations.
- [ ] Commit `feat(cron): add schedule builder and live run watch`.

### Task 3: Notification center

- [ ] Add bounded `notifications` table keyed by profile and event identity.
- [ ] Project failure, lost/stuck, review, cron completion, approval events.
- [ ] Add list/unread/mark-read/mark-all-read routes.
- [ ] Deduplicate repeated SSE events.
- [ ] Add drawer, unread badge, browser permission toggle.
- [ ] Commit `feat(notifications): add event notification center`.

### Task 4: Passkey/OIDC evaluation and implementation

- [ ] Write threat model and deployment constraints before code.
- [ ] Add WebAuthn registration/login only with same-origin challenge validation.
- [ ] Add OIDC PKCE only when issuer/client/allow claims are complete.
- [ ] Add rate limits, nonce expiry, replay protection, and audit events.
- [ ] Test incomplete config fails closed and callback state mismatch fails.
- [ ] Commit `feat(auth): add optional passkey and oidc login`.

### Task 5: PWA shell

- [ ] Add manifest with explicit icons, name, scope, and start URL.
- [ ] Add versioned service worker caching shell assets only.
- [ ] Never cache authenticated API responses or mutation requests.
- [ ] Add reconnect banner and update notification.
- [ ] Add browser acceptance for install metadata and offline shell.
- [ ] Commit `feat(pwa): add installable shell`.

### Task 6: Verification

- [ ] Run `go vet ./...`, `go test ./...`, `go build ./cmd/server`.
- [ ] Run `pnpm build` from `web/`.
- [ ] Run authenticated live smoke for provider redaction, cron run, notification read state.
- [ ] Verify auth tests on isolated state only.
- [ ] Verify service worker never stores `/api/*` response bodies.
- [ ] Tick Phase 3 acceptance in `plan.md`.
