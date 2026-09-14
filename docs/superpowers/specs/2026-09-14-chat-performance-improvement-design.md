# Chat Performance & UX Improvement — Full Design Spec

Date: 2026-09-14
Status: Approved for implementation
Scope: switchyard chat feature — backend (Go) + frontend (React/TSX) + hermes CLI integration

## Problem

Switchyard chat feels slow. Root causes confirmed from code analysis:

1. Every `RunChat()` call spawns fresh `hermes chat -Q` subprocess (~2-3s cold start)
2. No session reuse across turns (each call is stateless)
3. RTK/Caveman token savings not wired into chat path (shell-only)
4. Frontend has redundant polling (SSE + 2s interval + 5s interval)
5. Streaming output exists backend-side (line-by-line pipe) but not rendered progressively in UI
6. Response rendered in bubble card (StreamingResponse) — doesn't match streaming UX goal

## Goals

1. Progressive response rendering — user sees partial output as agent streams
2. Per-message footer bar (BeUI-style) — model, elapsed, copy/retry/thread
3. Warm session reuse via `--resume` + local daemon
4. RTK integration for token savings
5. SSE-primary polling (remove redundant intervals)

## Non-goals

- Remote workspace transport redesign (node-agent path unchanged)
- New agent types beyond hermes
- WebSocket upgrade (SSE sufficient)

---

## Part 1: Response Layout (Frontend)

### 1.1 Response rendering — no bubble

Remove `StreamingResponse` bubble wrapper from assistant messages. Render markdown directly.

```
Current:
  <StreamingResponse status={...} copyText={...} footer={...}>
    <Markdown text={content} />
  </StreamingResponse>

New:
  <div className="assistant-response">
    <Markdown text={streamedContent || finalContent} />
    <ResponseFooter run={run} model={model} createdAt={createdAt} />
  </div>
```

### 1.2 Per-message footer bar (BeUI-style)

Below each assistant message, show info bar:

```
┌────────────────────────────────────────────────┐
│ markdown content here...                        │
│                                                 │
│ ────────────────────────────────────────────── │
│ sonnet-4 · 14.2s · still working    Copy·Stop  │  ← active
│ ────────────────────────────────────────────── │
│ sonnet-4 · 0.8s                     Copy·Retry │  ← completed
└────────────────────────────────────────────────┘
```

Component: `ResponseFooter`
- Shows: model name, elapsed time (100ms tick during active), state label
- Active: "still working" / "taking longer" escalation, Stop button
- Done: static time, Copy + Retry buttons
- Error: red state label, Copy + Retry

### 1.3 Progressive streaming

Connect existing backend `tool_output` SSE events to frontend rendering:

```
State machine for last assistant message:
  IDLE → LOADING (run created) → STREAMING (first tool_output) → COMPLETE (completed event)

LOADING state:
  - Show empty response area with "Starting agent..." placeholder

STREAMING state:
  - Accumulate tool_output event payloads into a buffer
  - Render buffer progressively with cursor blink (█)
  - Final content replaces buffer on COMPLETE

COMPLETE state:
  - Replace with run.output (canonical final text)
  - Show footer with static elapsed + copy/retry
```

### 1.4 Activity panel — collapsed default

```
Current: AgentTaskPlan always shown with steps
New:     Collapsed by default, click to expand
         Hidden entirely on completed runs (events in DB for history)
```

### 1.5 Input bar changes

- Profile/workspace/model selectors: compact pill buttons below input (not large Select dropdowns)
- Elapsed timer shown in footer during active run (not in header)
- Header stays clean: session title only

### 1.6 Polling consolidation

```
Current:
  - openEventStream (SSE) → triggers getChatRun + invalidations
  - activeRunQuery → refetchInterval: 2000ms
  - useEffect → setInterval(getChatRun, 5000ms)

New:
  - SSE events are primary driver
  - Remove activeRunQuery refetchInterval
  - Remove 5000ms getChatRun polling
  - On SSE event for current run → invalidate queries
  - On SSE connection drop → single getChatRun on reconnect
  - Fallback polling only if SSE unhealthy (connection error state)
```

---

## Part 2: Session Reuse (Backend)

### 2.1 `--resume` integration

```
DB change:
  ALTER TABLE chat_sessions ADD COLUMN hermes_session_id TEXT DEFAULT '';

Flow:
  1. RunChat() checks chat_sessions.hermes_session_id
  2. If exists: pass --resume <id> to hermes chat
  3. If empty: run fresh hermes chat
  4. After run completes: parse "Session: <id>" from output
  5. Store in chat_sessions.hermes_session_id
  6. If --resume fails (expired): clear hermes_session_id, retry fresh

Command change:
  Current:  hermes chat -Q --reasoning minimal --query-file -
  New:      hermes chat -Q --reasoning minimal --resume <id> --query-file -
            (omitted when id is empty)
```

### 2.2 Local socket daemon

```
New binary: hermes-chat-daemon (Python)
Location:   ~/apps/kanban-board/cmd/hermes-daemon/

Architecture:
  - HTTP server on Unix socket: /tmp/hermes-daemon.sock
  - Single endpoint: POST /query
  - Request: {prompt, workspace, profile, model, history, session_id}
  - Response: SSE stream of events (tool_output, completed, error)
  - Internally: persistent Hermes agent session per workspace
  - Keeps model provider connection warm
  - Auto-restart on crash (supervised by pm2)

Lifecycle:
  - Start: load config, create agent session, bind socket
  - Query: create conversation turn in existing session, stream output
  - Idle: keep session alive, GC old sessions after 30min
  - Shutdown: graceful cancel active runs, save session state

Switchyard integration:
  RunChat() flow:
    1. Check daemon health: GET http+unix:///tmp/hermes-daemon.sock/health
    2. If alive: POST /query → stream SSE → collect output
    3. If dead: fall back to current exec.Command path
    4. Update ChatRun state as events stream in

Socket client in Go:
  - Use net.Dial("unix", "/tmp/hermes-daemon.sock")
  - HTTP over Unix socket via http.Client with custom DialContext
  - Timeout: 10 minutes per query
```

### 2.3 RTK integration

```
Prompt path change:
  Current:  prompt → hermes chat -Q (stdin)
  New:      prompt → rtk-hermes rewrite → hermes chat -Q (rewritten stdin)

Implementation:
  1. Before RunChat() calls hermes, pipe prompt through rtk:
     rtk rewrite --plugin hermes < prompt > /tmp/rtk_prompt_XXXX
  2. Pass rewritten prompt to hermes via stdin
  3. For daemon path: daemon handles RTK internally

Token savings estimate:
  - RTK saves 90-99% on system prompt / context tokens (INPUT)
  - Caveman saves 60-75% on output tokens
  - For a typical "sunset jam berapa" query: ~2s saved on model inference
  - For a typical code analysis query: ~10-15s saved

Caveman on output:
  - Wire caveman adapter on result pipeline (currently shell-only)
  - Apply to chat output before storing in chat_runs.output
  - Caveman mode selectable per-chat-session (opt-in for now)
```

---

## Part 3: Implementation Order

### Phase 1: Frontend UX (no backend changes)
1. Replace StreamingResponse bubble with direct markdown render
2. Add ResponseFooter component (model, elapsed, actions)
3. Wire tool_output SSE events to progressive streaming
4. Collapse activity panel by default
5. Compact selector pills below input
6. Remove redundant polling (SSE-primary)

### Phase 2: Session Reuse
7. Add hermes_session_id column to chat_sessions table
8. Parse session ID from hermes output after run
9. Pass --resume on subsequent runs in same session
10. Handle resume failure gracefully (clear + retry fresh)

### Phase 3: Daemon
11. Build hermes-chat-daemon (Python HTTP on Unix socket)
12. Go client for Unix socket communication
13. Daemon health check in RunChat() with CLI fallback
14. Session management in daemon (per-workspace sessions)

### Phase 4: Token Optimization
15. RTK prompt rewriting in RunChat() path
16. Caveman adapter on chat output pipeline
17. Profile-level caveman toggle

---

## Part 4: Verification

### Frontend
- `pnpm -C web build` passes
- Manual: send message → see progressive streaming → footer shows elapsed → completed state shows copy/retry
- Manual: SSE disconnect → fallback polling kicks in → reconnect recovers
- Manual: activity panel collapsed by default, expandable

### Backend
- `go vet ./... && go test ./...` passes
- Unit test: --resume flag present when hermes_session_id set
- Unit test: --resume omitted when hermes_session_id empty
- Unit test: session ID parsed from hermes output
- Unit test: resume failure clears hermes_session_id and retries

### Daemon
- Unit test: health endpoint returns ready
- Unit test: /query returns SSE stream
- Unit test: invalid input rejected
- Integration: daemon alive → RunChat uses daemon; daemon dead → CLI fallback

### End-to-end
- Send "hello" → fast path (< 0.5s, no daemon)
- Send "sunset jam berapa" → fast path (< 0.5s)
- Send code analysis prompt → progressive streaming visible → completes with output
- Send follow-up in same session → --resume used → faster (no re-read context)
- Remote workspace chat → unchanged (node-agent path)
- Stop button → cancels active run
- Retry button → re-runs same prompt

---

## Part 5: Open Questions

1. Daemon crash recovery: if daemon crashes mid-run, should RunChat() silently retry via CLI or surface error?
   → Answer: silently retry via CLI. Daemon is optimization, not requirement.

2. Session ID parsing: hermes prints session ID to stderr or stdout?
   → Need to verify. Check `hermes chat -Q --pass-session-id` flag output format.

3. Max sessions per daemon: one daemon for all workspaces, or per-workspace?
   → Start with one daemon for all. Per-workspace if memory pressure observed.

4. Caveman opt-in vs default: should new chat sessions default to caveman=on?
   → Opt-in initially. User can toggle per session. Default off.
