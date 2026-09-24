# Switchyard Harness Session Continuity

## Main task

Keep DSH task execution bound to stable workspace and session identity across initial runs, retries, and review feedback.

Contract:

- Switchyard owns durable card-to-harness binding.
- Workspace path stays fixed per card.
- New cards get deterministic DSH session IDs.
- Legacy `tasks.dsh_session_id` values get adopted.
- Continuations reuse existing DSH workspace and session.
- Dispatch carries `dsh_workspace_id`, `dsh_session_id`, `last_turn_seq`, `last_comment_id`, `run_id`, and `session_continuation`.
- Review comments get task, card, reviewer, and comment attribution.
- Failed turns do not acknowledge unconfirmed review comments.
- Late comments requeue task after successful turn.
- Stale worker results cannot overwrite newer runs.
- Export/import preserves harness bindings and cursors.

## Implementation progress

- [x] Add `harness_bindings` SQLite table.
- [x] Add deterministic `DeterministicDSHSessionID`.
- [x] Resolve bindings by card and fixed workspace path.
- [x] Adopt legacy `tasks.dsh_session_id`.
- [x] Add DSH workspace/session/cursor fields to node-agent request and result.
- [x] Add run ownership through `current_run_id`.
- [x] Add comment cursor query and review prompt rendering.
- [x] Add review-comment replay and late-comment requeue.
- [x] Guard result finalization against stale run ownership.
- [x] Persist successful DSH identity and turn cursor.
- [x] Preserve bindings during board export/import.
- [x] Update remote and SSH dispatchers.
- [x] Document node-agent continuity contract in `docs/execution-flow.md`.
- [x] Add unit and integration coverage for binding, cursor, comment, race, and stale-result behavior.

## Validation

- [x] Targeted `internal/kanban` continuity tests.
- [x] `go test ./cmd/server -run '^$'`.
- [x] `gofmt` check.
- [x] `git diff --check`.
- [x] Local DSH authenticated read probe: HTTP `200`, RPC success, session list returned.
- [x] Two-turn live DSH continuity probe — PASS: same session, workspace, and cursor advanced `0 -> 1`; markers `CONTINUITY_TURN_ONE_FINAL` and `CONTINUITY_TURN_TWO_FINAL` returned.
- [x] Verify deployed node-agent consumes all continuity fields — PASS: live HTTP dispatch/result carried session, workspace, run, continuation, comment, and cursor metadata; Mac worker consumed `--session-id` continuation.
- [x] Full `go test ./...` — `cmd/server` and `internal/kanban` pass.
- [x] `go vet ./...`.
- [x] `go build ./cmd/server` — pass; output removed after verification.
- [x] `pnpm build` in `web/` — Vite production build pass.
- [x] Focused Git review prompt: compact read-only prompt for branch switch, pull, and last-5 log; normal code feedback keeps existing continuation path.
- [x] Focused prompt tests and full Go validation pass.

## Post-implementation findings

Two defects only appeared under repeated real-card loops, after the continuity
work was recorded as complete:

1. **`dsh_session_conflict` on every continuation.** `dsh web` holds an OS
   `flock(2)` write handle on `session.lock` for its whole process lifetime and
   the installed build never expires the lease, so retry tuning could not help.
   Fixed in node-agent by running headless `dsh` under an isolated `DSH_HOME`
   (`~/.dsh-nodeagent`) and adopting legacy sessions by copy, which yields an
   independent lock inode.
2. **Agent sessions invisible in `dsh web`.** The UI enumerates sessions from
   `$DSH_HOME/storages/workspace.json`, not from the sessions directory, so a
   correct isolated home is by design unreadable there. Fixed by publishing the
   finished session back into `~/.dsh` — transcript plus registry entry, and
   never the lock file.

Both were verified on real cards: three loops on one card and four loops on
another, each reusing a single session with zero conflicts. Worker contract:
[node-agent docs/dsh-harness.md](https://github.com/adityahimaone/node-agent/blob/master/docs/dsh-harness.md).

## Files changed

- `cmd/server/remote_dispatch.go`
- `cmd/server/ssh_dispatch.go`
- `docs/execution-flow.md`
- `internal/kanban/comments.go`
- `internal/kanban/comments_test.go`
- `internal/kanban/dataops.go`
- `internal/kanban/dataops_test.go`
- `internal/kanban/kanban.go`
- `internal/kanban/kanban_test.go`
- `internal/kanban/nodeagent.go`
- `internal/kanban/nodeagent_test.go`

## Local-only file

`internal/kanban/Switchyard Harness Session Continuity.md` contains oversized session transcript data. Git ignores it. Keep durable progress in this document.
