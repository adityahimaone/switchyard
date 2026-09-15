# Chat — rich direct agent chat (hybrid)

Goal: fast chat to Hermes/Codex/Shell, switch agent/profile/workspace/model in composer, AI state pill + expandable timeline, internal history sidebar with full filters, SSE live.

Stack: Go `net/http` + SQLite `~/.hermes/kanban/chat.db`, React 19 + TanStack Query + Tailwind + shadcn, SSE `openEventStream`.

Decisions locked:
- Exec C Hybrid (task fast-path reuse + threaded `chat_sessions`/`chat_messages`/`chat_runs`)
- History filter A Full (search + period + agent + profile + workspace + model + state)
- Model C Hybrid (profile default + per-message override beside Attach/Command, roster validated)
- State B Pill + expandable timeline (Worker Log blue + Result emerald, stop/retry/copy)

## Tasks

- [x] T1 chat domain — SQLite schema, lifecycle functions, temp-home tests
- [x] T2 API routes — session/message/run/events/stop/retry endpoints, auth middleware, SSE kinds
- [x] T3 frontend types + nav — chat types/functions, `/chat` route, sidebar item
- [x] T4 ChatPage shell — 260px history | 1fr chat, lazy route
- [x] T5 composer controls — Agent/Profile/Workspace/Model beside Attach/Command
- [x] T6 message rendering + state pill — user/assistant layout, state tones
- [x] T7 expandable timeline + WorkerLog/Result — blue Worker Log + emerald Result, copy/stop
- [x] T8 history filters — search/state/agent/profile/workspace/model + period Today/Yesterday/7d/month
- [x] T9 SSE lifecycle — run state events refresh active run/history
- [x] T10 stop/retry — cancellation + new retry run
- [x] T11 build verify — `go vet ./...`, `go test ./...`, `pnpm -C web build` passed
- [x] T12 live route smoke — `go build`, PM2 restart, `/prototype/` HTTP 200, chat API auth guard HTTP 401

## Remaining — now done in this pass

- [x] Agent routing — `chatCommand` + `RunChat` handles hermes/codex/shell; remote workspace branches to `DispatchRemote` (node-agent), no unsafe VPS chdir on `/Users/...`
- [x] Provider/model validation — `ValidateChatModel` checks profile default + `ListProviders` roster; API rejects unknown override 400; frontend warns via model roster before send
- [x] Markdown + streamed Worker Log — `Markdown` renders fences/inline code/bold; `chat_run_event` SSE + `listChatRunEvents` polling (1.5s while running) shows live `tool_output`
- [x] Period filter — Today/Yesterday/7d/month via `inPeriod(updated_at)`
- [x] Attach/Command — Attach picks file and appends `[attach: name]` to prompt; Command inserts `/` prefix
- [x] Shell safety — shell runs `bash -lc` only for local workspace paths; empty/remote rejected/gated
- [ ] Authenticated live E2E — requires active browser auth/session; unauthenticated API guard verified, no credentials guessed

## Verification proof

- `chat_exec_test.go` covers command routing, unknown-agent rejection, remote path guard, context cancellation.
- Local shell execution path verified by command-shape tests; remote path uses node-agent branch.

- `go vet ./...` passed.
- `go test ./...` passed: `kanban-board/internal/kanban`.
- `pnpm -C web build` passed: Vite production build, ChatPage chunk generated.
- `go build -o bin/kanban-board ./cmd/server` passed.
- PM2 `kanban-board` online after restart.
- `curl http://127.0.0.1:8790/prototype/` returned HTTP 200.
- `curl http://127.0.0.1:8790/api/chat/sessions` returned `{"error":"authentication required"}` HTTP 401; expected auth guard.
