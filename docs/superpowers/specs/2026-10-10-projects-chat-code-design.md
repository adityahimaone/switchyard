# Projects — chat-to-code (design)

Status: proposed. Supersedes nothing. Extends the existing chat + `chat_projects` model.

## Problem

Chat today is Hermes-only (`validChatAgents = {"hermes"}`), unbound to a workspace,
and model selection is free-form. We want a **Project**: a named container bound to
one of the registered workspaces that lets the user *code directly from chat* — no
Kanban card, no board flow — with a selectable **execution** backend:

- `hermes` — the existing local/remote Hermes chat path, model selectable.
- `dsh` (DeepSeek Harness) — remote executor; **model not selectable** (comes from
  the DSH profile `agent-default-model`); user picks the **decision** (permission /
  sandbox preset).
- `commandcode` — remote executor; **model not selectable**; user picks the
  **mode** (`plan` / `standard` / `accept-edits` / `yolo`).

Projects are limited to workspaces already present in `~/.hermes/workspaces.json`
(the Workspaces page source of truth). No new workspace registry.

## Why the executor knobs matter (verified against the live Mac)

`dsh --profile headless` (v0.2.1-alpha.2) accepts only `--json` and `--session-id`.
Sandbox + approval come from **environment / profile composition**, read in
`@deepseek-ai/dsh-base/cordis.patch.yml`:

```yaml
- id: sandbox-policy
  config:
    mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
- id: approval
  config:
    policy: !!js "(process.env.DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'"
- id: permission
  config:
    presets:
      read-only:          { sandbox: read-only,          approval: ask }
      workspace-write:    { sandbox: workspace-write,    approval: ask }
      danger-full-access: { sandbox: danger-full-access, approval: never }
```

So the user-selectable **decision** for DSH is exactly `DSH_PERMISSION_MODE ∈
{read-only, workspace-write, danger-full-access}`. node-agent does **not** set it
today, so DSH runs pin `workspace-write` + `ask`.

**Fail-closed caveat (must be handled):** `dsh-user-approval` ships **no answerer**,
and the headless bundle mounts none. Under `ask`, any approval-gated action resolves
`unavailable` and the run fails closed. `danger-full-access` maps approval to `never`
and runs unattended. Options in Slice 3 below.

`commandcode` (`cmdc` v1.79.2) exposes the mode knobs directly on the CLI:
`--plan`, `--permission-mode <standard|plan|accept-edits|yolo>`, `--accept-edits`,
`--yolo`. Current node-agent always passes `--yolo`.

## Data model (chat.db)

Existing: `chat_projects(id,name,color,created_at)`, `chat_sessions.project_id`.

Add:

- `chat_projects.workspace   TEXT DEFAULT ''`   — validated path from workspaces.json
- `chat_projects.executor    TEXT DEFAULT 'hermes'` — hermes|dsh|commandcode
- `chat_projects.options     TEXT DEFAULT '{}'` — executor option blob (JSON)
- `chat_projects.description TEXT DEFAULT ''`
- `chat_sessions.executor_options   TEXT DEFAULT '{}'` — snapshot at session create
- `chat_sessions.executor_session_id TEXT DEFAULT ''` — resumable id for dsh/cc

`hermes_session_id` stays hermes-specific. `executor_session_id` is the generic
continuation id for non-hermes executors (mirrors the Kanban harness binding).

## API surface (new / changed)

| Method | Path | Change |
|---|---|---|
| GET | `/api/chat/projects` | unchanged shape, +new fields |
| POST | `/api/chat/projects` | body gains `workspace,executor,options,description` |
| PATCH | `/api/chat/projects/{id}` | same fields optional |
| POST | `/api/chat/sessions` | body gains `executor_options` |
| POST | `/api/chat/sessions/{id}/messages` | body gains `executor_options` |

Every new route must be added to `expectedRoutes` in
`cmd/server/routes_inventory_test.go` (the gate fails otherwise).

## Slices

### Slice 1 — backend: project ↔ workspace/executor binding
Files: `internal/kanban/chat.go`, `internal/kanban/chat_workspace.go`,
`cmd/server/chat_routes.go`, `internal/kanban/chat_workspace_test.go`.

### Slice 2 — chat executors (hermes | dsh | commandcode)
Files: `internal/kanban/chat_exec.go`, `internal/kanban/chat.go`,
`internal/kanban/chat_validation.go`, `web/src/api.ts`.

### Slice 3 — node-agent: DSH decision + CommandCode mode
Files: `~/apps/node-agent/internal/transport/transport.go`,
`~/apps/node-agent/cmd/agent/main.go`,
`internal/kanban/nodeagent.go` (request mirror).

### Slice 4 — frontend: Projects page + composer executor/options
Files: `web/src/features/projects/*` (new), `web/src/features/chat/ChatPage.tsx`,
`web/src/components/chat/composer.tsx`, `web/src/api.ts`.

### Slice 5 — routing + nav
Files: `web/src/lib/sidebar-preferences.ts`, `web/src/lib/routes.ts`,
`web/src/components/app-shared.tsx`, `web/src/App.tsx`.

## Verification

- `go test ./...`, `go vet ./...`, `go build -o /tmp/kb ./cmd/server`
- `pnpm --dir web build`
- node-agent: `go test ./...`, `GOOS=darwin GOARCH=arm64 go build -o /tmp/node-agent ./cmd/agent`
- routes inventory updated
- live: project on a remote workspace; hermes turn (model selectable) → dsh turn
  (model hidden, permission select, provenance `executor=dsh`) → commandcode turn
  (mode select, provenance `executor=commandcode`); assert executor_session_id
  persisted and a 2nd turn resumes.

## Pitfalls

- DSH headless `ask` fails closed (no answerer). Default the DSH decision select to
  `danger-full-access`, or apply the `--patch` overlay in Slice 3 to pin approval
  `never` while keeping the chosen sandbox.
- DSH plan mode is a session mode entered with `/plan`; headless has no command
  parser, so plan mode is **not** offered for DSH. It is a CommandCode knob only.
- Do not reuse `hermes_session_id` for dsh/cc — separate column.
- `CreateChatProject` signature changes; update its caller and the test in the same
  commit or the build breaks.
