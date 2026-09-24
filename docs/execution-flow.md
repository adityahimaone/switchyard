# Kanban Execution Flow

## Purpose

Kanban task execution supports four explicit remote executor modes:

- `hermes`: Hermes CLI agent session.
- `codex`: OpenAI Codex CLI session.
- `dsh`: DeepSeek Harness headless profile on workspace host.
- `shell`: agentic shell access on remote workspace by default; direct one-shot mode remains compatible, with RTK rewrite.
- `auto`: compatibility mode. Resolves Hermes first, then Codex, then CommandCode.

Use explicit executor when provenance matters. Do not use `auto` for executor comparison.

## End-to-end flow

```text
Kanban UI
  -> task row: board, workspace, profile, executor, priority
  -> dispatcher claims todo/ready task
  -> workspace registry validates exact remote path
  -> node-agent routes to mac-tailscale
  -> Mac worker resolves executor
  -> executor runs with workspace as cwd
  -> worker captures output + provenance
  -> result API updates task status/result/events
  -> UI reads task row and task events
```

## Remote workspace routing

1. Register exact app path in `~/.hermes/workspaces.json`.
2. Entry must identify `host: mac-tailscale`, `os: mac`, and path.
3. Task must use `node-agent` transport. A remote path without an explicit transport is classified by `remoteTransportForPath` — `/Users/...` → `node-agent` + `mac-tailscale`, `C:\...` → `node-agent` + `windows-tailscale`. An explicit `ssh` or `node-agent` value is honored as-is.
4. VPS must never create or inspect `/Users/...` locally.
5. Verify target before dispatch:

```sh
ssh mac-tailscale 'test -d /Users/adityahimawan/Development/next-portfolio-blog && pwd'
```

Parent path registration does not replace exact child path registration when routing requires a distinct app workspace.

Remote paths must not be downgraded to SSH or to a VPS-local run: the local dispatcher excludes any task whose `workspace_transport` is `ssh` or `node-agent` (`hermes_cli/kanban_db_dispatch.py`), so a misclassified row would otherwise be claimed by the wrong dispatcher instead of failing loudly.

## Executor matrix

| Executor | Mac process | Preflight | Command source | Proof |
|---|---|---|---|---|
| `hermes` | `hermes chat -q ...` | CodeGraph + project prerequisites | task message | `provenance executor=hermes` |
| `codex` | `codex exec --full-auto ...` | CodeGraph + project prerequisites | task message | `provenance executor=codex` |
| `dsh` | `dsh --profile headless --json [--session-id <id>]` | `dsh --version` health check + CodeGraph | task message | `provenance executor=dsh` + `dsh_session_id` |
| `shell` | read-only planner → `bash -lc ...` | bounded iterations; optional shell preflight | task intent (agentic) atau `command` (direct) | provenance + iteration events |
| `auto` | Hermes first, fallback Codex/CommandCode | resolved executor rules | task message | resolved provenance |

Shell agentic mode gives a read-only planner workspace visibility, then executes only its structured command through the shell worker. Body remains task intent, direct mode uses `command`. Max iterations are bounded (default 6, hard cap 12), destructive patterns are blocked, and success still lands in review. RTK may rewrite shell commands within its bounded timeout (`rtk hook check` → `rtk rewrite`, 800 ms each), then the resulting command runs directly in the remote workspace. Output >8 KiB may be compacted via `rtk pipe --ultra-compact` when `NODE_AGENT_SHELL_CAVEMAN=1` (2 s cap, fail-open).

## DSH session continuity

Switchyard stores one `harness_bindings` row per card and sends `dsh_workspace_id`, deterministic `dsh_session_id`, `last_turn_seq`, `last_comment_id`, and `session_continuation` to node-agent.

Node-agent must follow this contract:

1. When `session_continuation` is false, idempotently ensure workspace and create or adopt `dsh_session_id`, attach session, then prompt it.
2. When `session_continuation` is true, resume or attach `dsh_session_id` and call `session.prompt`; never create a new session or spawn a stateless DSH CLI run.
3. Follow events after `last_turn_seq`, then return `dsh_workspace_id`, `dsh_session_id`, and highest consumed `last_turn_seq` in result.
4. Treat `last_comment_id` as dispatch metadata. Switchyard advances it only after successful turn, so failed turns replay unconfirmed comments.

Review comments use same session with explicit task, card, reviewer, and comment attribution. Comments arriving during active turn requeue card after turn completes. Existing in-flight cards without bindings adopt legacy `tasks.dsh_session_id` when available.

### Worker-side session rules

The binding is only useful if the worker preserves it. The worker must:

- omit `--session-id` on an initial run and adopt the session ID DSH creates,
  then return it in the result;
- pass `--session-id <dispatched>` on every continuation and never clear or
  replace it;
- fail the run rather than downgrade to a cold session when the session cannot
  be resumed, returning `dsh_session_conflict` instead of a new session;
- verify the resumed session's cwd against the dispatched workspace and fail with
  `dsh_workspace_mismatch` on divergence;
- emit a `session` event from `--json`; no session event is
  `dsh_session_missing`, never a silent success.

Switchyard re-checks the returned identity: a session or workspace that differs
from the dispatch is rejected, and a turn sequence that did not advance past the
dispatched cursor is rejected as stale.

### Isolated DSH home

The worker runs headless `dsh` under an isolated `DSH_HOME`
(`~/.dsh-nodeagent` by default) because `dsh web` holds an OS `flock(2)` write
handle on `session.lock` for its whole process lifetime and the installed build
never expires that lease. Sharing `~/.dsh` makes every continuation contend with
the daemon; retry tuning does not fix it.

Legacy sessions under `~/.dsh` are copied (never symlinked) into the isolated
home on continuation, which gives the isolated home an independent lock inode.
After a successful run the worker publishes the session back into `~/.dsh` —
transcript **and** a `storages/workspace.json` registry entry, since the UI
enumerates from the registry. The lock file is deliberately not published.

Machine-readable worker contract: [node-agent docs/dsh-harness.md](https://github.com/adityahimaone/node-agent/blob/master/docs/dsh-harness.md).

## Lifecycle

```text
todo/ready -> running -> review -> done
                         \-> blocked
```

- `running`: dispatcher claimed task and worker is active.
- `review`: worker returned output requiring inspection.
- `done`: result and acceptance evidence verified.
- `blocked`: execution failed, auth/quota prevented work, or evidence contract failed.

## Preflight checklist

- Board and task scope explicit.
- Profile exists and is valid.
- Workspace exact path registered.
- SSH/Tailscale target reachable.
- Node advertises requested executor.
- CodeGraph status checked for AI executors.
- Shell command safe and self-contained.
- Priority, board, workspace, and executor recorded.

## Provenance checklist

Read all three, not only the task result text:

1. Task row: requested executor and workspace transport.
2. Node-agent result: `provenance executor=... requested=... bin=... args=... ws=...`.
3. Mac worker log: `$TMPDIR/node-agent-<task_id>/run.log`.
4. Task events and final artifact.

`Sisyphus` in output is not executor proof. It can come from an AI session or inherited prompt output. Trust the provenance header and worker log.

## Error map

### `Permission denied: /Users`

Cause: VPS treated Mac path as local. Fix: register exact remote workspace and force SSH/node-agent transport.

### `blocker_auth` or `respawn_guarded`

Cause: stale failure metadata or real auth/quota failure. Clear stale metadata only after reading the worker log. Preserve guard behavior for real auth/quota errors.

### `executor_unavailable`

Cause: requested binary is absent from Mac worker PATH. Verify `command -v hermes`, `command -v codex`, or `command -v rtk` under launchd environment. Reinstall/restart worker after node-agent upgrade.

### Exit code 3

Cause: worker returned failure. Inspect raw result and artifact first. Do not manually mark done without evidence. Browser/provider limitations belong in the report as `NOT VERIFIED`, not as fabricated PASS.

### Browser visibility unavailable

Static/SSR/HTTP evidence does not prove viewport clickability. Mark desktop/mobile clickability `NOT VERIFIED` when browser access is blocked.

## Verification commands

```sh
cd ~/apps/node-agent
go test ./...
go vet ./...
go build ./cmd/agent

cd ~/apps/kanban-board/web
pnpm build
```

Runtime proof task bodies should print executor-specific markers:

```sh
# shell
printf 'EXECUTOR_PROOF=shell '; command -v bash; command -v rtk; pwd

# codex prompt
printf 'EXECUTOR_PROOF=codex '; command -v codex; codex --version

# hermes prompt
printf 'EXECUTOR_PROOF=hermes '; command -v hermes; hermes --version
```

Never claim executor separation from duration, task label, or the word `Sisyphus` alone.
