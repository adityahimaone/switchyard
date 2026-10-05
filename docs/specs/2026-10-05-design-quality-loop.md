# Design quality loop — implemented spec

Date: 2026-10-05 · implements `~/.commandcode/plans/2026-10-04-design-quality-loop.md`
(Phases 1–3). That file is the design rationale; this is the record of
what exists, verified against the code on 2026-10-05.

## The loop

A UI task cannot reach review without evidence. After a successful
remote dispatch, Switchyard runs a **verify gate** — the same fenced
machinery as the quality gate (`RunGateCommand` pattern, separate
`verify_run_id` column so a verify and a gate can be in flight on one
task at once) — and pulls the artifacts the gate produced into the
review panel.

### Routing — two orthogonal fields

```
verify_profile:  none → fast → ui → e2e     (gate; runs after code)
design_source:   (empty) | design/<surface>.pen  (input; exists before code)
```

- `verify_profile` — enum `none|fast|ui|e2e`, **empty means auto**
  (route from the diff; a missing value is never `fast`, so every
  pre-existing card keeps today's behaviour). Auto-routing escalates
  only; an explicit field always wins. Rungs are cumulative.
- `design_source` — a `.pen` path. Empty on every card that needs no
  drawing; only a card with one ever invokes pen.dev.

Routing reads the exact file set the review gate diffs (the worktree
against `HEAD` in the task workdir): nothing under `web/` → `none`;
`web/src/**` → `ui`; a path in `web/e2e-flows.txt` → `e2e`. The
effective value is stored on the task (`verify_profile_effective`) so
the routed choice is auditable, and `verify_skipped` records a `none`
card that was routed past the gate — "nothing ran" and "the hook
silently failed" stay distinguishable.

### Backend (Switchyard, Go)

- Columns `verify_profile`, `design_source` (+ `verify_status`,
  `verify_output`, `verify_run_id`, `verify_profile_effective`),
  migration through the existing `ensure*` helpers, appended at the
  end of `taskSelectCols()`/`scanTask`/INSERT so the three lists stay
  in lockstep. Reset on retry (`reliability.go`).
- `internal/kanban/verify.go` — routing, command construction
  (`pnpm verify:fast` → `+ playwright test` → `+ e2e run`), and the
  fenced run with artifact ingest.
- Hook at `cmd/server/remote_dispatch.go`, beside `runQualityGate`,
  passing the worktree workspace; gated by `KANBAN_VERIFY_ENABLED=0`
  to restore the exact pre-verify dispatcher.
- `design_source` is injected into the agent prompt (after the
  recent-comments block, so it lands in every message variant).
- Routes: `PATCH /api/boards/{slug}/tasks/{id}/fields` (narrow
  allowlist — `verify_profile` and `design_source` only, deliberately
  not a generic task PATCH), `GET`/`POST .../verify`, and the approve
  veto: a failed verify refuses approval unless `force: true`, and the
  override is recorded. The 409 offers a recorded "Approve anyway" in
  the UI — without it a red card was a dead end.
- Events: `verify_enqueued`, `verify_started`, `verify_passed`,
  `verify_failed`, `verify_skipped`, `verify_unavailable` (a node with
  no browser completes honestly degraded, not falsely green).

### node-agent (Go)

- Artifact transport: `POST /api/nodes/{id}/artifacts/{task_id}`
  (multipart) to disk under `NODE_AGENT_ARTIFACT_DIR` — not memory
  (results are in-memory with a 2 h TTL). Caps: 5 MB/file, 30 MB/task,
  7-day sweep; content-sniffed MIME; generated filenames; uploads are
  untrusted input, never executed. Metadata (`name, path, sha256,
  bytes, mime`) rides the existing result channel on both the HTTP and
  gRPC paths. Per-dispatch `timeout_s` (visual suites outlast the
  600 s default); `NODE_AGENT_SHELL_AGENTIC_TIMEOUT` (1200 s)
  documented.
- Node selection **already existed**: nodes advertise `executors` at
  registration (`detectExecutors`), and the dispatch endpoint routes
  by workspace prefix (longest match wins), filtering candidates by
  advertised executor. Phase 3 extracted that decision into
  `pickDispatchNode` so every outcome is testable — the match, both
  409 rejections, the no-workspace fallback and the 503 — and made
  the fallback deterministic (lowest online node id; `reg.List()`
  ranges a map, so "first online" was random per call).
- Rejections: `409 executor unavailable on node(s) owning workspace:
  <executor>` (capability miss), `409 no node owns workspace "<ws>"
  (registered: ...)` (routing miss), `503 no nodes available`.

### Switchyard ingest + review panel

- Artifacts are pulled server-side over the authenticated node-agent
  client and stored through the existing attachment blobstore
  (`StoreAttachmentBytes` + `LinkTaskAttachment`) — the agent never
  POSTs to `/api/attachments` directly (every `/api/*` route is behind
  the `kanban_session` cookie). `GET /api/attachments/{id}` renders
  inline.
- `ReviewSection.tsx` gained the first artifact renderer in the review
  UI (it was text-only): a Verification block with light and dark
  screenshots side by side. `ReviewGateBar` gained "re-run verify"
  and the failure state. `TaskDetailPage` has an editable Verification
  section (`VerifySettings`); `TaskDialog` has the Verify profile
  `Select` beside Execution mode plus the Design source input.

## Tooling (Phase 2–3)

- **pen.dev** — two paths, kept separate: the desktop MCP
  (`--app desktop`, Mac, interactive work on the open document) and
  the `pen` CLI (any node, headless `--prompt`/`--export`, the one
  that can run in a dispatched shell task). `design/` holds the
  workflow: one `.pen` with two frames (`themes: { mode:
  ["light","dark"] }`), the exported PNG committed beside it as the
  reviewable artefact and the compare reference. Cautions recorded in
  `design/README.md`: `Export()` can print an error and still exit 0
  (always assert the file exists), and free tier is 5 agent-days +
  25 image generations per month.
- **`verify:ui` compare mode** — when a `design/manifest.json` entry
  exists for the surface, `e2e/design-compare.spec.ts` renders the
  page, screenshots it, and diffs against the export at a 10% budget
  (explicit render → screenshot → decode → diff; Playwright flattens
  any name into `snapshotDir`, so `toHaveScreenshot` cannot point at a
  design export). An empty manifest skips cleanly.
- **e2e** — deterministic only: `screen.*` locators and `expect`, no
  `agent.act`, so no model, no login, no tokens. One real flow
  (sign-in → board → task) exists; `e2e-flows.txt` is the flow-ownership
  list that escalates a path change from `ui` to `e2e` (glob patterns
  supported; dead entries fail a test). `e2e mcp` registered for the
  live app.
- **token-lint** — rule 5 (glass count per file, warn above 8 uses of
  the blurred tiers `glass`/`glass-strong`; `glass-card` does not
  blur, and the match is anchored so its prefix never reads as
  `glass`) and rule 6 (contrast, sRGB-linearised: each glass fill
  composited over the worst-case backdrop — an orb directly behind the
  panel — read live from `index.css`, failing below WCAG AA 4.5:1).
  Rule 6 is the static twin of the axe pass; a token edit that breaks
  contrast now fails `verify:fast` instead of only a hand-run script.
- **Lighthouse budgets** — `web/lighthouserc.json` + `pnpm verify:perf`
  (build → `lhci collect` → `lhci assert`). Budgets are the measured
  2026-10-05 ceilings with headroom for run-to-run variance on the
  reference VPS, not targets: the gate fails on regression, and
  tightening one is deliberate work. Deliberately outside
  `verify:fast`/`verify:ui` (a run takes a minute and needs Chrome;
  the script falls back to the Playwright chromium the visual suite
  downloads). Note: `lhci assert` alone is a false green — with no
  collected results it reports 0 URLs and passes — so the script runs
  collect first. LHCI 0.15 takes `settings.chromeFlags` as a
  space-separated **string**, not an array.
- **e2e mobile** — `@e2e-dev/mobile` is installed but there is
  deliberately no mobile target: the engine drives native apps
  (`app.bundleId`/`app.appPath`) and `app.url` is not supported on a
  device target yet, so a web app has nothing to point a device at.
  The one-line-per-machine target config and the `agent-device doctor`
  prerequisite are recorded in `design/README.md` for when the app
  ships a native shell or agent-device learns to open a URL.

## Documentation accuracy (Phase 3, N7)

- Switchyard `README.md`: the SSH fallback is gone (the lane was
  retired; `MigrateRetiredTransport` rewrites `ssh` to `node-agent` at
  startup), node selection happens at node-agent's dispatch endpoint,
  and the three real rejection messages replace the invented
  `executor unavailable`.
- node-agent `README.md`: workspace routing no longer conflates the
  `auto` *executor* with node selection (a task with no workspace gets
  an online node from dispatch, unrelated to `auto`), and lists the
  rejection cases.

## Deliberately not done

- **DTCG tokens + Style Dictionary** — conditional on pen.dev tokens
  becoming authoritative; no `.pen` exists yet (`design/manifest.json`
  is empty), so the condition is unmet.
- **`pen login` / `PEN_CLI_KEY`**, the first exported mock at
  `--export-scale 1`, and the desktop pen MCP registration — user
  actions (interactive auth, or Mac-only), documented in
  `design/README.md`.
- **`e2e-flows.txt` growth** — operational: add the owning path when
  a flow breaks without a path change.

## Verification state

Both Go suites green (kanban-board: `cmd/server`, `internal/kanban`,
`cmd/mcp-server`; node-agent: all packages), `tsc -b` clean, 106
vitest tests pass, token-lint 0 errors (4 pre-existing warnings),
`verify:perf` holds all 14 Lighthouse assertions across both served
pages. Known host limitations, pre-existing and unchanged: the
Playwright visual suite fails on this VPS with `could not seed the
todo card: 401` (reproduced on a clean tree), and `tsc -b` covers
`src` only, so `web/e2e/*` specs are type-unchecked.
