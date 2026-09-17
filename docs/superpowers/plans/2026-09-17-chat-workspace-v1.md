# Chat Workspace v1 Implementation Plan

> Worker: use TDD red → green. Complete each checkbox, run verification, commit each slice. Follow `docs/superpowers/specs/2026-09-17-chat-workspace-v1-design.md`.

**Goal:** Add searchable, organized, portable, transparent chat sessions.

**Architecture:** Keep chat domain in `internal/kanban`; isolate new session organization logic in `chat_workspace.go`. Keep existing routes and event envelope backward-compatible. React consumes typed APIs through TanStack Query.

**Tech stack:** Go, SQLite, `modernc.org/sqlite`, stdlib HTTP, React, TypeScript, TanStack Query, existing shadcn primitives.

## Files

Create:
- `internal/kanban/chat_workspace.go` — projects, tags, pin, duplicate, fork, export/import, lineage, transcript.
- `internal/kanban/chat_workspace_test.go` — domain and round-trip tests.
- `web/src/components/chat/EventCard.tsx` — run event renderer.
- `web/src/components/chat/SessionMenu.tsx` — session actions.

Modify:
- `internal/kanban/chat.go` — additive schema migration and session list fields.
- `cmd/server/chat_routes.go` — API routes and bounded request parsing.
- `web/src/api.ts` — types and API methods.
- `web/src/features/chat/ChatPage.tsx` — search, filters, actions, recovery.
- `plan.md` — progress ticks after fresh verification.

### Task 1: Schema, types, project and tag primitives

- [ ] Add additive `pinned`, `project_id`, `chat_projects`, `chat_session_tags`, `chat_fork_links` migration.
- [ ] Add `ChatProject`, `ChatForkLink`, and extended `ChatSession` JSON fields.
- [ ] Add tests for fresh DB and migration over existing DB.
- [ ] Run `go test ./internal/kanban -run 'Test.*Chat.*Schema|Test.*Project' -v`.
- [ ] Commit `feat(chat): add session organization schema`.

### Task 2: Search, filters and session mutation

- [ ] Implement title/message `LIKE` search with trimmed query and `LIMIT 200`.
- [ ] Implement exact tag, project, pinned, archived filters.
- [ ] Extend PATCH with pinned/project_id; reject unknown session IDs.
- [ ] Extract `#tag` tokens, normalize case, dedupe, replace session tag rows transactionally.
- [ ] Add route tests for filter combinations and persistence.
- [ ] Run `go test ./cmd/server ./internal/kanban -run 'Test.*Chat.*(Search|Filter|Tag|Pin)' -v`.
- [ ] Commit `feat(chat): add session search and filters`.

### Task 3: Projects API

- [ ] Add GET/POST `/api/chat/projects`.
- [ ] Add PATCH/DELETE `/api/chat/projects/{id}`.
- [ ] Enforce non-empty names and case-insensitive uniqueness.
- [ ] Delete project by unbinding sessions, never deleting sessions.
- [ ] Add route tests.
- [ ] Commit `feat(chat): add session projects`.

### Task 4: Duplicate, fork and lineage

- [ ] Implement duplicate in one transaction with fresh session/message IDs; do not copy runs/events.
- [ ] Implement fork requiring message belonging to source session; copy messages through boundary.
- [ ] Insert `chat_fork_links` and expose bounded lineage endpoint.
- [ ] Test mutation isolation and 404 for foreign message IDs.
- [ ] Commit `feat(chat): add session duplicate and fork`.

### Task 5: Export, import and transcript

- [ ] Export session + messages only; omit runs, secrets, and `hermes_session_id`.
- [ ] Import with fresh session ID; validate roles and max 2000 messages; cap body at 4 MiB.
- [ ] Return structured invalid-row errors; never partially commit failed transaction.
- [ ] Generate Markdown transcript with escaped metadata and message headings.
- [ ] Add round-trip, secret omission, attacker-controlled ID, and oversize tests.
- [ ] Commit `feat(chat): add session portability`.

### Task 6: Frontend API and session controls

- [ ] Add typed project/session export/import/duplicate/fork/lineage methods in `web/src/api.ts`.
- [ ] Add `SessionMenu.tsx` with duplicate, fork, JSON export, Markdown download, archive/delete.
- [ ] Add import control using file picker; validate JSON through server response.
- [ ] Add search input, pinned/project/tag filters, and clear-filter action in `ChatPage.tsx`.
- [ ] Use existing shadcn Select/Combobox primitives; do not use native select.
- [ ] Commit `feat(chat): add session workspace controls`.

### Task 7: Event cards

- [ ] Add `EventCard.tsx` for spawned/completed/error/cancelled/tool/reasoning/approval/clarify/subagent.
- [ ] Keep unknown event kinds visible as raw bounded payload.
- [ ] Add expand/collapse for long payloads and accessible labels.
- [ ] Add component test or assert-based render contract if project test setup lacks frontend runner.
- [ ] Commit `feat(chat): render agent run events`.

### Task 8: Reload recovery

- [ ] On session load query active run and run events.
- [ ] Show recovery banner only for loading/running state.
- [ ] Poll active run/events every 2s while active; stop polling on terminal state.
- [ ] Preserve partial output; never clear new session busy state after session switch.
- [ ] Add route/domain tests for active, terminal, missing, and stale runs.
- [ ] Commit `feat(chat): recover active runs on reload`.

### Task 9: Verification

- [ ] Run `go vet ./...`.
- [ ] Run `go test ./...`.
- [ ] Run `go build ./cmd/server`.
- [ ] Run `pnpm build` from `web/`.
- [ ] Run authenticated live smoke: search, pin, project, duplicate, fork, export/import, transcript, event list.
- [ ] Verify SSE events for session create/update and chat run event.
- [ ] Tick Phase 1 acceptance in `plan.md`.
- [ ] Commit `test(chat): verify workspace parity slice`.
