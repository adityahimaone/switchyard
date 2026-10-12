# Claude Code Executor — Full Flow Documentation

> Feature knowledge for the `claude` executor: how Switchyard binds a card to one
> [Claude Code](https://code.claude.com/docs/en/overview) session, keeps it
> across review rounds, and validates what the worker returns.

`claude` is the fourth continuity harness, alongside `dsh`, `commandcode` and
`omp`. It shares their binding table, resolver, and finalizer; only
`harness_kind` and the per-kind wire fields differ.

---

## 1. Boundary

`claude` is a Kanban task executor, not a Chat agent. The chat allowlist stays
`hermes` only (`internal/kanban/chat_exec.go:19-24`). `claude` is selectable on a
task exactly like `hermes`, `codex`, `dsh`, `commandcode`, `omp`, and `shell`.

It is **explicit-only**: `auto` never resolves to Claude Code, and the operator
must pick it. `auto` is kept for backward compatibility with old tasks.

The generic flow (intent → dispatch → review → done) lives in
`kanban-board-flow.md`. This document covers only what the `claude` executor
adds: **session continuity on the Claude Code CLI**.

The problem it solves is identical to `commandcode` and `omp`: a card returns for
review, the user posts a comment, the card runs again. Without a binding each
round starts a fresh session and loses every prior turn. With a binding, all
rounds share one Claude Code session, so round N sees rounds 1..N-1.

---

## 2. Components

| Layer | File | Role |
|---|---|---|
| Binding model | `internal/kanban/nodeagent.go` | `HarnessBinding`, deterministic ID, resolve/update |
| Continuity gate | `internal/kanban/nodeagent.go:232` | `HarnessContinuityEnabled` — includes `"claude"` |
| Per-kind columns | `internal/kanban/nodeagent.go:246` | `harnessSessionColumn`, `harnessUsesWorkspaceIdentity` |
| Resumability | `internal/kanban/nodeagent.go:304` | `harnessCanResume` |
| Wire stamping | `internal/kanban/nodeagent.go:393` | `ApplyHarnessIdentity` — sets the right field, clears dsh's |
| Task column | `internal/kanban/kanban.go:286` | `tasks.claude_session_id` (idempotent migration) |
| Dispatch | `cmd/server/remote_dispatch.go:19` | `dispatchHarnessSessionID`, continuation prompt |
| Harness naming | `cmd/server/remote_dispatch.go:28` | `harnessLabel("claude")` → `"Claude Code"` |
| Result validation | `internal/kanban/nodeagent.go:413` | `resolveDSHResultIdentity`, `finalizeRemoteResult` |
| Executor settings | `internal/kanban/executor_settings.go:29` | order, disabled list, default mode |
| UI picker | `web/src/features/board/TaskDialog.tsx` | executor dropdown |
| UI result panel | `web/src/features/board/OutputPanels.tsx` | parses the result frame |
| Tests | `internal/kanban/claude_harness_test.go` | harness contract: gate, column, identity, round trip |
| Tests | `cmd/server/claude_harness_test.go` | dispatch binds and resumes the returned session |
| Worker | node-agent repo | runs `claude`, preserves the session — see `docs/claude-code-harness.md` there |

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

`harness_kind` is the only discriminator between dsh, CommandCode, Claude Code
and omp. All four use the same table, the same resolver, and the same finalizer.

### `tasks.claude_session_id`

Added by the idempotent migration list in `internal/kanban/kanban.go:286`. An
existing board picks it up on the next open; the `ALTER TABLE` is wrapped so a
duplicate column is not an error. `harnessSessionColumn` returns this column for
kind `claude`, `commandcode_session_id` for `commandcode`, and `omp_session_id`
for `omp`, so a Claude write can never bleed into another harness's column
(pinned by `TestClaudeBindingRoundTripUsesClaudeTaskColumn`).

### Deterministic session id

`DeterministicHarnessSessionID(kind, boardID, cardID)`
(`internal/kanban/nodeagent.go:272`):

```go
"switchyard-" + kind + "-" + hex(sha1(boardID+"/"+cardID)[:8])
```

A `claude` card therefore starts from `switchyard-claude-<16 hex>`. The kind
prefix keeps it from ever colliding with the dsh, commandcode or omp id for the
same card.

### Resumability

`harnessCanResume` (`internal/kanban/nodeagent.go:304`):

```go
if b.Status == "active" || b.HarnessSessionID == "" { return false }
if !harnessUsesWorkspaceIdentity(b.HarnessKind) { return true }
return b.HarnessWorkspaceID != ""
```

Claude Code resumes with its own CLI `--resume` session id, not by workspace, so
`harnessUsesWorkspaceIdentity("claude")` is false. Requiring a workspace id would
make every Claude card permanently unresumable.

---

## 4. Wire contract

### Request

`internal/kanban/nodeagent.go:177`:

```go
HarnessKind          string `json:"harness_kind,omitempty"`
ClaudeSessionID      string `json:"claude_session_id,omitempty"`
```

Stamped by `ApplyHarnessIdentity` (`internal/kanban/nodeagent.go:393`), which
both dispatchers call:

```go
case "claude":
    req.ClaudeSessionID = sessionID
    req.DSHSessionID = ""
    req.DSHWorkspaceID = ""
```

The explicit dsh-field clears matter: a Claude run must not carry dsh workspace
identity onto the wire, or the worker would validate against an identity it never
had. Pinned by `TestApplyClaudeIdentityStampsOnlyClaudeFields`, which asserts the
serialized payload omits `dsh_session_id` and `dsh_workspace_id` entirely.

### First run vs continuation

`dispatchHarnessSessionID` (`cmd/server/remote_dispatch.go:19`) returns `""`
unless this is a continuation. The first run deliberately sends an empty
`claude_session_id` and the CLI mints a real one. Sending a deterministic id that
Claude Code has never seen would fail to resume.

Continuation prompt (`cmd/server/remote_dispatch.go:192`, via `harnessLabel`):

```
[CONTINUATION] Resume the existing Claude Code session and apply only the new task feedback below.
```

### CLI

The command line is built **worker-side**; this repo never execs `claude`
directly. The contract:

```sh
claude -p --output-format json --permission-mode bypassPermissions "<prompt>"
claude -p --output-format json --permission-mode bypassPermissions --resume <session-id> "<prompt>"
```

Binary resolution: `claude` on every platform. Version is advertised in the node
register frame as `versions.claude`.

`--permission-mode bypassPermissions` is required: a headless worker cannot
answer an interactive approval prompt, and it lets the agent edit files and run
shell commands. Like `commandcode`'s `--yolo` and `omp`'s `--auto-approve`, it is
only safe on a **trusted node**.

---

## 5. Result validation

`resolveDSHResultIdentity` (`internal/kanban/nodeagent.go:413`) runs on every
result. For `claude` the session id comes from its own field, not the generic
one:

```go
case "claude":
    sessionID = strings.TrimSpace(result.ClaudeSessionID)
    returnedSession = sessionID != ""
```

A returned session that differs from the dispatched one is rejected:

```go
res.Error = kind + "_identity_rejected: " + err
```

For this executor the prefix is literally `claude_identity_rejected:` and the
card lands in `blocked`, not a retry.

### What is NOT checked for claude

`isDSH := req.Executor == "dsh"` gates three specific checks
(`internal/kanban/nodeagent.go:456`):

- `worker result omitted workspace id`
- `worker result omitted last turn sequence`
- `worker returned stale turn sequence %d, dispatched cursor was %d`

None of these apply to `claude`. **Consequence: there is no stale-turn rejection
for claude.** Its only protection against a late result from a superseded run is
the `current_run_id` ownership fence in `finalizeRemoteResult`
(`internal/kanban/nodeagent.go:559`), the same fence CommandCode and omp rely on.

A **failed** claude run may legitimately omit a session id, and that is accepted.
Only a successful run must return one.

---

## 6. Status transitions

All handled by `finalizeRemoteResult`, which is executor-agnostic. Guarded by
`WHERE id=? AND status='running' AND current_run_id=?`.

| Condition | Status |
|---|---|
| Success, no new comment | `review` |
| Success, user commented mid-run | `todo` (requeue) |
| Failure or identity rejection | `blocked` |
| Dispatch wait timeout | `todo` if a newer comment exists, else `blocked` |

Approving a `review` card moves it to `done`. A plain `PATCH .../status` with
`done` is rejected when the workspace has changes.

---

## 7. Retry policy

The dispatcher retries transient failures up to 3 times, but skips retry for
these deterministic signals:

- `dispatch_wait_timeout:`
- `dsh_unavailable:` / `dsh_session_missing:`
- `commandcode_session_missing:`
- `omp_unavailable:` / `omp_session_missing:`
- `claude_unavailable:` / `claude_session_missing:`

A `claude_session_missing` failure goes straight to `blocked`. The `claude_*`
strings are worker-emitted; no Go code in this repo produces them, it only
matches on them. `claude_unavailable:` means the binary is missing on the node —
retrying only requeues the same broken run.

---

## 8. Executor settings

`internal/kanban/executor_settings.go`, persisted to
`$HERMES_HOME/executors.json` (default `~/.hermes/executors.json`, file mode
`0600`).

```json
{
  "order": ["auto", "hermes", "codex", "commandcode", "claude", "dsh", "omp", "shell"],
  "disabled": [],
  "default_execution_mode": "direct"
}
```

- `order` is a full replacement; missing known executors are re-appended in
  canonical position, so an older file silently gains `claude`.
- `auto` can never be disabled.
- `""` and `"auto"` always resolve as enabled.
- `GET /api/settings/executors` reads it, `PUT` writes it.

UI panel: `web/src/features/settings/ExecutorSettings.tsx`. Hiding an executor
here filters the task picker, it does not block a direct API call.

---

## 9. Transport

`claude` rides the same node-agent dispatch as `codex`, `dsh`, `commandcode` and
`omp`. Routing is decided by `workspace_transport`, never by executor
(`internal/kanban/workspace_validate.go`):

| Path shape | Transport | Target |
|---|---|---|
| Registered remote | `node-agent` | registered host |
| `/Users/...` | `node-agent` | `mac-tailscale` |
| `C:\...` | `node-agent` | `windows-tailscale` |

A remote workspace is never run locally on the VPS, and never downgraded to SSH
for a non-shell executor.

Timeout is `RemoteDispatchWait()` = job timeout + 2 minutes. Only `agentic` shell
gets the longer window.

---

## 10. Installing Claude Code on a worker host

The worker probes for the binary; it does not install it. Switchyard does not
install the CLI and does not provision Anthropic credentials.

Install Claude Code on the worker using Anthropic's platform-native
instructions, then authenticate **as the same OS account that runs node-agent**.
That last point is the usual first-run failure: Claude Code stores its session
state under the worker account's own Claude configuration directory, so a CLI
authenticated as a different user cannot resume the session the worker created.

After installing, restart node-agent so capabilities re-register, and confirm the
node advertises the executor:

```sh
curl -s localhost:8790/api/nodes | grep -o '"claude"'
```

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Executor missing from the picker | Worker build predates `claude` | Re-run the host installer, restart node-agent, confirm `versions.claude` in the register frame |
| `claude_unavailable:` | `claude` not on PATH for the worker | Install it, then confirm `claude --version` under the same user that runs node-agent |
| `claude_session_missing: headless --output-format json returned no session id` | Run succeeded but emitted no `session_id` | Check the worker log; usually the CLI is not authenticated on that host |
| `claude_session_missing: continuation requested but no session id was dispatched` | Worker predates the `claude_session_id` wire field | Deploy a new node-agent on every host |
| `claude_identity_rejected:` | Worker returned a different session than dispatched | Inspect the worker log; usually a `--resume` id that was never created |
| Continuation starts a fresh conversation | The CLI was authenticated as a different OS account than the worker | Re-authenticate as the node-agent user |
| claude runs but makes no edits | Permission mode blocked tools | The worker passes `--permission-mode bypassPermissions`; verify the deployed worker is current |

Worker log: `$TMPDIR/node-agent-<task_id>/run.log`.

---

## 12. Known gaps

- **No model pinning.** The worker does not pass `--model`, so Claude Code
  resolves the model from the host's own configuration. A board-level `model` is
  ignored for this executor, unlike `dsh` which honours `DSH_MODEL`.
- **No home isolation.** dsh runs with an isolated `DSH_HOME`; Claude Code has no
  equivalent, so its session store is shared with any interactive use of the same
  OS account on that host.
- **Board export/import.** `internal/kanban/dataops.go` selects the harness
  binding columns **without `harness_kind`**, and import then writes
  `UPDATE tasks SET dsh_session_id=?`. An exported and re-imported `claude` card
  loses its kind (defaulting back to `dsh`) and mirrors its session id into the
  dsh column. Same pre-existing gap affects `commandcode` and `omp`; recorded in
  `commandcode-executor.md` §11 and `omp-executor.md` §12.
- **No per-session lock.** dsh takes a `dshSessionLocks` mutex; `claude` does
  not. Two concurrent runs against the same card are already prevented upstream
  by the `current_run_id` claim fence, so this has not been observed in practice.
