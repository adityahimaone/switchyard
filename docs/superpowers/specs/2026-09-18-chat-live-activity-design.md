# Chat Live Activity Context

## Goal
Expose ChatRun lifecycle state and ChatRunEvent activity inside each assistant response, live while the run executes.

## Behavior
- Activity appears as collapsible panel below assistant response.
- Panel opens while state is `loading` or `running`.
- Panel closes when state is `completed`, `error`, or `cancelled`, unless user manually opens it.
- Header shows state, current elapsed time, current phase, and event count.
- Elapsed time updates every 500ms while active; terminal elapsed remains fixed.
- Existing event history remains source for detailed activity rows.

## Data flow
- Backend broadcasts run lifecycle events through existing authenticated `/api/events/stream`.
- Event payload includes `session_id`, `run_id`, `message_id`, and lifecycle state when applicable.
- Frontend subscribes once per mounted ChatPage, ignores events for other sessions/runs, updates matching run cache, and invalidates run events.
- Initial query remains source of truth after reconnect; SSE is latency path, not persistence.
- Poll/query fallback remains available when stream disconnects.

## Safety
- No raw provider output, credentials, paths, or request bodies in lifecycle event payloads.
- Stale session/run events cannot mutate current UI.
- Unmount closes EventSource.
- Terminal state always stops timer.

## Acceptance
- API test proves lifecycle event envelope fields.
- UI test proves active panel open state and terminal collapse behavior.
- Live authenticated smoke proves `: connected` and run lifecycle event delivery.
- Go tests, vet, server build, frontend build, and diff check pass.
