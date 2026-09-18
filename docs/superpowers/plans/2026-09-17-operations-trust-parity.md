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

- [x] Inventory current provider route and config representation.
- [x] Add provider CRUD with server-side secret references; never return keys.
- [x] Add URL scheme/host SSRF guard and bounded `/v1/models` request.
- [x] Add profile-scoped model cache invalidation.
- [x] Add tests for redaction, unsafe URL, timeout, and malformed model payload.
- [x] Commits `1a5d3df`, `5503a83`, `79ff24e`, `c6553a7`.

### Task 2: Cron UX parity

- [x] Add schedule preset builder with explicit timezone and expression preview.
- [x] Add skill picker from profile-scoped skills.
- [x] Existing query polling remains run-watch fallback.
- [x] Surface existing stable run errors and completion state.
- [ ] Add tests for schedule serialization and invalid combinations.
- [x] Commit `ad7d68a feat(cron): add schedule builder and skill picker`.

### Task 3: Notification center

- [x] Add bounded notification store keyed by profile and event identity.
- [x] Project failure, lost/stuck, review, cron completion, approval events.
- [x] Add list/unread/mark-read/mark-all-read routes.
- [x] Deduplicate repeated SSE events.
- [x] Add drawer and unread badge; browser permission toggle deferred.
- [x] Commit `17560be feat(notifications): add bounded notification center`.

### Task 4: Passkey/OIDC evaluation and implementation

- [x] Record deployment constraint: no complete WebAuthn/OIDC provider contract.
- [ ] WebAuthn deferred; fail closed until complete contract.
- [ ] OIDC deferred; fail closed until complete contract.
- [ ] Add rate limits, nonce expiry, replay protection, and audit events.
- [ ] Test incomplete config fails closed and callback state mismatch fails.
- [x] Unsafe half-auth avoided; no auth commit created.

### Task 5: PWA shell

- [x] Add manifest with explicit icons, name, scope, and start URL.
- [x] Add versioned service worker caching shell assets only.
- [x] Never cache authenticated API responses or mutation requests.
- [ ] Add reconnect banner and update notification.
- [x] Static build acceptance passed for install metadata and offline shell.
- [x] Commit `9010c2a feat(pwa): add installable offline shell`.

### Task 6: Verification

- [x] Run `go vet ./...`, `go test ./...`, `go build ./cmd/server`.
- [x] Run Vite production build from `web/`.
- [ ] Run authenticated live smoke for provider redaction, cron run, notification read state.
- [x] Verify auth additions remain disabled without complete configuration.
- [x] Verify service worker never handles `/api/*` requests.
- [ ] Tick Phase 3 acceptance in `plan.md`.
