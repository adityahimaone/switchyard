# DSH Harness Feature — Full Flow Documentation

> Feature knowledge for the DeepSeek Harness (`dsh`) executor: how Switchyard
> binds a card to one harness session, keeps it across review rounds, and
> validates what the worker returns.

---

## 1. Boundary

`dsh` is a Kanban task executor — not a Chat agent. Chat allowlist stays
`hermes` only; `dsh` is selectable on a task exactly like `hermes`, `codex`, and
`commandcode`. The generic Kanban flow (intent → dispatch → review → done) is
documented in `kanban-board-flow.md`; this document covers only what the DSH
feature adds: **session continuity**.

The problem it solves: a card returns to the user for review, the user posts a
comment, the card runs again. Without a binding each round would start a fresh
agent session and lose every prior turn. With a binding all rounds share one
DeepSeek Harness session, so round N sees rounds 1..N-1.

---

## 2. Components

| Layer | File | Role |
|---|---|---|
| Binding model | `internal/kanban/nodeagent.go` | `HarnessBinding`, deterministic ID, resolve/update |
| Schema | `internal/kanban/kanban.go` | `harness_bindings` table, `tasks.dsh_session_id`, `current_run_id` |
| Dispatch | `cmd/server/remote_dispatch.go` | Builds the continuation request from the binding |
| Legacy dispatcher | `cmd/server/ssh_dispatch.go` | Same binding logic on the SSH lane |
| Result validation | `internal/kanban/nodeagent.go` | `resolveDSHResultIdentity`, `finalizeRemoteResult` |
| Worker | node-agent `cmd/agent/main.go` | Runs `dsh`, preserves session, isolated home |
| Worker contract | node-agent `docs/dsh-harness.md` | Machine-level detail for the worker side |
| UI | `web/src/features/board/TaskDialog.tsx` | Executor picker |
| UI | `web/src/features/board/OutputPanels.tsx` | `DshResultPanel` |
| Types | `web/src/api.ts` | Executor union |

---

## 3. Data model

### `harness_bindings` — one row per card

```sql
CREATE TABLE IF NOT EXISTS harness_bindings (
  card_id             TEXT PRIMARY KEY,
  workspace_path      TEXT NOT NULL,
  harness_workspace_id TEXT NOT NULL,
  harness_session_id  TEXT NOT NULL,
  last_turn_seq       INTEGER NOT NULL DEFAULT -1,
  last_comment_id     INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_harness_bindings_session ON harness_bindings(harness_session_id);
```

`status` is `active` (never completed a turn), `idle` (last turn succeeded), or
`error` (identity validation failed).

### Task columns

- `tasks.dsh_session_id` — legacy per-card session, still read for adoption.
- `tasks.current_run_id` — run ownership; a result only applies while the row is
  `running` **and** `current_run_id` matches.

---

## 4. Deterministic session ID

```go
func DeterministicDSHSessionID(boardID, cardID string) string {
    h := sha1.Sum([]byte(boardID + "/" + cardID))
    return "switchyard-card-" + hex.EncodeToString(h[:8])
}
```

Same board + same card always yields the same ID (`switchyard-card-` + 16 hex
chars). A card with no prior session is created with this ID so a retried
initial dispatch targets the same session rather than minting a new one.

Note the ID is written to the binding as the *intended* session. It is **not**
sent to the worker on the first run — see §6.

---

## 5. Binding resolution

`ResolveHarnessBinding(db, boardID, cardID, workspacePath)` returns
`(binding, continuation, error)`:

1. Row exists → workspace must match exactly after `filepath.Clean`. A different
   workspace fails with `card <id> is bound to workspace "<a>", not "<b>"`.
   `continuation = status != "active" && harness_workspace_id != "" &&
   harness_session_id != ""`.
2. No row → adopt legacy `tasks.dsh_session_id` when non-empty (status `idle`),
   otherwise mint the deterministic ID (status `active`). Insert with
   `INSERT OR IGNORE`, then re-read.

`continuation` is the single flag that decides whether this dispatch resumes an
existing session or starts one.

---

## 6. Dispatch

`remote_dispatch.go` polls every board every 30s for `status IN ('todo','ready')`
with `workspace_transport='node-agent'`.

For `executor == "dsh"` the dispatcher:

```go
binding, sessionContinuation, err = kanban.ResolveHarnessBinding(db, b.Slug, r.id, r.ws)
dshSessionID := dispatchDSHSessionID(binding, sessionContinuation)
```

```go
func dispatchDSHSessionID(binding kanban.HarnessBinding, continuation bool) string {
    if !continuation { return "" }
    return binding.HarnessSessionID
}
```

**The first run sends an empty session ID on purpose.** The worker omits
`--session-id`, DSH creates the session, and the worker returns the real ID. A
placeholder ID would fail with
`session "..." does not exist; omit --session-id to start a new Session`.

The request carries:

```json
{
  "dsh_workspace_id": "<uuid>",
  "dsh_session_id": "session-<uuid>",
  "last_turn_seq": 2,
  "last_comment_id": 41,
  "run_id": "<uuid>",
  "session_continuation": true
}
```

`LastTurnSeq` and `LastCommentID` are pointers and are set only for `dsh`, so
other executors never receive a harness cursor.

### Message assembly

Before dispatch the message is built in this order:

1. Body, falling back to title.
2. Comments after `binding.LastCommentID` via `TaskCommentsAfter`, rendered by
   `RenderReviewComments`. On a continuation this feedback **replaces** the base
   message; on a first run it is appended. If a continuation has no new comment,
   the message is prefixed with `[CONTINUATION] Resume the existing DSH session
   and apply only the new task feedback below.`
3. For `dsh` only: `FocusedGitReviewPrompt` may compact the message for a
   git-review ask. When it does, `PrepareTaskExecutionMessage` is skipped.
4. When not a focused prompt and not a continuation but a previous result
   exists, the previous result is embedded (truncated at 800 chars) as
   `[CONTINUATION]`.
5. Recent-comment tail: `commentLimit = 0` for `dsh`. Harness cards rely on the
   cursor in step 2; replaying the last 5 comments would duplicate feedback the
   session already saw.

`dsh` is also blocked when the profile has no resolvable model
(`ProfileModel(assignee)` error), since the model is passed to the worker.

### Guard rails

- A prior `node_agent_job_timeout:` / `dispatch_wait_timeout:` on a
  non-continuation with an existing result is blocked immediately as
  `repeated timeout on continuation — needs a fresh single-shot run`.
- The task is claimed via `ClaimTaskRun` before dispatch; the claim's run ID
  becomes `RunID` and `TaskID` in the request.

---

## 7. Worker contract

The worker must preserve identity; the control plane refuses to paper over
mismatches. Summary (full detail in node-agent `docs/dsh-harness.md`):

- Run `dsh --profile headless --json`, adding `--session-id <id>` only on a
  continuation.
- Read the session ID and cwd from the emitted `session` event. No event is
  `dsh_session_missing` — never a silent success.
- Never clear `dsh_session_id`, never create a new session to escape a failure,
  never downgrade a continuation to a cold run.
- Fail `dsh_session_conflict` when the session's write handle is held elsewhere.
- Verify the resumed session cwd equals the dispatched workspace.
- Run under an isolated `DSH_HOME` (`~/.dsh-nodeagent`) so its lock does not
  contend with `dsh web`'s non-expiring `flock(2)`; link credentials and
  profiles in, copy legacy sessions in, and publish the finished session back
  into `~/.dsh` (transcript + registry entry, never the lock file).

---

## 8. Result validation

`resolveDSHResultIdentity(req, result)` collects the returned session ID from
`dsh_session_id`, then `session_id`, then a regex over the output text. Then:

| Condition | Error |
|---|---|
| returned session != dispatched session | `worker returned session "<a>", dispatched session was "<b>"` |
| returned workspace != dispatched workspace | `worker returned workspace "<a>", dispatched workspace was "<b>"` |
| success but no session ID | `worker result omitted session id` |
| success but no workspace ID | `worker result omitted workspace id` |
| success but no turn sequence | `worker result omitted last turn sequence` |
| success but sequence not past the cursor | `worker returned stale turn sequence <n>, dispatched cursor was <m>` |

The last check is what stops an old run from overwriting a newer one: a
continuation must advance `last_turn_seq` past the dispatched cursor.

A failure here sets `res.Success = false` and prefixes the message with
`dsh_identity_rejected: `, so the card lands in `blocked` with that exact text in
`last_failure_error` — the raw error is never surfaced unprefixed.

---

## 9. Finalization

`finalizeRemoteResult` runs in one transaction:

1. Update the task, guarded by `WHERE id=? AND status='running'` plus
   `AND current_run_id=?` when a run ID exists. A result that no longer owns the
   run affects zero rows and is discarded.
2. Status: `todo` when a comment newer than the dispatched baseline already
   exists (the user commented mid-run — requeue), else `review` on success, else
   `blocked`.
3. For `dsh`, `updateDSHBindingTx` persists the identity:

```sql
UPDATE harness_bindings SET
  harness_session_id = ?,
  harness_workspace_id = CASE WHEN ?='' THEN harness_workspace_id ELSE ? END,
  last_turn_seq = CASE WHEN ? IS NOT NULL AND ? > last_turn_seq THEN ? ELSE last_turn_seq END,
  last_comment_id = CASE WHEN ? AND ? IS NOT NULL AND ? > last_comment_id THEN ? ELSE last_comment_id END,
  status = CASE WHEN ? THEN 'idle' ELSE 'error' END,
  updated_at = ?
WHERE card_id = ?
```

`last_turn_seq` and `last_comment_id` only ever move **forward**, and
`last_comment_id` advances only on a successful turn — that is what makes failed
turns replay unconfirmed review comments.

When the identity is invalid the binding is marked `status='error'` and the task
session is left untouched.

4. Insert the `task_events` row (`completed` or `failed`) with executor, output,
   error, duration, and usage when present.

Event kinds on a DSH card: `remote_dispatched` (node_id, started_at, run_id),
`completed`, `failed`.

---

## 10. Card looping

To advance a card one round: post the comment, then reopen it. A card in
`review` is not claimable, and a plain comment does not reopen it.

```sh
hermes kanban --board <board> comment <card> --author user "<message>"
hermes kanban --board <board> reopen-review <card>
```

Each round reuses `harness_session_id` and advances `last_turn_seq`. Verified
good: three loops on one card and four on another, single session each, zero
conflicts.

---

## 11. Frontend

- `TaskDialog.tsx` — executor `<SelectItem value="dsh">DeepSeek Harness</SelectItem>`.
- `api.ts` — `executor: "auto" | "hermes" | "codex" | "commandcode" | "dsh" | "shell"`.
- `OutputPanels.tsx` — `ResultPanel` renders `DshResultPanel` when
  `executor === "dsh"`. It splits the raw result into:
  - a provenance line starting `provenance executor=dsh`, from which it reads
    `ws`, `dsh_session_id`, `dsh_session_cwd`, `bin`, and the `args=[...]` block;
  - JSON event lines, collecting `type === "text"` as the answer and all other
    types as trace events.

  The panel shows session and workspace, the answer (or an explicit "No final
  answer text returned" when the run produced none), a collapsible raw trace, and
  a copy button. A non-JSON result still renders — parse failures are ignored per
  line, so provenance and executor-proof lines never throw.

---

## 12. Failure map

| Symptom | Cause | Fix |
|---|---|---|
| `dsh_session_conflict` | Another process owns the session write handle (`dsh web`) | Confirm the worker uses the isolated `DSH_HOME`; do not tune retries |
| `worker returned session "..."` | Worker started a cold session on a continuation | Fix the worker, not the card |
| `worker returned stale turn sequence` | An older run returned after a newer one | Inspect `current_run_id`; the row was already re-dispatched |
| `worker result omitted session id` | `--json` produced no session event | Check the worker's `--session-id` argument in `$TMPDIR/node-agent-<task>/run.log` |
| `dsh_workspace_mismatch` | Card bound to one workspace, session created in another | Correct the card workspace; the session belongs to another repo |
| `executor unavailable on node: dsh` | Worker has no `dsh` on PATH or has not re-registered | Install `@deepseek-ai/dsh`, restart node-agent, check `/api/nodes` |
| `card <id> is bound to workspace "<a>"` | Card workspace changed after binding | Bindings are immutable per workspace; create a new card or accept the original path |
| `dsh_unavailable` / `dsh_session_missing` | Fatal worker errors, or a missing `dsh` binary | On the SSH lane these are excluded from the retry list (fail immediately); check the worker's PATH and restart node-agent |
| Session missing from `dsh web` | Worker did not publish, or `NODE_AGENT_DSH_PUBLISH=0` | Worker log must show `dsh session publish: mirrored session ...` |

---

## 13. Verification

```sh
# Binding state for a card
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT card_id,harness_session_id,last_turn_seq,last_comment_id,status FROM harness_bindings WHERE card_id='<card>'"

# One session across all rounds, no conflicts
sqlite3 .../kanban.db "SELECT kind,created_at FROM task_events WHERE task_id='<card>' ORDER BY id"

# Code-level
go test ./internal/kanban -run 'Harness|DSH'
go test ./cmd/server -run 'DSH'
```

Tests covering this feature: `TestResolveHarnessBindingCreatesThenReusesDeterministicSession`,
`TestResolveHarnessBindingAdoptsLegacySession`,
`TestResolveHarnessBindingRejectsWorkspaceChange`,
`TestResolveDSHResultIdentityRejectsMismatches`,
`TestNodeDispatchCarriesDSHContinuation`,
`TestNodeDispatchOmitsDSHCursorForOtherExecutors`,
`TestDSHSessionProofAcceptsOutputFormats`,
`TestDispatchDSHSessionIDOnlyResumesExistingBinding`,
`TestContinuationNeedsExplicitExecutor`.

---

## 14. Files reference

| Path | Role |
|---|---|
| `internal/kanban/nodeagent.go` | Binding model, deterministic ID, result identity, finalization |
| `internal/kanban/kanban.go` | `harness_bindings` schema and task columns |
| `internal/kanban/dataops.go` | Binding preservation on board export/import |
| `internal/kanban/comments.go` | `TaskCommentsAfter`, `RenderReviewComments` |
| `cmd/server/remote_dispatch.go` | node-agent lane dispatch |
| `cmd/server/ssh_dispatch.go` | SSH lane dispatch, `remoteTransportForPath` |
| `web/src/features/board/OutputPanels.tsx` | `DshResultPanel` |
| `web/src/features/board/TaskDialog.tsx` | Executor picker |
| node-agent `docs/dsh-harness.md` | Worker-side contract |

## 15. Related documents

- `kanban-board-flow.md` — generic task flow A–Z
- `docs/execution-flow.md` — executor matrix, routing, provenance checklist
- `docs/switchyard-harness-session-continuity-progress.md` — continuity rollout
- node-agent `docs/test-case-dsh-isolated-home-three-loop.md` — real-card loop tests
