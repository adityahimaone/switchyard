# plan.md — kanban-board (Vite FE + Go BE, opsi A)

Repo: `~/apps/kanban-board`, deploy VPS :8790, share `~/.hermes/kanban/boards/<slug>/kanban.db`.

## Scope (simple dulu)

1. **BE Go** (`cmd/server`) — chi, `modernc.org/sqlite` (pure Go, no cgo), port 8790
   - `GET /api/boards` — list dari `~/.hermes/kanban/boards/*/board.json`
   - `GET /api/boards/{slug}/tasks` — read tasks (id, title, body, status, priority, workspace_path, assignee, created_at, completed_at, result, consecutive_failures)
   - `POST /api/boards/{slug}/tasks` — create (title, body, workspace_path, priority, status=todo|triage)
   - `PATCH /api/boards/{slug}/tasks/{id}/status` — status transition (todo→ready→running→done|blocked|archived) + audit ke `task_events`
   - `DELETE /api/boards/{slug}/tasks/{id}` — archive (soft)
   - `GET /api/workspaces` — dari `~/.hermes/workspaces.json` (dropdown)
   - `GET /api/nodes` — proxy `:8788/health` (node-agent status)
   - `GET /api/boards/{slug}/tasks/{id}/events` — task_events tail (history card)
   - Auth: none (localhost + tailscale only). nginx subpath `/kanban/` proxy.

2. **FE Vite** (`web/`) — React 19, TS, Vite 7, Tailwind v4, shadcn/ui (button/card/badge/select/dialog/dropdown), TanStack Query v5
   - `BoardView` — columns per status (triage/todo/ready/running/blocked/review/done), card = title + badge priority + workspace chip + assignee + result excerpt
   - `TaskDialog` — create task (title, body, workspace select, priority)
   - `TaskDetail` drawer — events timeline + status actions
   - Mobile off-canvas, shared UI language, dark theme (match dashboard)
   - `src/features/board/` feature folder, route `sections/`, barrel index.ts

3. **Integration rules**
   - Baca tulis langsung ke kanban.db via same schema hermes pakai — WAL mode, `BEGIN IMMEDIATE` for writes
   - Status valid (dari kanban_db.py): `triage|todo|scheduled|ready|running|blocked|review|done|archived`
   - Create: status default `todo` (bukan `running` — running cuma dispatcher)
   - Jangan sentuh `claim_lock`, `consecutive_failures`, `worker_pid`, `current_run_id` — domain dispatcher
   - `task_events` insert manual saat FE write (source="board-ui")

## Verifikasi

- `go vet ./...` + `go build`
- SQLite read: `GET /api/boards/f8-saas/tasks` → sama dengan `hermes kanban list --board f8-saas`
- Create: `POST /api/boards/f8-saas/tasks` → muncul di `hermes kanban list` + `sqlite3` query
- Status: `PATCH` → `hermes kanban show` reflects
- FE build: `pnpm build` → dist served by Go static
- PM2: `kanban-board` :8790, domain `kanban.adityahimaone.space` (SSL later)
- 1 runnable check: `go test ./internal/kanban -run TestStatusTransition` assert valid/invalid transitions

## Out of scope (add when needed)

- drag-drop column move (use PATCH status per card dropdown first)
- auth (nginx basic later)
- websocket live refresh (poll 15s via TanStack Query refetchInterval)
- worker spawn from UI (dispatch stays CLI/hermes)

## Active roadmap — Agent Control Plane Reliability

Spec: `docs/specs/2026-09-08-agent-control-plane-reliability-design.md`

Status: reliability slice complete; verification and local authenticated/SSE smoke passed. Existing auth/UI work remains separate.

### Discovery/design

- [x] Confirm current API routes and task event model
- [x] Confirm `stop` exists; avoid duplicate endpoint
- [x] Confirm `running` and runtime columns are dispatcher-owned
- [x] Define retry/release/clone contracts
- [x] Define health states and thresholds
- [x] Define SSE envelope and polling fallback
- [x] User reviewed spec and approved implementation

### Backend

- [x] Health domain + threshold tests
- [x] Retry operation + route
- [x] Stale release operation + route
- [x] Clone operation + route
- [x] Task health route
- [x] Overview health summary
- [x] SSE event hub + stream route
- [x] Board task/status mutation broadcasts
- [x] Workspace/node mutation broadcasts
- [x] Backend HTTP/domain route tests

### Frontend

- [x] Typed API methods
- [x] SSE client + event listener
- [x] Board invalidation from SSE
- [x] Task detail health query + refresh
- [x] Health indicator on detail page
- [x] Retry/release/clone actions on detail page
- [x] Polling fallback remains enabled
- [x] Health indicator on board cards (board-level health endpoint, no per-card polling)
- [x] Run-control actions on drawer

### Verification

- [x] `go vet ./...`
- [x] `go test ./...`
- [x] `go build ./cmd/server`
- [x] `pnpm build` in `web/`
- [x] Authenticated API smoke tests (local live server)
- [x] SSE mutation smoke test (task_created observed)
- [x] Scope/diff review

## Active roadmap — Switchyard Feature Part 1

Spec: `docs/specs/2026-09-09-switchyard-feature-part1-design.md`

Rule: finding #1 (default password `123456`) explicitly skipped. Tick each item only after implementation and fresh verification.

### Documentation

- [x] Audit findings 2–16 captured in Part 1 design
- [x] Execution order and acceptance gates documented

### Correctness and security boundary

- [x] #4 Restore `scheduled` board column — `web/src/api.ts:COLUMNS`; verified `pnpm build`
- [x] #2 Commit pending auth/UI boundary as one isolated slice — present in `aec12e7`

### Data and scale

- [x] #10 Server-side task pagination/filter — `ListTasksQuery` + route params; legacy full-list preserved
- [x] #5 Persist drag-drop task order — position column + reorder API + FE drag hook
- [x] #6 Bulk task actions — bulk endpoint (move/archive/assign) + selection UI
- [x] #3 Board export/import backup — snapshot domain + API + round-trip test

### Operations

- [x] #7 Notification preferences and in-app/browser notifications
- [x] #8 Explicit Run now / queue / cancel UX
- [x] #9 Attempt-aware run history
- [x] #14 Board archive/restore UI

### Productivity

- [x] #11 Cmd/Ctrl+K command palette
- [x] #12 Saved filter views
- [x] #13 Task dependencies/blockers
- [x] #15 Shared toast/error feedback

### Performance

- [x] #16 Route-level lazy loading and bundle split — initial JS 605.93 KB

### Part 1 verification

- [x] `go vet ./...`
- [x] `go test ./...`
- [x] `go build ./cmd/server`
- [x] `pnpm build`
- [x] Acceptance smoke checks for each checked feature — domain/API tests plus authenticated status smoke

## Active roadmap — Hermes WebUI parity

Design: `docs/superpowers/specs/2026-09-17-hermes-webui-parity-roadmap-design.md`
Phase 1 design: `docs/superpowers/specs/2026-09-17-chat-workspace-v1-design.md`
Program index: `docs/superpowers/plans/2026-09-17-parity-program-index.md`

Status: Phase 1 implementation slice complete in `feat/chat-workspace-v1`; live authenticated smoke pending integration environment.

- [x] Phase 1 backend: schema, search/filter, pin/project/tag, project CRUD, duplicate/fork/lineage, export/import/transcript
- [x] Phase 1 frontend: typed APIs, session menu, event cards, search/sidebar, active-run recovery foundations
- [x] Phase 1 local verification: `go test ./...`, `go vet ./...`, `go build -o /tmp/kanban-board-server ./cmd/server`, `pnpm build`
- [ ] Phase 1 authenticated live API smoke + browser-rendered acceptance
- [ ] Phase 1 SSE mutation smoke for project/duplicate/fork/import families
- [ ] Phase 1 — Chat Workspace: `docs/superpowers/plans/2026-09-17-chat-workspace-v1.md`
- [x] Phase 2 local implementation: workspace contract, bounded browse/mutations, terminal session, profile-scoped Skills/Memory APIs, file browser and memory editor
- [x] Phase 2 local verification: `go test ./...`, `go vet ./...`, `go build -o /tmp/kanban-board-server ./cmd/server`, Vite production build
- [ ] Phase 2 authenticated browser acceptance (local live route served 200; API routes returned 401 without session; browser tool blocked private URL)
- [x] Phase 2 remote Mac canary through node-agent: dispatch ack `node_id=mac`; result `success=true`; `CANARY_HOST=Adityas-MacBook-Pro.local`; `CANARY_CWD=/Users/adityahimawan/Development` (no VPS `/Users` access)
- [ ] Phase 2 authenticated browser acceptance (local live route served 200; API routes returned 401 without session; browser tool blocked private URL)
- [ ] Phase 2 — Agent Workspace: `docs/superpowers/plans/2026-09-17-agent-workspace-parity.md`
- [x] Phase 3 local implementation: providers, guarded discovery, cron builder, notification center, PWA shell; passkey/OIDC fail-closed evaluation
- [ ] Phase 3 authenticated live smoke + browser acceptance (provider redaction, cron run, notification read state, PWA offline shell)
- [ ] Phase 3 — Operations and Trust: `docs/superpowers/plans/2026-09-17-operations-trust-parity.md` acceptance closeout
- [ ] Phase 4 — MCP/extensions/gateway: separate design approval required
