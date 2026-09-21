# Kanban Execution Flow

## Purpose

Kanban task execution supports three explicit remote executor modes:

- `hermes`: Hermes CLI agent session.
- `codex`: OpenAI Codex CLI session.
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
3. Task must use SSH/node-agent transport.
4. VPS must never create or inspect `/Users/...` locally.
5. Verify target before dispatch:

```sh
ssh mac-tailscale 'test -d /Users/adityahimawan/Development/next-portfolio-blog && pwd'
```

Parent path registration does not replace exact child path registration when routing requires a distinct app workspace.

## Executor matrix

| Executor | Mac process | Preflight | Command source | Proof |
|---|---|---|---|---|
| `hermes` | `hermes chat -q ...` | CodeGraph + project prerequisites | task message | `provenance executor=hermes` |
| `codex` | `codex exec --full-auto ...` | CodeGraph + project prerequisites | task message | `provenance executor=codex` |
| `shell` | read-only planner → `bash -lc ...` | bounded iterations; optional shell preflight | task intent (agentic) atau `command` (direct) | provenance + iteration events |
| `auto` | Hermes first, fallback Codex/CommandCode | resolved executor rules | task message | resolved provenance |

Shell agentic mode gives a read-only planner workspace visibility, then executes only its structured command through the shell worker. Body remains task intent, direct mode uses `command`. Max iterations are bounded (default 6, hard cap 12), destructive patterns are blocked, and success still lands in review. RTK may rewrite shell commands within its bounded timeout (`rtk hook check` → `rtk rewrite`, 800 ms each), then the resulting command runs directly in the remote workspace. Output >8 KiB may be compacted via `rtk pipe --ultra-compact` when `NODE_AGENT_SHELL_CAVEMAN=1` (2 s cap, fail-open).

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
