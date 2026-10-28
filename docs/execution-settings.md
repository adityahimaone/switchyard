# Execution settings + node-owned model catalogs

Status: **design, not built.** Written after the create-task modal was found serving
model lists that belong to the *control plane*, not to the node that runs the card.

Two problems, one root cause:

1. The model picker in **Create task** lists models the VPS believes exist.
2. Settings has no **Execution** menu at all — `Executors` is a flat
   order/disable list with no per-executor configuration.

---

## 1. Evidence: the picker is not wrong, it is answering the wrong machine

`GET /api/models?executor=…` (`cmd/server/models_routes.go`) runs inside the
control plane on the VPS.

### 1.1 commandcode

| control plane returns | worker (Mac) actually has | cause |
|---|---|---|
| 93 models | 72 models from `cmd --list-models` (8 531 B, 128 lines) | `cmd` is **not installed on the VPS** (`which cmd` → nothing) → `fetchCommandCodeModels()` falls through to the static `commandCodeFallback` slice baked into Go |

### 1.2 dsh — three different answers for the same word "models"

There is no single "dsh model list". The catalog comes from the **profile's
`cordis.patch.yml`**, and the web GUI, the card dispatcher and the control plane
each read a *different* profile:

| surface | profile read | provider | models |
|---|---|---|---|
| DSH **web GUI** (what the user sees) | `~/.dsh/profiles/web` (51 lines) | `adit-router` → `claude-office, codex, f8, free, cheap, main` | **6** |
| **card dispatch** (node-agent) | `~/.dsh/profiles/headless` (4 287 lines) | `adit-9router`, 1 419 declared ids | **1 419** |
| VPS **`/api/models`** | VPS's own `~/.dsh/profiles/web`, which in this deployment *is* the 4 287-line catalog | `adit-9router` | **1 423** returned |

So "dsh has 1 405 models" was wrong twice over: my first count grepped every
`- id:` line in the file (1 405 unique **out of 1 419 declared**, including plugin
and provider ids), and the DSH GUI the user actually looks at shows **6**.

**Card dispatch reads `headless`, by design.** `dshIsolatedHome()`
(`node-agent/cmd/agent/main.go:2199`) runs cards under `~/.dsh-nodeagent` with
`profiles` **symlinked** to `~/.dsh/profiles`, and the run is launched with
`--profile headless`. The web profile exists to drive the GUI, not to run cards.

### 1.3 The mechanism that hides all of this

`fetchDSHModels()` (`cmd/server/models_routes.go:93`) tries `web` **first**, then
`headless`, and accepts a parse only when `len(parsed) > 13`
(`models_routes.go:116`):

```go
if parsed := parseCordisPatchModels(data); len(parsed) > 13 {
    return parsed
}
```

A legitimate 6-model web profile is therefore **rejected as implausible** and the
loop silently slides to `headless`. That single threshold is why the web GUI's 6
models can never appear in Switchyard, and why the answer looks "plausible but
stale" instead of "wrong profile".

`parseCordisPatchModels` then prepends 13 hardcoded entries — `deepseek-account:…`
(4) and `adit-9router/…` (9) — regardless of configuration. Neither profile
declares a `deepseek-account` provider at all, and the profiles' own default model
is `adit-router/main`. Those 13 pins are fabricated options: 1 419 − 8 colliding
pins + 13 = 1 424, which is the 1 423 observed.

Dispatch routing, for contrast, is already workspace-scoped and correct:
`pickDispatchNode` → `selectNodeForWorkspace` (`node-agent/cmd/server/main.go:631`)
picks the node that **owns the workspace path**, prefers the longest matching
workspace prefix, breaks ties by `NodeID`, skips `offline` nodes, and errors rather
than falling back when no owner advertises the executor.

So the picker and the dispatcher disagree about which machine they are talking
about. That is the bug.

## 2. What not to do

**Do not probe models through `POST /api/dispatch`.** The worker runs one job at a
time. A probe queued behind a 10-minute pen.dev design run blocks the Create task
modal for ten minutes — the exact failure already fixed in `remoteProbeWait`
(`internal/kanban/verify.go`, 90 s → 15 min). Model listing must never enter the
job queue.

**Do not key the list on the browser's OS.** "Fetch models for local mac or
windows" is the wrong axis. The routing rule is *workspace → node*, so the picker
must key on the node that owns the **selected workspace**, plus the executor. A
Windows browser editing a Mac workspace must be shown Mac models.

**Do not store a hand-edited catalog on the VPS.** A stored list is a second
source of truth that silently rots. Cache what a node reports; never author it.

## 3. Shape of the fix

### 3.1 Node advertises its catalogs (etag-gated)

The cache key is **(node, executor, profile)** — not just executor. A node holds
several dsh profiles and only one of them runs cards, so the key must name which
profile answer is being shown.

Extend the existing heartbeat — the same 15 s channel that already carries
`Versions` and `DSHHealth`, and that already implements a `refresh` request the
worker answers by re-probing versions:

- Worker keeps a local model cache per (executor, profile) with a content hash
  (`etag`) and a `fetched_at`.
- Every heartbeat sends hashes only —
  `model_catalogs: {dsh/headless: {etag, fetched_at}, commandcode: {etag, fetched_at}}`
  — a few hundred bytes.
- Control plane, on etag mismatch (or `refresh`), replies asking for the full
  payload once; the worker sends it on the next heartbeat and the control plane
  stores `{node_id, executor, profile, models[], fetched_at, source}`.
- `GET /api/models?executor=dsh&workspace=/Users/adityahimawan/Development/x`
  resolves the node with the *existing* `selectNodeForWorkspace` rule, reads the
  `--profile` that dispatch will actually pass (`headless` for dsh cards), and
  answers from the cache. `?refresh=1` asks that node for a re-probe.

Delete the `len(parsed) > 13` gate in `fetchDSHModels`. A small catalog is a valid
catalog; the threshold is what substituted the wrong profile. If a profile parses
to zero models the response says `source: unverified`, it does not silently pick a
different profile.

Why this and not a new relay endpoint: it reuses one request/response pair that is
already deployed, tested, and version-tolerant (the worker ignores unknown fields
and older servers answer `{"status":"ok"}`). Cost is ~40 lines per side.

Bloat math that forces the etag: `cmd --list-models` is 8.5 KB raw; the parsed dsh
catalog at ~70 B/model × 1 419 is roughly 100 KB. Unconditional 15 s advertisement
would be ~24 MB/hour per node. Hash-gating makes the steady state a few hundred
bytes.

**Probe in Go inside the worker**, not via a shell one-liner: `exec.Command("cmd",
"--list-models")` and a `cordis.patch.yml` read must behave identically on darwin,
windows and linux (PATH and separators differ), and the parsers already exist in
`cmd/server/models_routes.go` — move them into `internal/kanban/model_catalog.go`
and reuse them from both sides, do not fork them.

### 3.2 Per-executor settings schema

Today `ExecutorSettings` is:

```go
type ExecutorSettings struct {
    Order               []string         `json:"order"`
    Disabled            []string         `json:"disabled"`
    DefaultExecutionMode map[string]string `json:"default_execution_mode"`
}
```

`internal/kanban/executor_settings.go`, 142 lines, `~/.hermes/executor-settings.json`.
There is **no** per-executor configuration anywhere, even though dispatch supports:

| executor | knobs dispatch already honours |
|---|---|
| `dsh` | `profile` (web/headless), `model`, `effort` (auto/off/low/high/max), permission mode (read-only/workspace-write/danger-full-access), session continuation |
| `commandcode` | `model`, `effort`, `mode` (standard/plan/accept-edits/yolo) |
| `pen` | agent, model, design scope |
| `shell` | — |

Proposed: keep the file backwards compatible, add one open map per executor so new
agents are **data, not code**:

```go
type ExecutorSettings struct {
    Order                []string                   `json:"order"`
    Disabled             []string                   `json:"disabled"`
    DefaultExecutionMode map[string]string          `json:"default_execution_mode"`
    Executors            map[string]ExecutorConfig  `json:"executors,omitempty"`
}

type ExecutorConfig struct {
    Enabled      *bool             `json:"enabled,omitempty"`
    DefaultModel string            `json:"default_model,omitempty"`
    DefaultEffort string           `json:"default_effort,omitempty"`
    Options      map[string]string `json:"options,omitempty"` // profile, mode, permission…
}
```

`Enabled` is a pointer so "absent" means inherit from `Disabled`; the legacy list
stays authoritative for old files.

### 3.3 Settings → Execution menu

Rename the `executors` tab: **Execution**. Layout is a master list of agents with a
detail pane, because "each execution agent has different settings" cannot survive a
flat table.

Row: name, provider chip, `Enabled` switch, node availability (`mac ●`, `windows ○`),
model source badge (`node: dsh 1 405` / `fallback`), last fetched.

Detail pane, per executor:

- **Enable** — see open question 1; the copy must match the behaviour.
- **Defaults** — model, effort, and executor-specific option (dsh: profile +
  permission mode; commandcode: mode).
- **Models** — source (node / cached / fallback), `fetched_at`, node selector when
  several nodes advertise the executor, and **Fetch models now** → `?refresh=1`.
- **Availability** — which nodes advertise this executor, their version and
  `dsh_health`.

Create task then seeds its pickers from these defaults, marks entries whose node is
offline, and shows the node the workspace resolves to ("runs on **mac**").

## 4. Open questions (need an answer before build)

1. **Does "disable execution" mean hide-from-picker or refuse-to-run?** Today
   `disabled` is picker-only: an existing card keeps running. If the menu calls it
   *disable execution*, users will expect queued cards to stop. Pick one and make
   the label say it.
2. **Settings default vs per-card field — which wins?** Recommendation: settings
   seed the modal at open time, the card stores what was chosen, and later settings
   changes never rewrite existing cards.
3. **What does the picker show while a node's catalog is stale or unknown?** Three
   states need distinct copy; silently showing the static fallback is what caused
   this bug. Recommendation: show the node's last-known list with a visible
   "cached 3 h ago" badge, and only show fallback entries under an explicit
   "unverified" heading.
4. **Do offline nodes keep their cached catalogs?** Recommendation: yes, but the
   create-task modal warns that the workspace's node is offline before submitting.
5. **Is `auto` still first-class?** Both executors have model `auto` sentinels today.
   If defaults always name a concrete model, "auto" becomes unreachable from the UI.
6. **Which dsh profile is authoritative for the picker?** `web` (6 models, what the
   GUI shows) or `headless` (1 419, what a card actually runs)? Recommendation:
   the profile dispatch will pass, labelled — "dsh · headless profile · 1 419
   models" — because offering a model the run cannot use is the same bug in a new
   place. If you would rather have the create-task picker match the DSH GUI, that
   means aligning the headless profile to the web one, not teaching the picker to
   lie.
7. **Do the 13 hardcoded pins stay?** `deepseek-account:*` is not a configured
   provider in either profile, and both profiles default to `adit-router/main`.
   Recommendation: drop them; a pin that the profile cannot serve is a broken
   default waiting to be picked.

## 5. Scope guard

dsh and commandcode only, per the request. `pen`, `shell`, `hermes`, `codex`,
`claude`, `omp` get the enable/default row and nothing else. The `ExecutorConfig`
map is deliberately generic so giving the others real settings later is a data
change, not a refactor.

## 6. Acceptance criteria

- Create task, choose a Mac workspace → commandcode list equals that Mac's
  `cmd --list-models` (72 today); dsh list equals the `headless` profile's declared
  ids (1 419 today) and is labelled with the profile; both carry node id and
  `fetched_at` in the response.
- A profile that parses to fewer than 14 models is returned as-is, never replaced by
  another profile (regression test for the `len(parsed) > 13` gate: the `web`
  profile's 6 models must survive).
- Choose a Windows workspace → the lists change to that node's, with no code change.
- "Fetch models now" updates `fetched_at` and the list without a page reload and
  without occupying the node's job queue (assert: a card is `running` on that node
  during the fetch and is not delayed).
- Offline node → last-known list plus an explicit stale/offline badge, never a
  silent fallback.
- Executor settings survive an old `executor-settings.json` (legacy keys only) with
  no migration step.
- `go test ./...` and vitest green; no new `shellQuote`-style duplicate declarations
  in `package main`.

## 7. As built (turn 4–8)

Deviations from the plan above, each measured rather than guessed:

- The hand-maintained catalogs are gone, not just bypassed. `cmd/server/models_catalog.go`
  (1 527 lines, 13 fabricated pins, 93 static Command Code ids) was deleted; the
  parsers now return what a profile or CLI actually declares, and an empty list stays
  empty. The static Command Code list was already stale: it held 93 ids while the live
  `cmd --list-models` answered 94, and the dsh router profile moved from 1 423 to 1 419
  declared ids between measurements.
- `cmd --list-models` needed 4.3 s on a cold start against the old 5 s budget and failed
  at random under test load; the budget is 30 s.
- The agent resolves `cmd` through `findBin`, which now also globs
  `~/.nvm/versions/node/*/bin/<name>` and `%APPDATA%\npm\<name>.cmd`. Under launchd the
  node advertised "cmd not found" while the same machine ran the CLI from a terminal.
- `heartbeat.CommandCodeCatalog` puts the resolved binary's directory first on the
  child's `PATH`: the CLI is a `#!/usr/bin/env node` shim, so exit 127 came from a
  working binary whose interpreter was not on the inherited PATH.
- `ParseCommandCodeModels` required leading whitespace and a provider prefix; the CLI
  prints ids flush left and some ids carry no prefix, so the node parsed zero rows.
  Banner, docs footer and prose rows are skipped explicitly.

Verified end to end against the deployed pair (control plane `:8790`, bridge `:8788`,
Mac agent):

| workspace | executor | node | source | count |
| --- | --- | --- | --- | --- |
| `/Users/adityahimawan/Development/habbit-tracking-next` | dsh | mac | probed | 1 419 (`headless`) |
| same | commandcode | mac | probed | 94 |
| `C:\Development` | dsh | mac | cached | 1 419 |

The last row is a known wrinkle and is *correct by design*: the Mac agent advertises
some Windows workspace paths (it lists `C:\Development`), so a Windows path resolves to
whichever node dispatch would pick, and the picker must agree with dispatch rather than
be more clever than it. Windows-only paths (`C:\Users\User`) resolve to `windows`, whose
executor list has no `dsh`, and the response says `unavailable` instead of inventing a
list.
