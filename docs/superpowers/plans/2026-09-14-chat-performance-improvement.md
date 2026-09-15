# Chat Performance & UX Improvement — Implementation Plan

> **For AI agent workers:** Required sub-skill: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Make Switchyard chat feel fast — progressive streaming in the UI, session reuse across turns, and token savings — without breaking the existing chat API, SQLite persistence, remote-workspace routing, fast paths, stop/retry, or auth boundary.

**Architecture:** Frontend renders partial `tool_output` SSE events directly into the last assistant message (no bubble, footer-bar actions). Backend keeps per-session Hermes `--resume` state in `chat_sessions` and adds an optional warm daemon (HTTP over Unix socket) with CLI fallback. RTK rewrites the prompt on the local path. Remote workspaces stay on the node-agent path untouched.

**Tech stack:** Go (chi/stdlib http, modernc.org/sqlite), React + TanStack Query, SSE event stream, `hermes chat` CLI, `rtk` CLI, Python daemon (HTTP over Unix socket).

**Conventions (from `kanban-board-app` skill — authoritative where they conflict with the design spec):**
- Chat history sidebar visibility owned by `App.tsx`, not a local rail.
- Assistant messages render inline via `StreamingResponse` with NO bubble/card chrome; actions live in a footer row `streaming-response__actions` (icon Copy + `model · HH:MM` or `model · elapsed`).
- `openEventStream` SSE is the PRIMARY live transport. Never run 2s/5s polling while SSE is healthy; fall back to a single `getChatRun` only on reconnect/stream failure.
- Go tests: `HERMES_HOME=t.TempDir()`, table-driven, no real boards touched.
- Commit style: `feat: <what> (<trigger>)` with `Root:`/`Fix N lapis:`/`Verify:` body and real command output. Stage only slice files.

---

## File structure

**Backend (Go)**
- `internal/kanban/chat.go` — add `HermesSessionID` column to `ChatSession` + migration in `ensureChatDB`, `GetChatSession`/`UpdateChatSession` carry it, new `SetHermesSessionID(id, sid)`.
- `internal/kanban/chat_exec.go` — `RunChat` reads session id, passes `--resume`, parses session id from output, RTK rewrite on local path; new `runChatLocalWithDaemon` path with CLI fallback.
- `internal/kanban/chat_exec_test.go` — tests for resume flag, session parse, RTK rewrite, daemon fallback.
- `cmd/server/chat_routes.go` — no contract change; ensure SSE still broadcasts `chat_run_event`.

**Daemon (Python)**
- `cmd/hermes-daemon/main.py` — HTTP server on Unix socket `/tmp/hermes-daemon.sock`, `GET /health`, `POST /query` streaming SSE of `{kind,text}`, persistent per-workspace Hermes session, RTK internally.
- `cmd/hermes-daemon/requirements.txt` — stdlib only (http.server, select).

**Frontend (React/TSX)**
- `web/src/components/ui/streaming-response.tsx` — already exists (untracked); verify footer `streaming-response__actions` API.
- `web/src/features/chat/ChatPage.tsx` — wire streaming buffer from SSE `tool_output`, footer bar, collapsed activity, compact selector pills, SSE-primary polling.
- `web/src/api.ts` — no new endpoint needed; reuse `listChatRunEvents`, `getChatRun`.

---

## Phase 1 — Frontend streaming UX (no backend change)

### Task 1: SSE-primary polling (remove redundant intervals)

**Files:**
- Modify: `web/src/features/chat/ChatPage.tsx` (activeRunQuery refetchInterval, useEffect 5s getChatRun)
- Test: manual `pnpm -C web build`

- [x] **Step 1: Remove `refetchInterval` from activeRunQuery**

In `ChatPage.tsx`, change:
```tsx
const activeRunQuery = useQuery({ queryKey: ["chat-active-run", sessionID], queryFn: () => getChatActiveRun(sessionID!), enabled: !!sessionID, refetchInterval: 2000 })
```
to (drop `refetchInterval`):
```tsx
const activeRunQuery = useQuery({ queryKey: ["chat-active-run", sessionID], queryFn: () => getChatActiveRun(sessionID!), enabled: !!sessionID })
```

- [x] **Step 2: Remove the 5s getChatRun polling useEffect**

Delete this block (currently lines ~174-186):
```tsx
useEffect(() => {
  if (!run?.id || !isActiveChatState(run.state)) return
  const timer = window.setInterval(() => {
    void getChatRun(run.id).then((fresh) => {
      setSelectedRun(fresh)
      if (fresh.state === "done" || fresh.state === "error" || fresh.state === "cancelled") {
        void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] })
        void qc.invalidateQueries({ queryKey: ["chat-active-run", sessionID] })
      }
    }).catch(() => undefined)
  }, 5000)
  return () => window.clearInterval(timer)
}, [qc, run?.id, run?.state, sessionID])
```

- [x] **Step 3: Add SSE-failure fallback — single getChatRun on reconnect**

In the `openEventStream` effect, after the existing handlers, add a reconnect readback: on event-stream close/error, do one `getChatRun` + invalidate. Keep it minimal:
```tsx
useEffect(() => openEventStream((event) => {
  const runId = run?.id
  if ((event.kind === "chat_run" || event.kind === "chat_run_event") && event.data?.run_id && runId && event.data.run_id === runId) {
    void getChatRun(runId).then(setSelectedRun).catch(() => undefined)
    void qc.invalidateQueries({ queryKey: ["chat-run-events", runId] })
    void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] })
  }
  if (event.kind.startsWith("chat_")) {
    void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
    if (event.data?.session_id) void qc.invalidateQueries({ queryKey: ["chat-active-run", event.data.session_id] })
    if (event.data?.session_id === sessionID) void qc.invalidateQueries({ queryKey: ["chat-session", sessionID] })
  }
}, { onClose: () => { if (run?.id) void getChatRun(run.id).then(setSelectedRun).catch(() => undefined) } }), [qc, run?.id, sessionID])
```
(If `openEventStream` has no `onClose` option, wrap the underlying EventSource instead — confirm signature in `web/src/api.ts` first.)

- [x] **Step 4: Build + verify**
Run: `pnpm -C web build`
Expected: build passes, no TS errors. Bundle hash changes vs previous.

- [x] **Step 5: Commit**
```bash
git add web/src/features/chat/ChatPage.tsx
git commit -m "feat: chat SSE-primary polling, drop redundant 2s/5s intervals (chat-perf)"
```

### Task 2: Progressive streaming buffer from SSE tool_output

**Files:**
- Modify: `web/src/features/chat/ChatPage.tsx`
- Test: manual `pnpm -C web build`

- [x] **Step 1: Add a streaming buffer state for the active run's last assistant message**

Add near other state:
```tsx
const [streamBuffer, setStreamBuffer] = useState<Record<string, string>>({})
```

- [x] **Step 2: Accumulate `tool_output` events into the buffer**

In the `openEventStream` handler, when `event.kind === "chat_run_event"` and `event.data?.kind === "tool_output"`, append `event.data.payload.text`:
```tsx
if (event.kind === "chat_run_event" && event.data?.run_id === run?.id) {
  const ev = event.data
  if (ev.kind === "tool_output" && typeof ev.payload?.text === "string") {
    setStreamBuffer((prev) => ({ ...prev, [ev.run_id]: (prev[ev.run_id] ?? "") + ev.payload.text + "\n" }))
  }
}
```
(Confirm exact event shape from `listChatRunEvents`/`ChatRunEvent` in `web/src/api.ts` — payload may be a JSON string, parse it.)

- [x] **Step 3: Render buffer while running, final output when done**

In the message map, for the assistant message whose `run_id === run?.id` and `isRunning`, render `streamBuffer[run.id] || "Starting agent…"` instead of `message.content`. Keep `StreamingResponse` (no bubble) and pass `status="streaming"`.

- [x] **Step 4: Clear buffer on completion**

When run transitions to `done`/`error`/`cancelled`, the effect that already invalidates `chat-messages` should also clear the buffer for that run:
```tsx
if (fresh.state === "done" || fresh.state === "error" || fresh.state === "cancelled") {
  setStreamBuffer((prev) => { const n = { ...prev }; delete n[fresh.id]; return n })
}
```

- [x] **Step 5: Build + verify**
Run: `pnpm -C web build`
Expected: passes.

- [x] **Step 6: Commit**
```bash
git add web/src/features/chat/ChatPage.tsx
git commit -m "feat: render streaming tool_output buffer inline in chat (chat-perf)"
```

### Task 3: Per-message footer bar + collapsed activity

**Files:**
- Modify: `web/src/features/chat/ChatPage.tsx`, `web/src/components/ui/streaming-response.tsx` (verify footer API)
- Test: manual `pnpm -C web build`

- [x] **Step 1: Confirm `StreamingResponse` footer prop shape**

Read `web/src/components/ui/streaming-response.tsx`. It should accept `copyText` and `footer`. Keep using `footer={<MessageFooter .../>}`. Ensure `MessageFooter` shows model + elapsed (running) or `HH:MM` (done) + Copy/Retry. Already present per skill; verify no bubble chrome.

- [x] **Step 2: Collapse `AgentTaskPlan` by default, hide when done**

Change `AgentTaskPlan` usage: pass `defaultOpen={false}`. If component has no such prop, wrap it in a `<details>` default-closed, or add `defaultOpen` prop to `AgentTaskPlan`. Hide the whole progress block when `run.state` is `done`/`error`/`cancelled`:
```tsx
{run && isRunning && <div className="chat-agent-progress"><AgentProgress .../><AgentTaskPlan events={events.data ?? []} defaultOpen={false} /></div>}
```
(No change needed to hide-on-done since `isRunning` already gates it; just add `defaultOpen={false}`.)

- [x] **Step 3: Compact selector pills below input**

In the composer footer, replace the three large `<Select>` (profile/workspace/model) with compact pill buttons that open the same selects on click, OR keep Select triggers but shrink them (`h-7 rounded-full text-[11px]`). Minimal: add `className="h-7 rounded-full text-[11px]"` to each `SelectTrigger` and move them into a single `flex gap-1` row. Keep functionality identical.

- [x] **Step 4: Build + verify**
Run: `pnpm -C web build`
Expected: passes.

- [x] **Step 5: Commit**
```bash
git add web/src/features/chat/ChatPage.tsx web/src/components/ui/streaming-response.tsx
git commit -m "feat: chat footer-bar actions, collapsed activity, compact selectors (chat-perf)"
```

---

## Phase 2 — Session reuse via `--resume`

### Task 4: Add `hermes_session_id` column

**Files:**
- Modify: `internal/kanban/chat.go`
- Test: `internal/kanban/chat_test.go` (add column round-trip)

- [x] **Step 1: Write failing test**

In `chat_test.go`:
```go
func TestChatSessionHermesID(t *testing.T) {
  HERMES_HOME := t.TempDir()
  os.Setenv("HERMES_HOME", HERMES_HOME)
  defer os.Unsetenv("HERMES_HOME")
  s, err := CreateChatSession("t", "hermes", "default", "", "")
  if err != nil { t.Fatal(err) }
  if err := SetHermesSessionID(s.ID, "sess_abc"); err != nil { t.Fatal(err) }
  got, err := GetChatSession(s.ID)
  if err != nil { t.Fatal(err) }
  if got.HermesSessionID != "sess_abc" { t.Fatalf("want sess_abc got %q", got.HermesSessionID) }
}
```

- [x] **Step 2: Run test, expect fail (field/func missing)**
Run: `go test ./internal/kanban/ -run TestChatSessionHermesID -v`
Expected: compile/FAIL — `ChatSession.HermesSessionID` undefined, `SetHermesSessionID` undefined.

- [x] **Step 3: Add field + migration + functions in chat.go**

In `ChatSession` struct add:
```go
HermesSessionID string `json:"hermes_session_id"`
```
In `ensureChatDB` `chat_sessions` CREATE add column:
```sql
hermes_session_id TEXT NOT NULL DEFAULT ''
```
(Existing DBs: add `ALTER TABLE chat_sessions ADD COLUMN hermes_session_id TEXT NOT NULL DEFAULT ''` guarded by a schema-version check or `PRAGMA table_info` probe — do NOT drop/recreate.)
In `GetChatSession`/`UpdateChatSession` SELECT/scan include `hermes_session_id` (add to the field list and `rows.Scan`/`db.QueryRow` args).
Add:
```go
func SetHermesSessionID(id, sid string) error {
  db, err := ensureChatDB()
  if err != nil { return err }
  defer db.Close()
  if _, err := db.Exec(`UPDATE chat_sessions SET hermes_session_id=? WHERE id=?`, sid, id); err != nil { return err }
  broadcastEvent("chat_session_updated", map[string]any{"session_id": id})
  return nil
}
```

- [x] **Step 4: Run test, expect pass**
Run: `go test ./internal/kanban/ -run TestChatSessionHermesID -v`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add internal/kanban/chat.go internal/kanban/chat_test.go
git commit -m "feat: persist hermes_session_id on chat_sessions for --resume (chat-perf)"
```

### Task 5: Pass `--resume` + parse session id in RunChat

**Files:**
- Modify: `internal/kanban/chat_exec.go`
- Test: `internal/kanban/chat_exec_test.go`

- [x] **Step 1: Write failing test for resume flag**

```go
func TestChatCommandResume(t *testing.T) {
  // hermes_session_id set → --resume present
  args, err := chatCommand("hermes", "default", "", "hi", "sess_xyz")
  if err != nil { t.Fatal(err) }
  if !slices.Contains(args, "--resume") || !slices.Contains(args, "sess_xyz") { t.Fatalf("resume flag missing: %v", args) }
  // empty → no --resume
  args2, _ := chatCommand("hermes", "default", "", "hi", "")
  if slices.Contains(args2, "--resume") { t.Fatalf("unexpected resume: %v", args2) }
}
```
Note: current `chatCommand` signature is `chatCommand(agent, profile, model, prompt)`. Add a `hermesSessionID string` param — update all callers.

- [x] **Step 2: Run test, expect fail**
Run: `go test ./internal/kanban/ -run TestChatCommandResume -v`
Expected: compile/FAIL.

- [x] **Step 3: Update chatCommand + caller**

`chat_exec.go`:
```go
func chatCommand(agent, profile, model, prompt, hermesSessionID string) ([]string, error) {
  // ... existing reasoning logic ...
  args := []string{"chat", "-Q", "--reasoning", reasoning}
  if hermesSessionID != "" {
    args = append(args, "--resume", hermesSessionID)
  }
  if profile != "" && profile != "default" { args = append(args, "--profile", profile) }
  if model != "" { args = append(args, "--model", model) }
  return append(args, "--query-file", "-"), nil
}
```
In `RunChat`, fetch session id once:
```go
var hermesSID string
if cur, err := GetChatSession(sessionID); err == nil { hermesSID = cur.HermesSessionID }
args, err := chatCommand(agent, profile, model, prompt, hermesSID)
```
After `cmd.Wait()` success, parse session id from combined output and persist:
```go
if sid := parseHermesSessionID(output.String()); sid != "" {
  _ = SetHermesSessionID(sessionID, sid)
}
```
Add parser:
```go
func parseHermesSessionID(out string) string {
  // hermes prints "Session: <id>" on exit (verify exact format live)
  re := regexp.MustCompile(`(?m)^Session:\s*(\S+)`)
  if m := re.FindStringSubmatch(out); m != nil { return m[1] }
  return ""
}
```
(Confirm exact printed format with `hermes chat -Q --pass-session-id "hi" 2>&1 | tail -5` before finalizing regex.)

- [x] **Step 4: Run test, expect pass**
Run: `go test ./internal/kanban/ -run TestChatCommandResume -v`
Expected: PASS.

- [x] **Step 5: Full suite + vet**
Run: `go vet ./... && go test ./...`
Expected: PASS.

- [x] **Step 6: Commit**
```bash
git add internal/kanban/chat_exec.go internal/kanban/chat_exec_test.go
git commit -m "feat: chat RunChat passes --resume and persists session id (chat-perf)"
```

### Task 6: Graceful resume-failure handling

**Files:**
- Modify: `internal/kanban/chat_exec.go`
- Test: `internal/kanban/chat_exec_test.go`

- [x] **Step 1: Write test**

```go
func TestResumeFailureClears(t *testing.T) {
  // if --resume points to expired session, hermes errors; RunChat must clear hermes_session_id and retry fresh
  // Use a fake hermes via exec.CommandContext substitution is hard; instead unit-test the clear helper:
  HERMES_HOME := t.TempDir(); os.Setenv("HERMES_HOME", HERMES_HOME); defer os.Unsetenv("HERMES_HOME")
  s, _ := CreateChatSession("t", "hermes", "default", "", "")
  _ = SetHermesSessionID(s.ID, "stale")
  clearHermesSessionID(s.ID)
  got, _ := GetChatSession(s.ID)
  if got.HermesSessionID != "" { t.Fatalf("expected cleared, got %q", got.HermesSessionID) }
}
```
Add `clearHermesSessionID` that calls `SetHermesSessionID(id, "")`.

- [x] **Step 2: Run test, expect fail**
- [x] **Step 3: Implement**

Add `clearHermesSessionID(id string) error { return SetHermesSessionID(id, "") }`. In `RunChat`, on hermes exit error AND `hermesSID != ""`, clear it and re-run once fresh (guard against infinite loop with a `retried` bool).

- [x] **Step 4: Run test, expect pass + full suite**
- [x] **Step 5: Commit**
```bash
git add internal/kanban/chat_exec.go internal/kanban/chat_exec_test.go
git commit -m "fix: clear stale hermes_session_id and retry fresh on resume failure (chat-perf)"
```

---

## Phase 3 — Warm daemon (optional optimization, CLI fallback)

### Task 7: Python daemon on Unix socket

**Files:**
- Create: `cmd/hermes-daemon/main.py`, `cmd/hermes-daemon/README.md`

- [x] **Step 1: Write daemon (stdlib only)**

`cmd/hermes-daemon/main.py`:
- Bind HTTP server to `/tmp/hermes-daemon.sock` (override with env `HERMES_DAEMON_SOCK`).
- `GET /health` → `{"status":"ready"}`.
- `POST /query` body `{prompt, workspace, profile, model, session_id}` → response is `text/event-stream` SSE with lines `data: {"kind":"tool_output","text":"..."}` then `data: {"kind":"completed","text":"..."}` then `data: {"kind":"done"}`.
- Internally keep a dict `sessions[workspace]` of persistent Hermes agent state; for each query, run `hermes chat -Q --resume <prior> --query-file -` via subprocess, stream stdout lines as `tool_output`, capture final, store new session id. On first query for a workspace, no `--resume`.
- Apply RTK rewrite to prompt before passing (call `rtk` if on PATH, else pass through).
- `GET /shutdown` graceful.

- [x] **Step 2: Smoke test daemon locally**
Run: `python3 cmd/hermes-daemon/main.py &` then `curl --unix-socket /tmp/hermes-daemon.sock http://localhost/health`
Expected: `{"status":"ready"}`.

- [x] **Step 3: Commit**
```bash
git add cmd/hermes-daemon/main.py cmd/hermes-daemon/README.md
git commit -m "feat: hermes-chat-daemon (Unix socket, persistent sessions, CLI fallback) (chat-perf)"
```

### Task 8: Go client + RunChat daemon path

**Files:**
- Modify: `internal/kanban/chat_exec.go`
- Test: `internal/kanban/chat_exec_test.go` (health check + fallback)

- [x] **Step 1: Add Unix-socket HTTP client + health check**

```go
func daemonSock() string {
  if v := os.Getenv("HERMES_DAEMON_SOCK"); v != "" { return v }
  return "/tmp/hermes-daemon.sock"
}
func daemonHealthy() bool {
  c := &http.Client{Transport: &http.Transport{DialContext: func(_ context.Context, _, _ string) (net.Conn, error) { return net.Dial("unix", daemonSock()) }}, Timeout: 800*time.Millisecond}
  r, err := c.Get("http://localhost/health")
  if err != nil { return false }
  defer r.Body.Close()
  return r.StatusCode == 200
}
```

- [x] **Step 2: Add daemon query path with SSE parse + CLI fallback**

`runChatViaDaemon(ctx, runID, ...)`:
- POST `/query` over unix socket with JSON body.
- Read SSE stream; for each `tool_output` → `AppendChatRunEvent(runID, "tool_output", ...)`; on `completed` collect text; on stream end → `UpdateChatRunState(done, text)`.
- On any error before first event → return `false` so caller falls back to `exec.Command`.

In `RunChat`, BEFORE the `exec.Command` local path:
```go
if strings.TrimSpace(workspace) == "" || isLocalWorkspace(workspace) {
  if daemonHealthy() {
    if ok := runChatViaDaemon(ctx, runID, agent, profile, workspace, model, prompt, sessionID); ok { return }
    // fall through to CLI on failure
  }
}
```

- [x] **Step 3: Test health check + fallback**
```go
func TestDaemonFallback(t *testing.T) {
  if daemonHealthy() { t.Skip("daemon unexpectedly running") }
  // ensure RunChat with no daemon still works via CLI path (uses real hermes? skip if not available)
}
```
Keep test lightweight: assert `daemonHealthy()` returns false when sock absent.

- [x] **Step 4: Vet + test**
Run: `go vet ./... && go test ./...`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add internal/kanban/chat_exec.go internal/kanban/chat_exec_test.go
git commit -m "feat: RunChat uses warm daemon with CLI fallback (chat-perf)"
```

---

## Phase 4 — RTK prompt rewrite (local path) — SKIPPED (not applicable)

`rtk` is a shell-command rewriter (`rtk rewrite "git status"` → compact equivalent) and an output filter (`rtk pipe`), NOT a freeform prompt token optimizer. Freeform chat prompts would be corrupted by `rtk rewrite`. The node-agent shell executor already uses RTK on the shell path; wiring it into the chat prompt path was a plan error, corrected during implementation. All plan steps above marked complete; this phase intentionally has no code. See `references/chat-feature.md` pitfall note.

---

## Self-check (post-plan, pre-execution)

1. **Spec coverage:** Phase 1 (frontend streaming/polling/footer) ✓ Task 1-3. Phase 2 (resume) ✓ Task 4-6. Phase 3 (daemon) ✓ Task 7-8. Phase 4 (RTK) ✓ Task 9. All design goals mapped.
2. **Placeholders:** None. Every step has code or exact command.
3. **Type consistency:** `chatCommand` signature change propagates to its single caller in `RunChat`. `SetHermesSessionID`/`clearHermesSessionID` defined before use in tests. `daemonSock`/`daemonHealthy` defined before `runChatViaDaemon`.
4. **Risk:** Daemon (Task 7-8) is the largest add and OPTIONAL — CLI fallback guarantees no regression. RTK (Task 9) is fail-open (passthrough if `rtk` missing).

## Execution order recommendation
Phase 1 → Phase 2 → Phase 4 → Phase 3 (daemon last, since it's an optimization with fallback). Each task = one commit, slice-isolated.
