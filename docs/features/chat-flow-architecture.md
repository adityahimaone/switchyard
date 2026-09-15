# Chat Feature — Full Flow Documentation

> Auto-generated 2026-09-15. For brainstorming session with Claude.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  FE (ChatPage.tsx + api.ts)                                        │
│    Sidebar 280px + main 1fr + composer                              │
│    SSE-primary via /api/events/stream                               │
│    streamBuffer[runID] progressive rendering                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP + SSE
┌──────────────────────────────▼──────────────────────────────────────┐
│  API (cmd/server/chat_routes.go)                                    │
│    POST /api/chat/sessions/{id}/messages                            │
│      → CreateChatMessage (user)                                     │
│      → CreateChatRun (state=loading)                                │
│      → go RunChat(...)  // async goroutine                          │
│      → 202 response immediately                                     │
│    GET  /api/chat/runs/{id}/events                                  │
│    GET  /api/chat/sessions/{id}/active-run                          │
│    SSE /api/events/stream  (broadcastEvent for all state changes)   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  Executor (internal/kanban/chat_exec.go)                            │
│    RunChat(ctx, runID, agent, profile, workspace, model, prompt)    │
│                                                                     │
│    Step 1: UpdateChatRunState(runID, "running")                     │
│    Step 2: Fast-path check (greeting/time/today)                    │
│    Step 3: Remote workspace? → DispatchRemote via node-agent        │
│    Step 4: Local → daemon path OR CLI path                          │
│      ├─ daemonHealthy()?                                             │
│      │   └─ runChatViaDaemonRetry()                                 │
│      │       ├─ runChatViaDaemon() attempt 1                        │
│      │       │   POST /query → daemon SSE stream                    │
│      │       │   tool_output → AppendChatRunEvent                   │
│      │       │   completed → extract session_id, SetHermesSessionID │
│      │       └─ on failure + resume was active: Clear + retry once  │
│      └─ CLI fallback:                                                │
│          runHermesProcess("hermes chat -Q --resume <sid> ...")      │
│          Parse Session: <id> → SetHermesSessionID                    │
│          On resume failure: Clear + retry once                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  Daemon (cmd/hermes-daemon/main.py)                                 │
│    Unix socket /tmp/hermes-daemon.sock                              │
│    In-memory session map: switchyard_session_id → hermes session    │
│    POST /query:                                                     │
│      session_key = switchyard_session_id || session_id || workspace │
│      args = hermes chat -Q --resume <sid> --profile ... --model ... │
│      subprocess.Popen → communicate(prompt) → stdout                │
│      Parse Session: <id> → save to sessions dict                    │
│      SSE response: tool_output events + completed event             │
│      completed includes session_id so Go can persist per-room       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

DB: `~/.hermes/kanban/chat.db` (SQLite, WAL mode)

```sql
chat_sessions (
  id TEXT PK,           -- cs_<hex8>
  title TEXT,
  agent TEXT DEFAULT 'hermes',
  profile TEXT DEFAULT 'default',
  workspace TEXT DEFAULT '',
  model TEXT DEFAULT '',
  hermes_session_id TEXT DEFAULT '',  -- THE KEY FIELD for resume
  created_at INTEGER,   -- unix timestamp
  updated_at INTEGER,
  archived INTEGER DEFAULT 0
)

chat_messages (
  id TEXT PK,           -- cm_<hex8>
  session_id TEXT FK→chat_sessions.id,
  role TEXT,            -- user|assistant|system
  content TEXT,
  run_id TEXT,          -- links assistant message to its run
  created_at INTEGER
)

chat_runs (
  id TEXT PK,           -- cr_<hex8>
  session_id TEXT FK,
  message_id TEXT FK,
  agent/profile/workspace/model TEXT,
  state TEXT,           -- loading|running|done|error|cancelled
  prompt TEXT,
  output TEXT,
  error TEXT,
  started_at INTEGER,
  ended_at INTEGER
)

chat_run_events (
  id INTEGER PK AUTO,
  run_id TEXT FK,
  kind TEXT,            -- loading|spawned|tool_output|completed|error|cancelled|session_reset
  payload TEXT,         -- JSON string
  created_at INTEGER
)
```

---

## 3. State Machine

```
[User sends message]
        │
        ▼
  CreateChatMessage (role=user)
  CreateChatRun (state=loading)
        │
        ▼  (async goroutine)
  RunChat:
    UpdateChatRunState → "running"
    AppendChatRunEvent → "spawned"
        │
   ┌────┴────────────────────┐
   │                         │
   ▼                         ▼
 fast_path              hermes subprocess
 (greeting/time/today)  daemon or CLI
   │                         │
   ▼                    ┌────┴────┐
 "done"                 │         │
                        ▼         ▼
                   success    failure
                     │         │
                  "done"    was --resume?
                     │      yes → ClearSessionID + retry once
                     │         │
                     │    ┌────┴────┐
                     │    │         │
                     │    ▼         ▼
                     │  success   permanent fail
                     │    │         │
                     │  "done"   "error"
                     ▼
           SetHermesSessionID(sid)
           CreateChatMessage (role=assistant)
           broadcastEvent("chat_run", state="done")
```

States: `loading → running → done|error|cancelled`

---

## 4. Session Resume Flow (THE CRITICAL PATH)

This is where context continuity lives or dies.

### 4.1 First message in room

```
1. No hermes_session_id in chat_sessions yet
2. RunChat reads hermesSessionID = "" (from DB)
3. Daemon receives session_id="" in payload
4. Daemon runs: hermes chat -Q --reasoning minimal --query-file -
5. hermes creates NEW session internally, prints Session: 20260915_HHMMSS_XXXXXX
6. Daemon parses Session: line → sessions[switchyard_session_id] = new_id
7. Daemon returns completed event with session_id = new_id
8. Go parses completed event → SetHermesSessionID(switchyard_session_id, new_id)
9. DB now has hermes_session_id set for this room
```

### 4.2 Subsequent messages in same room

```
1. RunChat reads hermesSessionID from DB (e.g. "20260915_HHMMSS_XXXXXX")
2. Daemon receives session_id="20260915_HHMMSS_XXXXXX"
3. Daemon seeds sessions[switchyard_session_id] = "20260915_HHMMSS_XXXXXX"
4. Daemon runs: hermes chat -Q --resume 20260915_HHMMSS_XXXXXX --query-file -
5. hermes loads prior context, continues conversation
6. Same session_id returned → no change needed
```

### 4.3 Resume failure recovery

```
1. hermes exits non-zero (stale/deleted session)
2. Go detects failure:
   a. Daemon path: runChatViaDaemonRetry clears daemon session + retrys fresh
   b. CLI path: ClearHermesSessionID + retry without --resume
3. Room's hermes_session_id gets cleared → next message starts fresh
```

---

## 5. Frontend Data Flow

### 5.1 Component structure

```
ChatPage.tsx
  ├─ Sidebar (280px)
  │   ├─ Search input
  │   ├─ Session groups: Today/Yesterday/Prev7/Prev30/Older
  │   └─ Session cards: title + workspace + model
  │
  └─ Main
      ├─ Header: session title + Stop button (if running)
      ├─ Message list
      │   ├─ User messages: right-aligned bubble
      │   └─ Assistant messages: full-width StreamingResponse
      │       ├─ Markdown renderer (fenced code, inline code, bold)
      │       ├─ MessageFooter: model · elapsed · HH:MM
      │       └─ AgentProgress + AgentTaskPlan (collapsed, shows during run)
      └─ Composer
          ├─ Textarea (autosize, Enter=send, Shift+Enter=newline)
          ├─ Workspace select (local + SSH workspaces with live dot)
          ├─ Model select (from profiles + providers)
          ├─ Attach button (placeholder, injects [attach: name])
          └─ Command button (injects /)
```

### 5.2 Real-time update mechanism

```
SSE primary: EventSource /api/events/stream
  ├─ chat_run_event + kind=tool_output → accumulate into streamBuffer[runID]
  │   (progressive rendering, no polling, no full refresh per line)
  ├─ chat_run → fetch fresh ChatRun via getChatRun(runId)
  │   └─ on terminal state (done/error/cancelled): clear streamBuffer,
  │      invalidate chat-messages + chat-active-run queries
  └─ chat_session_* → invalidate sidebar session list + active session
```

### 5.3 Run per message (footer data)

```
messageRuns query: for each assistant message with run_id,
  fetch ChatRun via getChatRun(rid) → runMap[rid]
  footer shows: model · elapsed · clock time (HH:MM)
```

---

## 6. Daemon Architecture

File: `cmd/hermes-daemon/main.py`

- Unix socket at `/tmp/hermes-daemon.sock` (chmod 600)
- ThreadingMixIn UnixStreamServer (concurrent requests)
- In-memory session map: `switchyard_session_id → hermes_session_id`
- Single-threaded subprocess per request (blocking `communicate`)
- Session key priority: `switchyard_session_id` > `session_id` > `hermes_session_id` > `workspace`
- Stale session clearing: if `session_id=""` in payload, remove from dict (Go retry path)
- Returns SSE events: `tool_output` lines + `completed` with final text + session_id

### 6.1 Daemon vs CLI path

| Aspect           | Daemon                          | CLI (fallback)                      |
|------------------|---------------------------------|-------------------------------------|
| Socket           | Unix socket /tmp/hermes-daemon.sock | None                             |
| Cold start       | Skip (saves ~2s)                | hermes agent cold start             |
| Session storage  | In-memory dict (lost on restart)| DB via parseHermesSessionID         |
| Streaming        | Buffered until complete, then SSE| Line-by-line stdout piping         |
| Timeout          | 600s                            | Context cancellation (10min)        |
| Retry            | Go wrapper does Clear+retry once| Go wrapper does Clear+retry once    |

---

## 7. Known Issues (as of 2026-09-15)

### 7.1 Context loss between prompts in same room [CRITICAL]

**Symptom:** Room cs_fc8643b6 — prompt 1 lists 20 animals, prompt 2 asks about carnivores → hermes says "no list in conversation, resend it"

**Root cause (fixed for cs_af17a035, pending deploy for all):**

1. `chat_sessions.hermes_session_id` was empty (was never persisted by old daemon path)
2. Old daemon keyed sessions by `workspace` (always `""` for local chat), not by room ID
3. Go never sent `hermes_session_id` to daemon, so daemon never `--resume`d
4. Daemon never returned session_id to Go, so DB stayed empty
5. Each message ran as a brand new hermes session → no context carry-over

**Fix applied (code-level, needs deploy + restart):**

- Daemon: key by `switchyard_session_id` (room ID), seed explicit session_id from payload
- Go: send both `hermesSessionID` (from DB) + `switchyardSessionID` (room ID) to daemon
- Go: parse `session_id` from daemon's `completed` event → `SetHermesSessionID`
- Retry wrapper: on resume failure, clear stale session + retry once

**Affected rooms:** Any room created before the fix where hermes_session_id is still empty.
Manual fix needed: `sqlite3 ~/.hermes/kanban/chat.db "UPDATE chat_sessions SET hermes_session_id='<id>' WHERE id='<room_id>'"` — get id from `Session: <id>` in run output.

### 7.2 Daemon session lost on restart

**Symptom:** After daemon restart, in-memory session map is empty. Go sends `hermes_session_id` from DB, daemon seeds it, works. But if DB was also empty (pre-fix rooms), context is gone.

**Impact:** After pm2 restart of hermes-daemon or kanban-board, any room without `hermes_session_id` in DB loses context permanently.

### 7.3 No graceful degradation when hermes model refused

**Symptom:** Room cs_fc8643b6 — hermes (profile=default, model=codex) refused the animal list request ("Gw bukan kebun binatang"). This is a model behavior issue, not a context bug — but it compounded with the context loss bug.

**Note:** With context fix, the refusal in prompt 1 would at least be remembered in prompt 2, so the model could reconsider. Without fix, each prompt starts fresh with the system prompt steering, making refusals more likely.

### 7.4 Binary not hot-reloaded

The running `bin/kanban-board` binary is the PM2-managed process. Code changes require:
1. `go build -o bin/kanban-board ./cmd/server`
2. `pm2 restart kanban-board`
Daemon restart: `pkill -f hermes-daemon && HERMES_DAEMON_SOCK=/tmp/hermes-daemon.sock python3 cmd/hermes-daemon/main.py`

---

## 8. Performance Notes

From `docs/superpowers/plans/2026-09-14-chat-performance-improvement.md`:

- Phase 1 (done): Streaming SSE primary + footer collapsed + progress indicators
- Phase 2 (done): `--resume` persist via SetHermesSessionID
- Phase 3 (done): Warm daemon fallback with CLI fallback
- Phase 4 (skipped): RTK skip for free-form prompts (not applicable, shell-only tool)

Current overhead per chat message:
- Daemon healthy path: ~1-3s for subprocess spawn + hermes inference time
- CLI fallback: ~3-5s cold start + hermes inference time
- Remote workspace: 10min timeout via node-agent SSH

---

## 9. Files Reference

| Layer    | File                                   | Purpose                                    |
|----------|----------------------------------------|--------------------------------------------|
| API      | cmd/server/chat_routes.go              | REST endpoints + async RunChat spawn       |
| Executor | internal/kanban/chat_exec.go           | RunChat + daemon/CLI routing + retry logic |
| Data     | internal/kanban/chat.go                | DB schema + CRUD for all 4 tables          |
| Daemon   | cmd/hermes-daemon/main.py              | Unix socket hermes chat bridge             |
| Tests    | internal/kanban/chat_exec_test.go      | Daemon health, session ID parsing, retry   |
| Tests    | internal/kanban/chat_test.go           | DB CRUD, allowlist, auto-title             |
| FE       | web/src/features/chat/ChatPage.tsx     | Full chat UI component                     |
| FE API   | web/src/api.ts                         | Chat type defs + API client functions      |
| FE Route | web/src/App.tsx                        | /chat + /chat/:sessionID routing           |

---

## 10. Open Questions for Brainstorm

1. **Session recovery on daemon restart:** Should daemon persist sessions to disk/file instead of in-memory dict?
2. **Room-level model override:** Currently model is per-room default but can be overridden per-message via composer. Should model switch invalidate prior context (different models have different system prompts)?
3. **Multi-agent chat:** Current design is hermes-only. If adding orchestrator or other agents, how does session resume work across agents?
4. **Stale session cleanup:** DB grows unbounded with hermes_session_id references to deleted/rotated hermes sessions. Need cleanup?
5. **Context window limits:** No mechanism to detect when conversation exceeds model context window. hermes truncates internally but no user feedback.
6. **Error UX:** When hermes refuses (model behavior), user sees the refusal as the response. Should we retry with different system prompt or surface a "model refused" state?
7. **Streaming improvement:** Daemon buffers entire response before sending SSE. True streaming would need daemon to stream hermes stdout line-by-line. Worth the complexity?
8. **Authentication gap:** Auth cookie created manually for testing; no UI login flow for chat API calls from browser (relies on existing kanban auth cookie).
