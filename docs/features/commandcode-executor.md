# CommandCode Executor — Full Flow Documentation

> Feature knowledge for the `commandcode` executor: how Switchyard binds a card
> to one Command Code session, keeps it across review rounds, and validates
> what the worker returns.

---

## 1. Boundary

`commandcode` is a Kanban task executor, not a Chat agent. The chat allowlist
stays `hermes` only (`internal/kanban/chat_exec.go:19`). `commandcode` is
selectable on a task exactly like `hermes`, `codex`, `dsh`, and `shell`.

The generic flow (intent → dispatch → review → done) lives in
`kanban-board-flow.md`. This document covers only what the `commandcode`
executor adds: **session continuity on the Command Code CLI**.

The problem it solves: a card returns for review, the user posts a comment, the
card runs again. Without a binding each round starts a fresh session and loses
every prior turn. With a binding, all rounds share one Command Code session, so
round N sees rounds 1..N-1.

---

## 2. Components

| Layer | File | Role |
|---|---|---|
| Binding model | `internal/kanban/nodeagent.go` | `HarnessBinding`, deterministic ID, resolve/update |
| Continuity gate | `internal/kanban/nodeagent.go:101` | `HarnessContinuityEnabled("dsh" \| "commandcode")` |
| Schema | `internal/kanban/kanban.go:148` | `harness_bindings` table, `harness_kind` column |
| Task column | `internal/kanban/kanban.go:183` | `tasks.commandcode_session_id` |
| Dispatch | `cmd/server/remote_dispatch.go:189` | node-agent lane, builds the continuation request |
| Result validation | `internal/kanban/nodeagent.go:233` | `resolveDSHResultIdentity`, `finalizeRemoteResult` |
| Executor settings | `internal/kanban/executor_settings.go` | order, disabled list, default mode |
| UI picker | `web/src/features/board/TaskDialog.tsx` | executor dropdown |
| UI result panel | `web/src/features/board/OutputPanels.tsx` | parses the result frame |
| Worker | node-agent repo | runs `cmd`, preserves the session |

---

## 3. Data model

### `harness_bindings` — one row per card

```sql
CREATE TABLE harness_bindings (
  card_id              TEXT PRIMARY KEY,
  workspace_path       TEXT,
  harness_workspace_id TEXT,
  harness_session_id   TEXT,
  last_turn_seq        INTEGER DEFAULT -1,
  last_comment_id      INTEGER DEFAULT 0,
  status               TEXT DEFAULT 'active',
  harness_kind         TEXT NOT NULL DEFAULT 'dsh'
);
```

`harness_kind` is the only discriminator between DSH and CommandCode. Both use
the same table, the same resolver, and the same finalizer.

### Deterministic session id

`DeterministicHarnessSessionID(kind, boardID, cardID)`
(`internal/kanban/nodeagent.go:119`):

```go
"switchyard-" + kind + "-" + hex(sha1(boardID+"/"+cardID)[:8])
```

A `commandcode` card therefore starts from
`switchyard-commandcode-<16 hex>`. The legacy `DeterministicDSHSessionID` stays
byte-identical for boards that predate the `kind` column.

### Resumability

`harnessCanResume` (`internal/kanban/nodeagent.go:151`):

```go
if b.Status == "active" || b.HarnessSessionID == "" { return false }
if b.HarnessKind == "commandcode" { return true }   // no workspace identity needed
return b.HarnessWorkspaceID != ""
```

CommandCode resolves sessions per working directory and has no workspace
identity to require. Requiring one would make every `commandcode` card
permanently unresumable.

---

## 4. Wire contract

### Request

`internal/kanban/nodeagent.go:72`:

```go
HarnessKind          string `json:"harness_kind,omitempty"`
CommandCodeSessionID string `json:"commandcode_session_id,omitempty"`
LastTurnSeq          *int64 `json:"last_turn_seq,omitempty"`
LastCommentID        *int64 `json:"last_comment_id,omitempty"`
```

Built at `cmd/server/remote_dispatch.go:189`:

```go
if r.executor == "commandcode" {
    req.HarnessKind = "commandcode"
    req.CommandCodeSessionID = dshSessionID
    req.DSHSessionID = ""
    req.DSHWorkspaceID = ""
}
```

The explicit DSH-field clears matter: a `commandcode` run must not carry DSH
workspace identity onto the wire. Pinned by
`cmd/server/commandcode_harness_test.go:37` and
`internal/kanban/commandcode_harness_test.go:39`.

### First run vs continuation

`dispatchHarnessSessionID` (`cmd/server/remote_dispatch.go:19`) returns `""`
unless this is a continuation. So the first run deliberately sends an empty
`commandcode_session_id` and the worker mints a real one. Sending a
deterministic id that Command Code has never seen would fail to resume.

Continuation prompt (`cmd/server/remote_dispatch.go:122`):

```
[CONTINUATION] Resume the existing Command Code session and apply only the new task feedback below.
```

### CLI

The command line is built **worker-side**; this repo never execs `cmd`
directly. The contract:

```sh
cmd -p "<prompt>" --yolo --skip-onboarding --output-format json
cmd -p "<prompt>" --yolo --skip-onboarding --output-format json --resume <session-id>
```

Binary resolution: `cmd`, `cmdc` (Windows alias), or `command-code`. Version is
advertised in the node heartbeat as `versions.commandcode`.

---

## 5. Result validation

`resolveDSHResultIdentity` (`internal/kanban/nodeagent.go:233`) runs on every
result. Session id resolution order:

1. `result.dsh_session_id`
2. `result.commandcode_session_id`
3. `result.session_id`
4. regex over the output text
   (`dshSessionProof`, `internal/kanban/nodeagent.go:96`)

A returned session that differs from the dispatched one is rejected:

```go
res.Error = kind + "_identity_rejected: " + err
```

For this executor the prefix is literally `commandcode_identity_rejected:` and
the card lands in `blocked`, not a retry.

### What is NOT checked for commandcode

`isDSH := req.Executor == "dsh"` gates three specific checks
(`internal/kanban/nodeagent.go:259`):

- `worker result omitted workspace id`
- `worker result omitted last turn sequence`
- `worker returned stale turn sequence %d, dispatched cursor was %d`

None of these apply to `commandcode`. **Consequence: there is no stale-turn
rejection for CommandCode.** Its only protection against a late result from a
superseded run is the `current_run_id` ownership fence in `finalizeRemoteResult`
(`internal/kanban/nodeagent.go:385`), proven by
`TestFinalizeRejectsStaleCommandCodeResultByRunID`
(`internal/kanban/commandcode_harness_test.go:230`).

A **failed** CommandCode run may legitimately omit `sessionId`, and that is
accepted. Only a successful run must return one.

---

## 6. Status transitions

All handled by `finalizeRemoteResult` (`internal/kanban/nodeagent.go:365`),
which is executor-agnostic. Guarded by
`WHERE id=? AND status='running' AND current_run_id=?`.

| Condition | Status |
|---|---|
| Success, no new comment | `review` |
| Success, user commented mid-run | `todo` (requeue) |
| Failure or identity rejection | `blocked` |
| Dispatch wait timeout | `todo` if a newer comment exists, else `blocked` |

Approving a `review` card moves it to `done`. A plain `PATCH .../status` with
`done` is rejected when the workspace has changes
(`cmd/server/main.go:245`): `400 review has changes; approve with commit or commit_push`.

---

## 7. Retry policy

The dispatcher retries transient failures up to 3 times, but
skips retry for these deterministic signals:

- `dispatch_wait_timeout:`
- `dsh_unavailable:`
- `dsh_session_missing:`
- `commandcode_session_missing:`

A `commandcode_session_missing` failure goes straight to `blocked`. The
`commandcode_*` strings are worker-emitted; no Go code in this repo produces
them, it only matches on them.

Repeated continuation timeouts are also not retried: a card that already has a
`node_agent_job_timeout:` or `dispatch_wait_timeout:` result and a non-empty
result is blocked with `repeated timeout on continuation — needs a fresh
single-shot run`.

---

## 8. Executor settings

`internal/kanban/executor_settings.go`, persisted to
`$HERMES_HOME/executors.json` (default `~/.hermes/executors.json`, file mode
`0600`).

```json
{
  "order": ["auto", "hermes", "codex", "commandcode", "dsh", "shell"],
  "disabled": [],
  "default_execution_mode": "direct"
}
```

- `order` is a full replacement; missing known executors are re-appended in
  canonical position.
- `auto` can never be disabled.
- `""` and `"auto"` always resolve as enabled.
- `GET /api/settings/executors` reads it, `PUT` writes it.

UI panel: `web/src/features/settings/ExecutorSettings.tsx`. Hiding an executor
here filters the task picker, it does not block a direct API call.

---

## 9. Transport

`commandcode` rides the same node-agent HTTP dispatch as `codex` and `dsh`.
Routing is decided by `workspace_transport`, never by executor
(`internal/kanban/workspace_validate.go:131`):

| Path shape | Transport | Target |
|---|---|---|
| Registered remote | `node-agent` | registered host |
| `/Users/...` | `node-agent` | `mac-tailscale` |
| `C:\...` | `node-agent` | `windows-tailscale` |

A remote workspace is never run locally on the VPS, and never downgraded to
SSH for a non-shell executor.

Timeout is `RemoteDispatchWait()` = job timeout + 2 minutes. Only `agentic`
shell gets the longer window.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Executor missing from the picker | Worker build predates `commandcode` | Re-run the Mac installer, restart node-agent, confirm `versions.commandcode` in `/api/nodes` |
| `commandcode_session_missing:` | Bound session no longer exists on the worker | Delete the harness binding or the card to force a first run |
| `commandcode_identity_rejected:` | Worker returned a different session than dispatched | Inspect the worker log; usually a `--resume` id that was never created |
| Continuity keeps resetting | Worker lacks `--output-format json` and fell back to `text` | Upgrade the CLI; a text run cannot prove continuity and is treated as a first run |
| `commandcode` absent from `/api/nodes` capabilities | Node not re-registered | Restart node-agent so capabilities re-register |

Worker log: `$TMPDIR/node-agent-<task_id>/run.log`.

---

## 11. Known gap

Board export (`internal/kanban/dataops.go:346`) selects the harness binding
columns **without `harness_kind`**, and import (`:525`) then unconditionally
writes `UPDATE tasks SET dsh_session_id=?`. An exported and re-imported
`commandcode` card therefore loses its kind (defaulting back to `dsh`) and
mirrors its session id into the DSH column. Noted here as a factual
observation; not fixed by this document.
