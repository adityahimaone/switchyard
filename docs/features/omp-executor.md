# omp Executor — Full Flow Documentation

> Feature knowledge for the `omp` executor: how Switchyard binds a card to one
> [omp](https://omp.sh) (oh-my-pi) session, keeps it across review rounds, and
> validates what the worker returns.

`omp` is the third continuity harness, alongside `dsh` and `commandcode`. It
shares their binding table, resolver, and finalizer; only `harness_kind` and the
per-kind wire fields differ.

---

## 1. Boundary

`omp` is a Kanban task executor, not a Chat agent. The chat allowlist stays
`hermes` only (`internal/kanban/chat_exec.go:22`). `omp` is selectable on a task
exactly like `hermes`, `codex`, `dsh`, `commandcode`, and `shell`.

The generic flow (intent → dispatch → review → done) lives in
`kanban-board-flow.md`. This document covers only what the `omp` executor adds:
**session continuity on the omp CLI**.

The problem it solves is identical to `commandcode`: a card returns for review,
the user posts a comment, the card runs again. Without a binding each round
starts a fresh session and loses every prior turn. With a binding, all rounds
share one omp session, so round N sees rounds 1..N-1.

---

## 2. Components

| Layer | File | Role |
|---|---|---|
| Binding model | `internal/kanban/nodeagent.go` | `HarnessBinding`, deterministic ID, resolve/update |
| Continuity gate | `internal/kanban/nodeagent.go:101` | `HarnessContinuityEnabled("dsh" \| "commandcode" \| "omp")` |
| Per-kind columns | `internal/kanban/nodeagent.go:115` | `harnessSessionColumn`, `harnessUsesWorkspaceIdentity` |
| Wire stamping | `internal/kanban/nodeagent.go:259` | `ApplyHarnessIdentity` — sets the right field, clears dsh's |
| Schema | `internal/kanban/kanban.go:184` | `harness_bindings.harness_kind`, `tasks.omp_session_id` |
| Task column | `internal/kanban/kanban.go:184` | `tasks.omp_session_id` |
| Dispatch | `cmd/server/remote_dispatch.go:189` | node-agent lane, builds the continuation request |
| Legacy dispatcher | `cmd/server/ssh_dispatch.go:319` | same binding logic on the SSH lane |
| Result validation | `internal/kanban/nodeagent.go:275` | `resolveDSHResultIdentity`, `finalizeRemoteResult` |
| Executor settings | `internal/kanban/executor_settings.go:29` | order, disabled list, default mode |
| UI picker | `web/src/features/board/TaskDialog.tsx` | executor dropdown |
| UI result panel | `web/src/features/board/OutputPanels.tsx` | parses the result frame |
| Tests | `internal/kanban/omp_harness_test.go` | full harness contract for omp |
| Worker | node-agent repo | runs `omp`, preserves the session — see `docs/omp-harness.md` there |

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

`harness_kind` is the only discriminator between dsh, CommandCode and omp. All
three use the same table, the same resolver, and the same finalizer.

### `tasks.omp_session_id`

Added by the idempotent migration list in `internal/kanban/kanban.go:184`. An
existing board picks it up on the next open; the `ALTER TABLE` is wrapped so a
duplicate column is not an error. `harnessSessionColumn` returns this column for
kind `omp` and `commandcode_session_id` for `commandcode`, so an omp write can
never bleed into another harness's column (pinned by
`TestOMPHarnessBindingLifecycle`).

### Deterministic session id

`DeterministicHarnessSessionID(kind, boardID, cardID)`
(`internal/kanban/nodeagent.go:137`):

```go
"switchyard-" + kind + "-" + hex(sha1(boardID+"/"+cardID)[:8])
```

An `omp` card therefore starts from `switchyard-omp-<16 hex>`. The kind prefix
keeps it from ever colliding with the dsh or commandcode id for the same card.
The legacy `DeterministicDSHSessionID` stays byte-identical for boards that
predate the `kind` column.

### Resumability

`harnessCanResume` (`internal/kanban/nodeagent.go:171`):

```go
if b.Status == "active" || b.HarnessSessionID == "" { return false }
if !harnessUsesWorkspaceIdentity(b.HarnessKind) { return true }
return b.HarnessWorkspaceID != ""
```

omp resolves sessions globally by **id prefix**, not by workspace, so
`harnessUsesWorkspaceIdentity("omp")` is false. Requiring a workspace id would
make every omp card permanently unresumable.

---

## 4. Wire contract

### Request

`internal/kanban/nodeagent.go:74`:

```go
HarnessKind          string `json:"harness_kind,omitempty"`
CommandCodeSessionID string `json:"commandcode_session_id,omitempty"`
OMPSessionID         string `json:"omp_session_id,omitempty"`
```

Stamped by `ApplyHarnessIdentity` (`internal/kanban/nodeagent.go:259`), which
both dispatchers call:

```go
case "omp":
    req.OMPSessionID = sessionID
    req.DSHSessionID = ""
    req.DSHWorkspaceID = ""
```

The explicit dsh-field clears matter: an omp run must not carry dsh workspace
identity onto the wire, or the worker would validate against an identity it
never had. Pinned by `TestApplyHarnessIdentityStampsOMPFields`, which asserts
the serialized payload omits `dsh_session_id` and `dsh_workspace_id` entirely.

### First run vs continuation

`dispatchHarnessSessionID` (`cmd/server/remote_dispatch.go:19`) returns `""`
unless this is a continuation. The first run deliberately sends an empty
`omp_session_id` and the worker mints a real one. Sending a deterministic id
that omp has never seen would fail to resume.

Continuation prompt (`cmd/server/remote_dispatch.go:122`, via `harnessLabel`):

```
[CONTINUATION] Resume the existing omp session and apply only the new task feedback below.
```

### CLI

The command line is built **worker-side**; this repo never execs `omp` directly.
The contract:

```sh
omp -p --auto-approve --mode json "<prompt>"
omp -p --auto-approve --mode json --resume <session-id> "<prompt>"
```

Binary resolution: `omp` on every platform (`omp.exe` on Windows), probed by
`ompBin()`. Version is advertised in the node register frame as `versions.omp`.

`--auto-approve` is required: a headless worker cannot answer an interactive
approval prompt. Like `commandcode`'s `--yolo`, it lets the agent edit files and
run shell commands, so it is only safe on a trusted node.

---

## 5. Result validation

`resolveDSHResultIdentity` (`internal/kanban/nodeagent.go:275`) runs on every
result. Session id resolution order:

1. `result.dsh_session_id`
2. `result.commandcode_session_id`
3. `result.omp_session_id`
4. `result.session_id`
5. regex over the output text
   (`dshSessionProof`, `internal/kanban/nodeagent.go:98`)

A returned session that differs from the dispatched one is rejected:

```go
res.Error = kind + "_identity_rejected: " + err
```

For this executor the prefix is literally `omp_identity_rejected:` and the card
lands in `blocked`, not a retry.

### What is NOT checked for omp

`isDSH := req.Executor == "dsh"` gates three specific checks
(`internal/kanban/nodeagent.go:288`):

- `worker result omitted workspace id`
- `worker result omitted last turn sequence`
- `worker returned stale turn sequence %d, dispatched cursor was %d`

None of these apply to `omp`. **Consequence: there is no stale-turn rejection
for omp.** Its only protection against a late result from a superseded run is
the `current_run_id` ownership fence in `finalizeRemoteResult`
(`internal/kanban/nodeagent.go`), the same fence CommandCode relies on.

A **failed** omp run may legitimately omit a session id, and that is accepted.
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

`cmd/server/ssh_dispatch.go:375` retries transient failures up to 3 times, but
skips retry for these deterministic signals:

- `dispatch_wait_timeout:`
- `dsh_unavailable:` / `dsh_session_missing:`
- `commandcode_session_missing:`
- `omp_unavailable:` / `omp_session_missing:`

An `omp_session_missing` failure goes straight to `blocked`. The `omp_*` strings
are worker-emitted; no Go code in this repo produces them, it only matches on
them. `omp_unavailable:` means the binary is missing on the node — retrying only
requeues the same broken run.

---

## 8. Executor settings

`internal/kanban/executor_settings.go`, persisted to
`$HERMES_HOME/executors.json` (default `~/.hermes/executors.json`, file mode
`0600`).

```json
{
  "order": ["auto", "hermes", "codex", "commandcode", "dsh", "omp", "shell"],
  "disabled": [],
  "default_execution_mode": "direct"
}
```

- `order` is a full replacement; missing known executors are re-appended in
  canonical position, so an older file silently gains `omp`.
- `auto` can never be disabled.
- `""` and `"auto"` always resolve as enabled.
- `GET /api/settings/executors` reads it, `PUT` writes it.

UI panel: `web/src/features/settings/ExecutorSettings.tsx`. Hiding an executor
here filters the task picker, it does not block a direct API call.

---

## 9. Transport

`omp` rides the same node-agent dispatch as `codex`, `dsh` and `commandcode`.
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

## 10. Installing omp on a worker host

The worker probes for the binary; it does not install it. Both host types
already have it installed as of 2026-09-28.

**macOS / Linux**

```sh
curl -fsSL https://omp.sh/install | sh      # -> ~/.local/bin/omp
```

**Windows (PowerShell)**

```powershell
irm https://omp.sh/install.ps1 | iex        # -> %LOCALAPPDATA%\omp\omp.exe
```

If the host has a `bun` older than 1.3.14 the default installer path fails the
version check and aborts. Force the prebuilt binary instead:

```powershell
& ([scriptblock]::Create((irm https://omp.sh/install.ps1))) -Binary
```

After installing, restart node-agent so capabilities re-register, and confirm
the node advertises the executor:

```sh
curl -s localhost:8790/api/nodes | grep -o '"omp"'
```

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Executor missing from the picker | Worker build predates `omp` | Re-run the host installer, restart node-agent, confirm `versions.omp` in the register frame |
| `omp_unavailable:` | `omp` not on PATH for the worker | Install it, then confirm `omp --version` under the same user that runs node-agent |
| `omp_session_missing: headless --mode json returned no session id` | Run succeeded but emitted no session frame | Check the worker log; usually no provider is configured on that host (`omp` exits early with "No models available") |
| `omp_session_missing: continuation requested but no session id was dispatched` | Worker predates the `omp_session_id` wire field | Deploy a new node-agent on every host |
| `omp_identity_rejected:` | Worker returned a different session than dispatched | Inspect the worker log; usually a `--resume` id that was never created |
| omp runs but makes no edits | Approval mode blocked tools | The worker passes `--auto-approve`; verify the deployed worker is current |
| omp fails immediately with "No models available" | No provider credential on that host | See "Provider credentials" below — this is the usual first-run failure |

Worker log: `$TMPDIR/node-agent-<task_id>/run.log`.

### Provider credentials

`omp` resolves its own provider credentials and does **not** read them from the
node-agent environment. A worker that has working `dsh` and `codex` executors
can still have no usable omp credential, because those agents authenticate
separately.

A card dispatched to such a node fails like this — note that the failure is
raised by omp itself, well after the executor was resolved:

```
provenance executor=omp requested=omp bin=/Users/x/.local/bin/omp args=["-p" "--auto-approve" "--mode" "json"] ws=...
No models available. Use /login or set an API key environment variable.
```

`install-mac.sh` and `install-windows.ps1` do not set any provider key, so a
freshly deployed host needs this once, as the same user that runs node-agent:

```sh
omp setup                        # interactive: sign in or paste a key
```

or, non-interactively, export a supported provider key into the service
environment — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and so
on — then restart the worker. For launchd that means adding the key to
`EnvironmentVariables` in `~/Library/LaunchAgents/com.adit.node-agent.plist`;
for Windows it means a user env var alongside the existing `NODE_AGENT_*` ones.

An authenticated `omp` run returns its session id in the provenance line, so
once credentials are in place `omp_session_id=...` appears and the card binds
normally.

---

## 12. Known gaps

- **Board export/import.** `internal/kanban/dataops.go` selects the harness
  binding columns **without `harness_kind`**, and import then writes
  `UPDATE tasks SET dsh_session_id=?`. An exported and re-imported `omp` card
  loses its kind (defaulting back to `dsh`) and mirrors its session id into the
  dsh column. Same pre-existing gap affects `commandcode`; recorded in
  `commandcode-executor.md` §11.
- **No model pinning.** The worker does not pass `--model`, so omp resolves the
  model from the host's own config and `/model` assignment. A board-level
  `model` is ignored for this executor, unlike `dsh` which honours `DSH_MODEL`.
- **No per-session lock.** dsh takes a `dshSessionLocks` mutex; `omp` does not.
  Two concurrent runs against the same card are already prevented upstream by
  the `current_run_id` claim fence, so this has not been observed in practice.
