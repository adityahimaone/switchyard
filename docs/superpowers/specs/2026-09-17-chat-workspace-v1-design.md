# Chat Workspace v1 — Design (Phase 1 of WebUI Parity)

Status: approved for implementation (roadmap: docs/superpowers/specs/2026-09-17-hermes-webui-parity-roadmap-design.md)
Date: 2026-09-17
Repo: `~/apps/kanban-board` — Go `cmd/server` + `internal/kanban`, Vite React `web/`

## Goal

Upgrade the Switchyard chat surface to usable agent-workspace parity: search, organize (pin/project/tag/archive), lineage (duplicate/fork), portability (export/import/transcript), and transparency (tool/reasoning/approval/subagent event cards + recovery on reload).

No remote filesystem access, no queue/interrupt/steer execution modes (display-only v1), no gateway session bridge.

## Non-goals

- Queue / Interrupt / Steer execution control (requires node-agent executor contract; Phase 1 renders run state only).
- Workspace file browser / terminal (Phase 2).
- Provider model management (Phase 3).
- Public sharing links, i18n, skins.
- Any change to task/kanban domain.

## Current baseline

Existing in `internal/kanban/chat.go`:

- `chat_sessions(id,title,agent,profile,workspace,model,hermes_session_id,created_at,updated_at,archived)`
- `chat_messages(id,session_id,role,content,created_at,run_id)`
- `chat_runs(id,session_id,message_id,agent,profile,workspace,model,state,prompt,output,error,started_at,ended_at)`
- `chat_run_events(id,run_id,kind,payload,created_at)`
- CRUD routes in `cmd/server/chat_routes.go`, SSE events `chat_session_created|updated|archived`, `chat_message`, `chat_run`, `chat_run_event`.

## Data model (additive migrations only)

New file `internal/kanban/chat_workspace.go` (keeps `chat.go` bounded) with migrations appended in `ensureChatDB()`:

```sql
ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_sessions ADD COLUMN project_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS chat_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_session_tags (
  session_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(session_id, tag)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS chat_fork_links (
  fork_id TEXT PRIMARY KEY,
  source_session_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

Migration pattern matches `ensureChatDB` (tolerate `duplicate column` on ALTER).

Fork lineage: `fork_id` is the new session id of the fork. Copy keeps `parent_message_id` out of scope — lineage lives only in `chat_fork_links`.

Search index: v1 uses bounded `LIKE` (`LIMIT 200`) with `COLLATE NOCASE`; no FTS5 migration in v1. FTS5 upgrade path documented in plan if title/content volume exceeds ~2k sessions.

## API delta

New/changed endpoints (all under existing `registerChatRoutes`):

| Method + Path | Purpose |
|---|---|
| GET `/api/chat/sessions` | Extend query: `q` (title + message content), `pinned=1`, `project=<id>`, `tag=<tag>`; existing `archived` stays. Always `LIMIT 200`. |
| PATCH `/api/chat/sessions/{id}` | Extend body: `pinned *bool`, `project_id *string` in addition to existing fields. |
| POST `/api/chat/sessions/{id}/duplicate` | Copy session + all messages (new message IDs). New session keeps agent/profile/workspace/model. No runs copied. Broadcast `chat_session_created`. |
| POST `/api/chat/sessions/{id}/fork` | Body `{message_id}`. New session gets messages up to and including `message_id` (copy, new IDs). Insert `chat_fork_links`. Broadcast `chat_session_created`. |
| GET `/api/chat/sessions/{id}/export` | `{session: compact, messages: []}` — no runs output, no secrets, no `hermes_session_id` when it links a live external session. |
| POST `/api/chat/sessions/import` | Body = export snapshot. Creates session + messages with fresh session ID (import never trusts incoming ID). Returns `{session}`. |
| GET `/api/chat/sessions/{id}/transcript` | `text/markdown; charset=utf-8` transcript (title, agent/profile/model line, per message role+content). |
| GET/POST `/api/chat/projects` | List/create projects. `{name, color}`. Name required, uniqueness enforced (case-insensitive). |
| PATCH/DELETE `/api/chat/projects/{id}` | Rename/color; delete sets `chat_sessions.project_id=''` (no cascade delete of sessions). |
| GET `/api/chat/sessions/{id}/lineage` | `{forks: [{fork_id, source_message_id, created_at}], source: {...}|null}` — bounded lineage display. |

Tag extraction: on session title update (`PATCH`) and at auto-title time, server parses `#tag` tokens from title and upserts into `chat_session_tags`. List response includes `tags: []string`. Filter `GET /api/chat/sessions?tag=` matches exact tag.

All new routes go through existing auth middleware; bodies capped with `http.MaxBytesReader` (16 KiB objects, 4 MiB import).

## Run event transparency

`chat_run_events.kind` stays free-form. Canonical v1 kinds documented server-side and rendered by FE:

- `spawned`, `completed`, `error`, `cancelled` (already emitted by `chat_exec.go`)
- `tool` — payload `{name, preview, args?}`
- `reasoning` — payload `{text}` (collapsible gold card)
- `approval` — payload `{command, description}` (card w/ status note; actual allow/deny execution is Phase 3)
- `clarify` — payload `{question}`
- `subagent` — payload `{name, status}`

FE renders by kind from `GET /api/chat/runs/{id}/events`; unknown kinds fall back to readable raw payload with kind badge. No backend change needed to accept these kinds (already arbitrary strings); a small `NormalizeChatRunKind(kind)` helper in Go keeps the vocabulary canonical and unit-tested.

## Recovery on reload

- FE on load: `GET /api/chat/active` + `GET /api/chat/runs/{id}` for active session.
- If run state in `loading|running`: show "Resumed — run still active" banner, render partial `run.output` up to last event offset, keep polling events every 2s while state active (SSE hub already broadcasts `chat_run*`).
- Stale active-run guard: if run absent or state terminal, clear banner, no spurious stop button.

## UI components

- `web/src/features/chat/ChatPage.tsx` — add search input, filter rail (pinned / project / tag chips), session action menu, resumed banner, event cards.
- `web/src/components/chat/EventCard.tsx` — render run event by kind (icon, badge, payload, expand/collapse).
- `web/src/components/chat/SessionMenu.tsx` — duplicate, fork, export JSON, download transcript, delete.

Data via TanStack Query; new functions in `web/src/api.ts` following existing naming (`listChatSessions`, `updateChatSession`, ...).

## Errors / edge cases

- Search q trimmed; empty q returns unfiltered list.
- Pin + archive can coexist (archived hides by default; pinned filter applies within visible set).
- Fork with unknown/foreign `message_id` → 404; message must belong to the session.
- Duplicate/fork never copies `chat_runs` or `chat_run_events` — runs are ephemeral execution records.
- Import validates `role ∈ {user,assistant}` and caps messages at 2000 per snapshot; skips invalid rows with error report.
- Delete project unbinds sessions (`project_id=''`) — sessions never cascade-deleted.
- Export excludes `hermes_session_id` always (it can leak external-session identity).

## Acceptance (gate)

- `go vet ./... && go test ./...` pass.
- `pnpm build` pass.
- Search finds title and message content; filter combos pinned/project/tag/archived behave.
- Pin, project, tag state survives reload.
- Duplicate + fork produce isolated message sets; fork has lineage row.
- Export → import round-trips transcript and metadata; import ignores attacker-controlled session id.
- Transcript downloads as valid Markdown.
- Event cards render tool/reasoning/subagent; unknown kind falls back.
- Reload during `running` run shows recovery banner + partial output.

## Slice order (one commit per slice)

1. Schema migration + types + `NormalizeChatRunKind` (TDD).
2. List filter/search + PATCH pinned/project.
3. Project CRUD.
4. Tag extraction + filter + `tags` in list.
5. Duplicate.
6. Fork + lineage endpoint.
7. Export + transcript.
8. Import.
9. `api.ts` types/functions.
10. Session menu UI (dup/fork/export/import/transcript).
11. Search + filter rail UI.
12. Event cards renderer.
13. Recovery banner.
14. Verification sweep + `plan.md` ticks.