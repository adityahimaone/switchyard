# Persistent Hermes Chat Runtime — Design

## Goal
Replace per-message `hermes chat` process startup for local Switchyard chat with one persistent localhost runtime service. Preserve current chat API, SQLite persistence, remote-workspace routing, fast paths, stop/retry, and auth boundary.

## Scope

In scope:
- Local runtime service with health/readiness endpoint.
- JSON HTTP run API returning quickly with `run_id` and stream identifier.
- Per-run SSE stream with real lifecycle/activity events.
- Explicit Switchyard session history passed to Hermes runtime.
- Runtime session mapping persisted in Switchyard chat DB.
- Model-compatible reasoning selection and fallback.
- Cancellation, run ownership, bounded output, restart/reconnect readback.
- Existing CLI executor retained as fallback when runtime unavailable.

Out of scope:
- Embedding Python inside Go.
- Remote workspace transport redesign.
- New sunset/weather provider.
- UI redesign beyond consuming runtime events.

## Architecture

```text
ChatPage
  -> Switchyard Go chat API
     -> local Hermes runtime HTTP service
        -> persistent Hermes runtime/session
           -> provider
        <- run events / result
     <- run state + SSE proxy
  -> chat.db
```

Switchyard owns chat rooms, message/run persistence, auth, routing, and UI-facing SSE. Runtime owns Hermes process state, provider calls, tool callbacks, and runtime session context. Runtime failure falls back to current CLI path for local runs; remote workspace still uses node-agent.

## API

Runtime endpoints:

- `GET /health` — `{status: "ready", version: ...}`.
- `POST /runs` — accepts `{run_id, session_id, prompt, history, profile, model, workspace, reasoning}`; returns `202` with `{run_id, stream_id}`.
- `GET /runs/{run_id}` — terminal/current run readback.
- `GET /runs/{run_id}/stream` — SSE events with `id`, `kind`, JSON data.
- `POST /runs/{run_id}/cancel` — idempotent cancellation.

Switchyard keeps `/api/chat/...` contracts. Go runtime client uses loopback URL from `SWITCHYARD_HERMES_RUNTIME_URL`, defaulting to `http://127.0.0.1:8642`, with bounded request/read timeouts and no credential values in logs.

## Event contract

Real events only:

- `accepted` — runtime accepted run.
- `context_loaded` — message count/profile/workspace metadata, never secrets.
- `runtime_started` — persistent runtime turn started.
- `tool_started` / `tool_finished` — tool name and bounded preview.
- `token` — response delta when runtime exposes deltas.
- `completed` — byte count and elapsed time.
- `error` — safe error string.
- `cancelled` — cancellation reason.

SQLite remains source of truth. SSE is transport. Reconnect reads `/runs/{id}` and chat DB events; no event loss claim from an open socket.

## Reasoning selection

- Exact deterministic fast paths stay local.
- Short prompts use `none`.
- Normal prompts use configured profile/provider reasoning when available.
- Never force `minimal` when model/provider does not support it.
- If provider rejects reasoning, retry once with configured safe fallback only when error identifies reasoning incompatibility; otherwise fail normally.

## Safety and lifecycle

- Bind runtime to loopback only.
- Require a local shared runtime token when configured; never expose runtime directly on public interface.
- Validate `run_id`, session ownership, prompt size, and history size.
- One active run per chat session; reject conflicting runs.
- Kill/cancel child work on runtime shutdown; mark orphaned runs error after restart reconciliation.
- Bound history, event payloads, output, and tool previews.
- Never pass remote `/Users/...` paths to local runtime; existing node-agent path remains authoritative.

## Verification

- Go unit tests: runtime request encoding, history mapping, event parsing, reasoning selection/fallback, timeout, cancellation, fallback to CLI.
- Runtime service tests: health, run lifecycle, reconnect, cancel, invalid input, auth token.
- Existing Go suite: `go vet ./... && go test ./...`.
- Frontend: `pnpm -C web build`.
- Live smoke: authenticated chat request, second-turn context retention, runtime health, SSE event cursor, runtime-down CLI fallback, remote workspace unchanged.
