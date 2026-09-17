# Hermes WebUI Parity Roadmap — Switchyard Design

Status: approved roadmap; implementation starts per phase
Date: 2026-09-17
Repo: `~/apps/kanban-board`
Source: audit of `nesquena/hermes-webui` README, ROADMAP, ARCHITECTURE, plus Switchyard routes and source inventory

## Goal

Borrow Hermes WebUI's strongest session and workspace ergonomics without changing Switchyard's control-plane boundary.

Switchyard remains responsible for boards, task lifecycle, dispatch, remote workers, review gates, and operational evidence. New parity work improves chat usability, agent transparency, workspace access, and profile operations.

## Non-goals

- Do not replace Go + React architecture with Python + vanilla JS.
- Do not copy Hermes WebUI's three-panel layout wholesale.
- Do not add real-time multi-user collaboration.
- Do not add public conversation sharing before access-control design exists.
- Do not move remote workspace execution into the VPS process.
- Do not add arbitrary extension JavaScript or backend route registration.
- Do not add a new package when Go stdlib, SQLite, or existing UI primitives suffice.

## Current baseline

Already present in Switchyard:

- Chat session CRUD, archive, messages, runs, run events, stop, retry.
- Shared task/chat attachments and vision analysis.
- Boards, task dependencies, saved task views, bulk actions, reorder persistence.
- Remote workspace routing through node-agent.
- Worker logs, task health, retry/release/clone, review diff, commit/push gate.
- Profiles, providers page, skills page, memory page, cron page, overview, SSE event hub.

Primary gaps:

1. Chat session organization and search.
2. Chat event transparency and recovery UX.
3. Workspace file browser/editor/terminal surface.
4. Skills and memory write operations.
5. Provider/model configuration and discovery.
6. Cron schedule and notification polish.
7. Passkey/OIDC hardening.
8. PWA, MCP management, extension contract, gateway sessions.

## Product slices

### Phase 1 — Chat Workspace

Deliver:

- Session title/content search.
- Pin and archive filters.
- Projects and tags.
- Duplicate and fork from message boundary.
- JSON import/export and Markdown transcript download.
- Tool, reasoning, approval, clarify, and subagent event cards.
- Queue/interrupt/steer state display.
- Reconnect and partial-output recovery.

Why first: reuses existing chat tables and events; highest daily value; no remote filesystem mutation.

### Phase 2 — Agent Workspace

Deliver:

- Remote-safe workspace file tree.
- Breadcrumbs, preview, download, upload.
- Inline edit, create, rename, delete.
- Embedded terminal routed to node-agent.
- Skills CRUD with linked-file viewer.
- Memory `MEMORY.md` and `USER.md` write support.

Security boundary: all file and terminal operations resolve through registered workspace host. VPS never treats `/Users/...`, `/c/...`, or `/d/...` as local cwd.

### Phase 3 — Operations and Trust

Deliver:

- Provider CRUD and live model discovery.
- Cron schedule builder, skill picker, live run watch.
- Notification center with unread state and event history.
- Passkey/WebAuthn and OIDC evaluation; implement only after provider/auth contract review.
- PWA shell and reconnect behavior.

### Phase 4 — Optional Ecosystem

Evaluate separately:

- MCP server management.
- Constrained extension manifest and capability registry.
- Gateway session adapter.

No implementation starts from Phase 4 without a separate design approval.

## Data model rules

- Chat data stays in existing chat database unless a migration is required.
- Additive migrations only; existing rows keep valid defaults.
- Session search may use SQLite FTS5 when available; fallback must remain bounded `LIKE` search.
- Projects, tags, and notifications are profile-scoped.
- Fork retains source session ID and source message ID for lineage.
- Imported JSON never imports secrets, auth state, provider keys, or filesystem paths outside validated workspace metadata.
- All writes use transactions and emit existing SSE event envelopes.

## API rules

- Existing routes remain backward-compatible.
- New mutation routes require the existing authenticated session middleware.
- Request bodies use `http.MaxBytesReader`.
- IDs, slugs, filenames, and workspace paths are validated at trust boundaries.
- Error responses contain stable public messages; no stack traces or secrets.
- Remote operations carry workspace ID/path and node-agent target explicitly.

## Acceptance gates

Global:

- `go vet ./...`
- `go test ./...`
- `go build ./cmd/server`
- `pnpm build` from `web/`
- Authenticated live API smoke against isolated state.
- SSE mutation event observed for each new mutation family.
- No remote path reaches local `os.Chdir`, local file open, or local terminal execution.

Phase 1:

- Search finds title and message content.
- Project/tag/pin/archive state survives reload.
- Duplicate and fork preserve expected messages without sharing mutable rows.
- Export/import round-trips transcript and metadata without secrets.
- Event cards render tool and subagent events; unknown events remain readable.
- Reload during active run restores partial output and run state.

Phase 2:

- Local and remote workspace operations resolve correct host.
- Path traversal, symlink escape, and unregistered workspace are rejected.
- File edit is atomic and preserves data on failed write.
- Terminal output is bounded and cancellable.
- Skill and memory writes stay profile-scoped.

Phase 3:

- Provider secrets never appear in JSON responses or browser storage.
- Live model discovery rejects unsafe URLs.
- Cron mutations show success/error state and persist schedule.
- Notifications deduplicate event bursts and retain unread state.
- Auth additions fail closed when configuration is incomplete.

## Implementation order

1. Phase 1 plan.
2. Phase 2 plan.
3. Phase 3 plan.
4. Separate proposal for Phase 4.

Each plan uses TDD red → green, one focused commit per slice, fresh verification after each slice.
