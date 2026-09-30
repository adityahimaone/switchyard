# Local Windows development

Runs the whole stack on one Windows host: the Go control plane, the Vite dev
server, and a local node-agent server + worker so tasks actually execute here
instead of being dispatched to a VPS.

Nothing here is required for the Linux/VPS deployment described in the top-level
README. This is the developer loop.

## Prerequisites

| Tool | Notes |
|---|---|
| Go 1.25+ | Portable install works without admin: unzip to `%LOCALAPPDATA%\Programs\Go`, then add `go\bin` to the user PATH. |
| Node + pnpm | Already present on most dev hosts. |
| node-agent | Separate repo, separate Go module. See below. |

## One-time setup

```sh
git clone https://github.com/adityahimaone/node-agent C:/Development/node-agent

cd C:/Development/node-agent
go build -o bin/node-agent-server.exe ./cmd/server
go build -o bin/node-agent.exe ./cmd/agent
```

Create the local state home inside this repo. It is gitignored, so boards, auth,
and workspaces never touch the real user profile and a reset is just deleting
the folder:

```sh
mkdir .hermes-local
```

Write `.hermes-local/node-agent.env` with a shared secret. **No BOM and no
trailing newline** — the control plane parses it with a strict
`NODE_AGENT_TOKEN=` prefix match and silently treats a malformed file as "no
token", which surfaces as `{"status":"down","error":"invalid character 'u'"}`
(the node-agent server answers `unauthorized` in plain text, and that text is
what fails to parse as JSON).

```
NODE_AGENT_TOKEN=<64 hex chars>
```

Seed `.hermes-local/workspaces.json`. The worker matches task workspaces by
**prefix**, so this entry is what makes `C:\Development\...` routable:

```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "development",
      "path": "C:\\Development",
      "host": "localhost",
      "os": "windows",
      "note": "Local dev host."
    }
  ]
}
```

`host: "localhost"` is what marks the workspace `local` in the UI rather than
unreachable. See `internal/kanban/workspace.go`.

Initialize a board. `CreateBoard` only writes `board.json`; the `tasks` schema
comes from the Hermes CLI:

```sh
hermes kanban --board local init
```

## Run

Three processes. Start them in this order so the worker finds a server.

**1. node-agent server** (`:8788` HTTP, `:8789` gRPC):

```powershell
$t = (Get-Content .hermes-local\node-agent.env -Raw) -replace '^NODE_AGENT_TOKEN=',''
$env:NODE_AGENT_TOKEN = $t.Trim()
$env:NODE_AGENT_ADDR  = '127.0.0.1:8788'
& C:\Development\node-agent\bin\node-agent-server.exe
```

**2. node-agent worker**:

```powershell
$t = (Get-Content .hermes-local\node-agent.env -Raw) -replace '^NODE_AGENT_TOKEN=',''
$env:NODE_AGENT_TOKEN     = $t.Trim()
$env:NODE_AGENT_SERVER    = 'http://127.0.0.1:8788'
$env:NODE_AGENT_ID        = 'windows-local'
$env:NODE_AGENT_TRANSPORT = 'http'
& C:\Development\node-agent\bin\node-agent.exe
```

**3. control plane** (`:8790`):

```powershell
$t = (Get-Content .hermes-local\node-agent.env -Raw) -replace '^NODE_AGENT_TOKEN=',''
$env:NODE_AGENT_TOKEN = $t.Trim()
$env:HERMES_HOME      = 'C:\Development\switchyard\.hermes-local'
& C:\Development\switchyard\bin\kanban-board.exe
```

**4. UI** (`:5173`):

```sh
cd web && pnpm install && pnpm dev
```

Open <http://localhost:5173> and sign in with the seeded password `123456`
(`internal/kanban/auth.go`). Change it via `POST /api/auth/password` if the
port is ever exposed beyond loopback.

`web/vite.config.ts` already proxies `/api` to `127.0.0.1:8790`, so no proxy
configuration is needed.

## Environment variable traps

These are the failure modes that cost the most time, all of them silent.

**Set `NODE_AGENT_TOKEN` explicitly in every process.** `nodeAgentToken()`
prefers the environment over the token file, so a stale user-level
`NODE_AGENT_TOKEN` silently overrides a freshly rotated `.env` and every
request is rejected. On this host the user-level value pointed at a different
(VPS) deployment and had to be overridden per-process.

**Do not point the worker at `.hermes-local`.** node-agent reads
`$HOME/.hermes/workspaces.json` via `os.ExpandEnv` and ignores `HERMES_HOME`
entirely — the opposite of the control plane. Keep `HOME` pointing at the real
profile so the worker advertises real workspace prefixes.

**Do not repoint `HOME` for the control plane either.** Git resolves
`~/.gitconfig` through `HOME` on Windows, so redirecting it loses
`user.name` / `user.email` and the review gate's commit step fails. Set only
`HERMES_HOME` for the control plane.

**Vite binds IPv6.** It listens on `::1`, so `http://127.0.0.1:5173` is refused
while `http://localhost:5173` works.

**Board `execution_mode`.** A `shell` task defaults to `agentic`, where a
planner model picks commands and can exhaust its iteration budget. Set
`execution_mode: "direct"` to run `command` exactly once.

## Windows-specific code paths

The control plane now builds and runs on Windows. Four things needed work:

- `cmd/server/procgroup_unix.go` / `procgroup_windows.go` — `SysProcAttr.Setpgid`
  does not exist on Windows and blocked compilation outright.
- `cmd/server/main.go` — `filepath.Clean` turns `/assets/x.js` into
  `\assets\x.js` on Windows, so the asset-path check missed its prefix. That
  silently disabled both immutable caching and the deleted-chunk 404.
- `cmd/server/review.go` — the review gate sent a bash script to a `cmd /c`
  worker. See `reviewScopeSetupWindows`.
- `internal/kanban/kanban.go` — the column migration never added
  `workspace_transport` / `workspace_ssh_target`, so any board created by the
  Hermes CLI rejected every task insert.

### Nothing changed for Mac and Linux

The Windows work is additive. Every changed file keeps its POSIX behavior:

- `procgroup_unix.go` carries the original `Setpgid` call verbatim; only the call
  site moved behind `detachProcessGroup`.
- The `spa` asset-path fix normalizes to forward slashes, which is a no-op on
  macOS and Linux where `filepath.Clean` already uses `/`.
- The two `ALTER TABLE ... ADD COLUMN` migrations are additive `IF NOT
  EXISTS`-tolerant statements. On a board that already has the columns they hit
  the existing "duplicate column" filter and do nothing.
- `reviewScopeSetup` — the bash script Mac and Linux workers receive — is
  byte-for-byte unchanged. `reviewIsWindowsWorker` only chooses which script to
  send, and it reads the *workspace's* OS, not the control plane's. A Linux VPS
  dispatching to a Windows worker correctly sends the `cmd` dialect.

Two tests guard this and run on every platform:

- `TestReviewWorkerDialectFollowsWorkspaceOS` asserts a Mac, Linux, and Windows
  workspace each select the right dialect — including a `C:\` path on a host
  name that never mentions Windows.
- `TestReviewPOSIXScriptUnchanged` asserts the bash script keeps its function
  definition, `"$scope"` quoting, and `printf` markers.

`cmd/server/review_windows_test.go` is build-tagged `//go:build windows`, so its
helpers never enter the POSIX test build.

To verify all three targets after a change:

```sh
go build ./... && go vet ./...                    # native
GOOS=linux  GOARCH=amd64  go build ./... && GOOS=linux  GOARCH=amd64  go vet ./...
GOOS=darwin GOARCH=arm64 go build ./... && GOOS=darwin GOARCH=arm64 go vet ./...
```

Cross-compiling proves it compiles. To prove the POSIX tests still *pass*, run
them on a real Linux host — WSL works:

```sh
go test ./...
```

### Writing review scripts for Windows workers

`cmd/server/review_windows_test.go` documents this and must pass on any change
to `reviewScopeSetupWindows`. The worker runs a Windows shell task as
`cmd /c <one argv string>`, which imposes two constraints:

- **No double quotes.** Go quotes that argv element, so every `"` reaches cmd
  as `\"` and breaks its parsing.
- **No `%VAR%` set-then-read.** cmd expands `%VAR%` when it *parses* the line,
  so a variable assigned earlier on the same single line still reads back
  empty. Delayed expansion is unavailable because the worker does not pass
  `/v:on`.

The scripts therefore allocate no state: the repo guard is a single
exit-code check, and diffs scope with `.` because node-agent already sets the
worker's cwd to the task workspace.

## Pre-existing node-agent service on this host

This machine already had a node-agent worker installed by
`scripts/install-windows.ps1`, registered as the Scheduled Task `NodeAgent` and
pointing at a VPS that is currently unreachable
(`http://100.80.220.71:8788`). It is still running and polling, writing a failed
connection every ~23s to `~/.hermes/node-agent.log` (~9MB and growing).

It is **left running deliberately**. It talks to a different server, so it does
not compete with the local worker for jobs, and it writes only to its own log.
Two consequences to be aware of:

- Two `node-agent.exe` processes run at once. The local one is
  `C:\Development\node-agent\bin\node-agent.exe` (node id `windows-local`); the
  scheduled one is `~/.hermes/bin/node-agent.exe` (node id `windows`).
- The user-level `NODE_AGENT_TOKEN` in the environment is that old
  deployment's token. It does not affect the local stack as long as every local
  process sets `NODE_AGENT_TOKEN` explicitly, which is why the run commands
  above all do. Starting the control plane without that override makes it
  report `status: "down"` while looking perfectly configured.

To stop it later without uninstalling: `schtasks /End /TN NodeAgent`.

## Executors available here

The worker probes what is on `PATH` at registration and advertises only those:
`hermes`, `codex`, `dsh`, `commandcode`, `shell`.

- `commandcode` resolves to `cmdc` on Windows, never `cmd` — `commandCodeBin()`
  branches on `runtime.GOOS`. The *version string* reported in
  `/api/nodes` is cosmetic and may show a `cmd.exe` banner because
  `detectExecutors` probes `cmd` first on every platform.
- `omp` is not installed, so it is never advertised. Selecting it yields
  `executor unavailable`, which is expected rather than a setup fault.
- `codegraph` is absent; per the node-agent README that is non-fatal and jobs
  simply run without an index.

## Verifying

```powershell
# control plane can reach the worker (status must be "up")
curl http://127.0.0.1:8790/api/auth/status
# after POST /api/auth/login: /api/nodes must list windows-local, status idle
```

A dispatch canary: create a `shell` task with `execution_mode: "direct"` and
`command: "echo ok > canary.txt"`. The card should reach `review` (never
`done`), `canary.txt` should exist in the workspace, and
`GET /api/boards/local/tasks/{id}/diff` should list it as changed.

## Known pre-existing test failures on Windows

These are Unix assumptions in the test suite. They were confirmed pre-existing by
reproducing each one on a clean checkout with the changes stashed, and each one
passes on a real Linux host — so they are environment-specific, not regressions.

| Test | Cause | Passes on Linux |
|---|---|---|
| `TestCodeGraphScan*` (3 tests) | `exec: "sh": executable file not found` — shells out to `sh`, which Windows lacks | yes |
| `TestStartWorkspaceTerminalLocalReturnsSessionID` | same `sh` dependency | yes |
| `TestValidRelativeCodeGraphPath` | `a\b` is a valid relative path on Windows, rejected by a POSIX-only check | yes |
| `TestLocalWorkspaceExpandsTildeAndMissingPathIsNotHealthy` | `~` expansion resolves differently; no `~/apps/kanban-board` here | yes |
| `TestChatWorkspacePortabilityAndFork` | hardlink behavior differs | yes |
| `TestAttachmentAuthE2E` | SQLite WAL file handle cannot be removed on cleanup | yes |

`go vet ./...` is clean on all three targets. `go test ./cmd/server/` passes
completely on Linux; on Windows the only failures are the table above.

One Linux-only failure appears under WSL and is likewise environmental:
`TestValidateWorkspacePath` asserts `/home/adityahimaone/apps/kanban-board`
exists, but the WSL user is `adit`. It is not caused by these changes.

