# plan.md — kanban-board (Vite FE + Go BE, opsi A)

> **Status: implemented.** This file is the original build plan, kept for
> history. Two details below are stale and are annotated where they appear;
> everything else still describes the shipped system. For the current security
> model see [docs/security.md](docs/security.md).
>
> - The HTTP layer is `net/http` with the stdlib `ServeMux`, **not chi**.
> - Auth is **enabled**, not "none" — see the annotated line in §1.

Repo: `~/apps/kanban-board`, deploy VPS :8790, share `~/.hermes/kanban/boards/<slug>/kanban.db`.

## Scope (simple dulu)

1. **BE Go** (`cmd/server`) — `net/http` (stdlib `ServeMux`, **not chi**), `modernc.org/sqlite` (pure Go, no cgo), port 8790
   - `GET /api/boards` — list dari `~/.hermes/kanban/boards/*/board.json`
   - `GET /api/boards/{slug}/tasks` — read tasks (id, title, body, status, priority, workspace_path, assignee, created_at, completed_at, result, consecutive_failures)
   - `POST /api/boards/{slug}/tasks` — create (title, body, workspace_path, priority, status=todo|triage)
   - `PATCH /api/boards/{slug}/tasks/{id}/status` — status transition (todo→ready→running→done|blocked|archived) + audit ke `task_events`
   - `DELETE /api/boards/{slug}/tasks/{id}` — archive (soft)
   - `GET /api/workspaces` — dari `~/.hermes/workspaces.json` (dropdown)
   - `GET /api/nodes` — proxy `:8788/health` (node-agent status)
   - `GET /api/boards/{slug}/tasks/{id}/events` — task_events tail (history card)
   - Auth: **enabled** (this line is stale — the plan originally shipped with no auth).
     A shared password guards every `/api/*` route except `/api/auth/*`, enforced
     by `authHandler` in `cmd/server/main.go`. Passwords are argon2id; login is
     rate limited; the session cookie is `HttpOnly`/`SameSite=Lax`/`Secure` over
     HTTPS. nginx proxies TLS in front of this server. See
     [docs/security.md](docs/security.md).

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
- [x] Phase 3 authenticated live API smoke: login, provider redaction, cron read, notification read-safe empty state, manifest/service-worker markers
- [ ] Phase 3 browser-rendered acceptance (browser tool blocks private local URL)
- [x] Phase 3 — Operations and Trust: local implementation + authenticated API acceptance complete
- [ ] Phase 3 — browser acceptance closeout (requires non-private authenticated URL)
- [x] Phase 4 design approved: constrained ecosystem registry, no arbitrary plugin execution
- [x] Phase 4 backend: profile-scoped MCP and extension registries, validation, atomic writes, fail-closed gateway status
- [x] Phase 4 frontend: Ecosystem page, registry CRUD, capability allowlist display
- [x] Phase 4 isolated registry lifecycle tests + read-only live smoke: validation, profile isolation, gateway disabled, manifest/service worker
- [ ] Phase 4 browser-rendered acceptance (browser provider unavailable; public HTTPS returns `200` via curl)
- [ ] Phase 4 MCP invocation, extension execution, gateway sessions: separate auth/transport design required before implementation

## DSH Health Overview (2026-09-24)

Design: `docs/superpowers/specs/2026-09-24-dsh-health-overview-design.md`

- [ ] Node-agent: `dsh --version` + `--dump-config` probe, cached, TTL env `DSH_HEALTH_INTERVAL_SECONDS` (default 60), `refresh_dsh=1` bypass
- [ ] Node-agent: dsh_health result shape + error taxonomy (no_binary / bad_profile / timeout)
- [ ] VPS: extend `GET /api/nodes` with dsh_health, forward refresh flag to node-agents
- [ ] Frontend: NodeFleetCard DSH sub-block (green/amber/red) + Check DSH button
- [ ] Go unit tests: version parse, config parse, cache TTL, force bypass
- [ ] Verify: frontend build, go test ./..., go vet ./..., git diff --check
- [ ] Deploy: VPS binary + Mac node-agent (darwin arm64, launchd restart)
- [ ] Live verify: Mac node shows dsh_health.ok=true with real version/model

## Active roadmap — Projects (chat-to-code)

Design: `docs/superpowers/specs/2026-10-10-projects-chat-code-design.md`

A Project = named container bound to one registered workspace, holding chats that
code directly (no Kanban flow). Chat executor selectable: `hermes` (model free) |
`dsh` (model locked, user picks decision/permission preset) | `commandcode` (model
locked, user picks mode). Projects limited to `~/.hermes/workspaces.json` paths.

Verified on live Mac: `dsh --profile headless` has no approval flag; sandbox+approval
come from env `DSH_PERMISSION_MODE` (read-only|workspace-write|danger-full-access) in
`@deepseek-ai/dsh-base/cordis.patch.yml`. node-agent sets no DSH_PERMISSION_MODE today
→ pins workspace-write+ask, and headless ships no approval answerer → `ask` fails
closed. `cmdc` exposes `--plan` / `--permission-mode <standard|plan|accept-edits|yolo>`
/ `--yolo`.

- [x] Slice 1 — backend: `chat_projects` gains `workspace/executor/options/description`; `chat_sessions` gains `executor_options/executor_session_id`; project CRUD validates workspace against `ListWorkspaces()` and executor against `{hermes,dsh,commandcode}`; existing `/api/chat/projects` routes reused, so `routes_inventory_test.go` needs no new entry
- [x] Slice 2 — chat executors: widen `validChatAgents`; `RunChat` branches non-hermes to `runChatViaExecutor` (remote dispatch with executor + options + `executor_session_id` continuation)
- [x] Slice 3 — node-agent: `DispatchRequest`/`NodeDispatchRequest` gain `dsh_permission_mode` + `commandcode_mode`; dsh sets `DSH_PERMISSION_MODE`; `commandCodeArgs` honours `plan`/`standard`/`accept-edits`/`yolo`
- [x] Slice 4 — frontend: `features/projects/*` page + create dialog; composer executor select; model select disabled when executor≠hermes; options select (dsh decision / cc mode)
- [x] Slice 5 — routing + nav: `Page` += `projects`; `routes.ts` `/projects` + `/projects/:id`; nav manifest row; `App.tsx` lazy route
- [x] Verify: `go test ./...`, `go vet ./...`, `go build ./cmd/server`, `pnpm --dir web build`, node-agent `GOOS=darwin GOARrm64 go build ./cmd/agent`
- [ ] Live: project on remote workspace → hermes turn → dsh turn (provenance executor=dsh) → commandcode turn (provenance executor=commandcode); 2nd turn resumes same executor session

### Change map (file → change)

**`internal/kanban/chat.go`** — schema + structs

Add to the `ensureChatDB` stmt list (and to the fresh `CREATE TABLE chat_projects`):

```go
`ALTER TABLE chat_projects ADD COLUMN workspace TEXT NOT NULL DEFAULT ''`,
`ALTER TABLE chat_projects ADD COLUMN executor TEXT NOT NULL DEFAULT 'hermes'`,
`ALTER TABLE chat_projects ADD COLUMN options TEXT NOT NULL DEFAULT '{}'`,
`ALTER TABLE chat_projects ADD COLUMN description TEXT NOT NULL DEFAULT ''`,
`ALTER TABLE chat_sessions ADD COLUMN executor_options TEXT NOT NULL DEFAULT '{}'`,
`ALTER TABLE chat_sessions ADD COLUMN executor_session_id TEXT NOT NULL DEFAULT ''`,
```

Widen agents (chat.go):

```go
var validChatAgents = map[string]bool{"hermes": true, "dsh": true, "commandcode": true}
```

Add `ExecutorOptions`, `ExecutorSessionID` to `ChatSession`; `SetExecutorSessionID`
mirrors `SetHermesSessionID`. All session SELECTs (`ListChatSessions`,
`GetChatSession`, `UpdateChatSession`) must add the two columns to the list and
`Scan` args.

**`internal/kanban/chat_workspace.go`** — project CRUD

```go
type ChatProject struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Workspace   string `json:"workspace"`
	Executor    string `json:"executor"`
	Options     string `json:"options"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"created_at"`
}

var projectExecutors = map[string]bool{"hermes": true, "dsh": true, "commandcode": true}

func ValidateProjectWorkspace(path string) error {
	path = strings.TrimSpace(path)
	if path == "" { return fmt.Errorf("workspace required") }
	list, err := ListWorkspaces()
	if err != nil { return err }
	for _, w := range list { if w.Path == path { return nil } }
	return fmt.Errorf("workspace %q is not registered", path)
}
```

`CreateChatProject(name, color, workspace, executor, options, description string)` and
`UpdateChatProject` gain the same params; both call `ValidateProjectWorkspace` and
reject `executor` not in `projectExecutors`. Update the caller in
`cmd/server/chat_routes.go` and `chat_workspace_test.go` in the same commit.

**`internal/kanban/chat_exec.go`** — executor branch

`chatCommand` stays hermes-only. In `RunChat`, after the routing/confirmation block
and before the hermes daemon/CLI path:

```go
if agent != "hermes" {
	runChatViaExecutor(ctx, runID, agent, profile, workspace, model, prompt)
	return
}
```

```go
type chatExecutorOptions struct {
	DSHPermissionMode string `json:"permission_mode"`
	CommandCodeMode   string `json:"mode"`
}

func parseExecutorOptions(raw string) chatExecutorOptions {
	var o chatExecutorOptions
	_ = json.Unmarshal([]byte(raw), &o)
	return o
}

func runChatViaExecutor(ctx context.Context, runID, executor, profile, workspace, model, prompt string) {
	_ = AppendChatRunEvent(runID, "phase", `{"phase":"executor_resolved","label":"Resolved executor"}`)
	run, _ := GetChatRun(runID)
	var session *ChatSession
	if run != nil { session, _ = GetChatSession(run.SessionID) }
	opts := chatExecutorOptions{}
	if session != nil { opts = parseExecutorOptions(session.ExecutorOptions) }
	req := NodeDispatchRequest{
		TaskID: runID, Title: "Chat: " + chatTitleFromPrompt(prompt), Board: "default",
		Message: prompt, Workspace: workspace, Model: model, Provider: profile,
		Executor: executor, DSHPermissionMode: opts.DSHPermissionMode, CommandCodeMode: opts.CommandCodeMode,
	}
	if session != nil && session.ExecutorSessionID != "" {
		req.SessionContinuation = true
		ApplyHarnessIdentity(&req, executor, session.ExecutorSessionID)
	}
	res, err := DispatchRemoteWithProgress(req, RemoteDispatchWait(), func(chunk string) {
		appendChatProgressLines(runID, "", chunk)
	})
	if err != nil { _ = UpdateChatRunState(runID, "error", "", err.Error()); return }
	if res == nil || !res.Success {
		msg := "remote agent failed"
		if res != nil && res.Error != "" { msg = res.Error }
		_ = UpdateChatRunState(runID, "error", "", msg)
		return
	}
	if sid := firstNonEmpty(res.DSHSessionID, res.CommandCodeSessionID, res.SessionID); sid != "" && session != nil {
		_ = SetExecutorSessionID(session.ID, sid)
	}
	_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d,"executor":%q}`, len(res.Output), executor))
	_ = UpdateChatRunState(runID, "done", res.Output, "")
	if r, e := GetChatRun(runID); e == nil { _, _ = CreateChatMessage(r.SessionID, "assistant", res.Output, r.ID) }
}
```

Add `firstNonEmpty` helper (or inline). Non-hermes chat requires a remote workspace:
guard `if isLocalWorkspace(workspace) { error "execution executor requires a remote workspace" }`.

**`internal/kanban/nodeagent.go`** — request mirror

```go
DSHPermissionMode string `json:"dsh_permission_mode,omitempty"`
CommandCodeMode   string `json:"commandcode_mode,omitempty"`
```

**`~/apps/node-agent/internal/transport/transport.go`** — same two fields on `DispatchRequest`.

**`~/apps/node-agent/cmd/agent/main.go`** — executor knobs

dsh case, after `cmd.Env = dshCommandEnv()`:

```go
if mode := strings.TrimSpace(job.DSHPermissionMode); mode != "" {
	cmd.Env = append(cmd.Env, "DSH_PERMISSION_MODE="+mode)
}
```

commandcode:

```go
func commandCodeArgs(job transport.DispatchRequest, jsonOutput bool) []string {
	args := []string{"-p", "--skip-onboarding"}
	switch strings.TrimSpace(job.CommandCodeMode) {
	case "plan":
		args = append(args, "--plan")
	case "accept-edits":
		args = append(args, "--accept-edits")
	case "yolo", "":
		args = append(args, "--yolo")
	default: // standard
		args = append(args, "--permission-mode", "standard")
	}
	if jsonOutput {
		args = append(args, "--output-format", "json")
	} else {
		args = append(args, "--output-format", "text")
	}
	if sessionID := strings.TrimSpace(job.CommandCodeSessionID); sessionID != "" {
		args = append(args, "--resume", sessionID)
	}
	return args
}
```

**`web/src/api.ts`**

```ts
export type ChatAgent = "hermes" | "dsh" | "commandcode"
export interface ChatProject { id: string; name: string; color: string; workspace: string; executor: ChatAgent; options: string; description: string; created_at: number }
export function createChatProject(input: { name: string; color?: string; workspace: string; executor?: ChatAgent; options?: string; description?: string }) { return api<ChatProject>("/api/chat/projects", { method: "POST", body: JSON.stringify(input) }) }
export function updateChatProject(id: string, input: Partial<{ name: string; color: string; workspace: string; executor: ChatAgent; options: string; description: string }>) { return api<ChatProject>(`/api/chat/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }) }
```

`sendChatMessage` input gains `executor_options?: string`.

**`web/src/features/projects/ProjectsPage.tsx`** (new) — card grid of projects;
create/edit dialog with workspace `Select` (from `listWorkspaces()`), executor
`Select`, and executor-options `Select`; row opens `/projects/:id`.

**`web/src/features/chat/ChatPage.tsx`** — new optional props
`projectID?: string; projectWorkspace?: string; projectExecutor?: ChatAgent; projectOptions?: string`.
When `projectID` is set: lock `workspace` to `projectWorkspace`, default
`executor`/`options` from the project, send `executor_options` on messages.
Add local `executor` state; when `executor !== "hermes"` hide the model `Select` and
render the options `Select`:

```tsx
{executor === "hermes" ? (/* existing model Select */ null) : executor === "dsh" ? (
  <Select value={dshMode} onValueChange={setDshMode}>
    <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label="DSH decision"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="danger-full-access">Full access (auto-approve)</SelectItem>
      <SelectItem value="workspace-write">Workspace write</SelectItem>
      <SelectItem value="read-only">Read only</SelectItem>
    </SelectContent>
  </Select>
) : (
  <Select value={ccMode} onValueChange={setCcMode}>
    <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label="Command Code mode"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="yolo">Bypass (yolo)</SelectItem>
      <SelectItem value="plan">Plan mode</SelectItem>
      <SelectItem value="accept-edits">Accept edits</SelectItem>
      <SelectItem value="standard">Standard</SelectItem>
    </SelectContent>
  </Select>
)}
```

Default DSH decision to `danger-full-access` (see fail-closed caveat). Executor
`Select` in the same leading controls row: `hermes` / `DeepSeek Harness` / `Command Code`.

**`web/src/components/chat/composer.tsx`** — no signature change; the executor and
options selects ride in the existing `controls` slot.

**`web/src/lib/sidebar-preferences.ts`** — add `"projects"` to `Page`.
**`web/src/lib/routes.ts`** — add `"projects"` to `PAGES`; `parseRoute` →
`{ page: "projects", chatSessionID: second }` for `/projects/:id`; `pagePath` →
`/projects` and `/projects/<id>`.
**`web/src/components/app-shared.tsx`** — add `{ title: "Projects", page: "projects", icon: <FolderKanbanIcon /> }` to the Work group.
**`web/src/App.tsx`** — `lazy(() => import("./features/projects/ProjectsPage"))`, route state for project id, render `page === "projects"`.

**`cmd/server/routes_inventory_test.go`** — add every new/changed pattern to `expectedRoutes`.
