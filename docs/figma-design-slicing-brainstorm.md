# Figma / Doop → Create Task: design slicing brainstorm

**Date:** 2026-11-10
**Status:** Revision 3 — **IMPLEMENTED** (2026-11-10). P0/P1/P2 are in the
tree; P3 (hard-removing the pen.dev generator) was deliberately kept as a
backward-compatible legacy path so cards created before the migration still
run. P4 (Figma import bridge) remains a hosted-beta one-time step.

Implementation map: `internal/kanban/design_provider.go` (provenance + ref),
`doop_client.go` (stateless MCP client), `design_bundle.go` +
`design_resolver.go` (immutable snapshot store),
`cmd/server/design_slice_routes.go` (create-time HTTP boundary),
`cmd/server/remote_dispatch.go` (`appendDoopDesignReference`), two new
`tasks` columns (`design_provider`, `design_ref`), and
`web/src/features/board/DoopDesignPicker.tsx` (Create Task frame picker).
See [design/README.md](../design/README.md) for configuration and the loop.

**One deliberate deviation from this proposal:** the bundle lives in the
control-plane slice store and its `frame.html` is inlined into the dispatch
prompt, rather than being materialised as files in the worker's checkout.
That keeps workers free of Doop URLs, tokens and network access without
requiring a node-agent change. Materialising the bundle into the workspace
so `verify:ui` can diff it directly is a follow-up.
**Supersedes:** rev 1 of this document (the doop assessment in rev 1 was wrong —
see "Correction" in §2).
**Question:** when creating a Kanban card, how do we attach a design so the
agent can "slice" (implement) it — and what is the cheapest, fastest, most
reasonable way to get there? Specifically: drop pen.dev, use self-hosted doop.

---

## Decision

> **Choose: self-hosted Doop as the design source of truth, with a snapshot
> boundary at Create Task. Drop `pen_cli` and `pencil_mcp`. Keep
> `design_source`, `design/manifest.json`, `verify:ui` and the local Canvas
> Studio.**

Doop wins on the constraint that actually matters: **self-hosted Doop has no
plan quota at all** (billing is off unless `STRIPE_SECRET_KEY` is set), its MCP
is local, and frames are real HTML — a far better handoff artifact than a
Figma node tree or a `.pen` mock. There is no Figma rate limit, no pen.dev
agent-day budget, and no per-tool-call cap.

Four rules make this safe:

1. **Resolve at create time, dispatch from files.** A card never calls Doop.
   The control plane snapshots the chosen frame into committed files once.
   Workers never see a Doop URL, an agent key, or a network call.
2. **Doop is the design tool, not the delivery pipeline.** Disable Doop's
   "connect a GitHub repo and open a PR" path. Switchyard's review gate owns
   commits; a Doop PR would route around it.
3. **Drop the pen.dev *generator*, not the local design format.** See §1 —
   these are three different things and only two of them have quotas.
4. **Pin a Doop commit.** It is beta; MCP tool names will move. Version the
   snapshot so a card stays bound to the design it was created against.

### The one hard catch

**Figma / Canva / PSD import and export are Doop Cloud only — explicitly "not
part of the open source".** A self-hosted instance cannot pull in a Figma file.
So "upload Figma → pick a layer → slice" does **not** work on the self-hosted
build. Do not discover this after migrating.

Recommended resolution, in order:

- **Design in Doop directly** (agent-authored frames, unlimited) — this is the
  main lane, and arguably the point of an AI design canvas.
- **Import from a live URL** with the open-source `import_webpage` tool or
  `doop-sync.js` (`POST /ingest/<key>`), which works self-hosted.
- **When a Figma file genuinely has to come in:** use the hosted free beta once
  for the Figma import, read the resulting frame HTML with `get_frame`, then
  write it into the self-hosted instance with `create_frame` / `set_frame_html`.
  Cloud is then a one-time import bridge, not a daily dependency. Confirm the
  beta free tier still includes Figma import before relying on it.
- Keep the **P0 manual fallback** (Figma link + exported PNG attached to a
  card) for Figma-first cards. It costs nothing and needs no API.

### What this does not mean

Do **not** delete Canvas Studio (`web/src/features/canvas/`), `.pen` JSON, or
`compilePenDocumentToReact`. Those are local, 0-token, and have no pen.dev
account dependency. They remain a valid authoring surface; they just stop being
the only one.

### Staging (rev 2.1, same day)

**Phase 1 uses hosted `doop.design`, not a self-hosted instance.** Reason: only
Doop Cloud has Figma import. Self-host moves in later, once designs are
authored natively in Doop and the Figma bridge is no longer needed. MCP is the
read path in both cases, so the Switchyard side of the contract does not change
— only `DOOP_MCP_URL` does (`https://doop.design/mcp` → tailnet `:4400/mcp`).

**Input decision: Figma link or screenshot?** Neither alone is enough.

| Input | Role |
|---|---|
| Figma link with `node-id` | **Provenance / selection identity** — which frame, recorded in `frame.json`. Never handed to the agent as something to fetch. |
| Screenshot PNG | **Grading reference** for `verify:ui` and human preview. Not a spec: no markup, spacing, tokens or copy. Useless alone if the executor is not vision-capable. |
| **Doop frame HTML (`get_frame`)** | **The actual payload** — authoritative markup, styles, copy, selectors, version. This is what the agent implements. |

So: Figma link → Doop Cloud import → `ready_for_dev` frame → snapshot
`frame.html` + `frame.png` + `frame.json` → card. **The link names the design,
the PNG grades it, the HTML implements it.**

---

## 1. Why pen.dev goes — and what "pen.dev" actually is here

The repo bundles three different things under one name. Only two are limited:

| Thing | Code | Needs pen.dev account? | Limit |
|---|---|---|---|
| `pen_cli` — headless generator | `design_tool.go`, `buildDirectPenCommand`, `appendDesignMandate` | **Yes** (`pen login` / `PEN_CLI_KEY`) | **Free tier: 5 agent-days + 25 image generations/month** (`design/README.md`) |
| `pencil_mcp` — desktop app MCP | `DesignToolLadder` | **Yes** (macOS-only desktop app, must be open) | GUI-bound, cannot save new files headlessly |
| Canvas Studio / `.pen` / `penCompiler.ts` | `web/src/features/canvas/*` | **No** | none — pure local JSON + TS, 0 tokens |

So the quota complaint is real and correctly aimed at `pen_cli`/`pencil_mcp`,
not at the design artifact format. Migration = remove those two ladder rungs
and their prompt machinery; keep everything else.

Concretely, drop:
- `pen_cli`, `pencil_mcp` from `DesignToolLadder` (or deprecate behind a flag),
- `appendDesignMandate`'s `pen --out … --export …` instructions,
- `buildDirectPenCommand` / `directPenDesignContract`,
- `pen_agent` / `pen_model` fields and their Create Task controls,
- the auto-loaded pen skill pack for Doop cards (`DesignAutoSkills` currently
  gates on `designTool` — keep gating, add Doop's `get_guidelines` instead).

Keep: `design_source`, `appendDesignReference` (extended), the two-way
vocabulary warning, `design_scope`, `design/manifest.json`, `verify:ui`.

---

## 2. What self-hosted Doop actually gives us

Verified against the raw `README.md` and the site on 2026-11-10.

**Correction to rev 1:** rev 1 claimed "no documented API/MCP tool for frame
HTML and no frame/layer-by-ID selector". That was wrong — it came from a
truncated GitHub HTML page. The raw README documents both. Doop is a much
better fit than rev 1 concluded.

### MCP tools that matter for slicing

| Tool | Why it matters |
|---|---|
| `get_frame` | **Reads a frame including its full HTML** — the primary handoff payload |
| `get_frame_screenshot` | Headless PNG render; also `GET /api/frames/:id/screenshot.png?scale=…` |
| `export_frame` | PNG/JPG live URLs or vector PDF |
| `get_canvas` | Frame layout; supports `approval_status: "ready_for_dev"` — maps straight to a card's design gate |
| `get_comments` | Entries carry a **CSS selector + HTML snippet** — this is the "pick which layer to implement" primitive |
| `list_frame_versions` / `restore_frame_version` | Pin a card to a design version; kills drift |
| `get_guidelines` / `save_decision` | Design memory — replaces the pen.dev skill pack |
| `create_frame` / `set_frame_html` / `append_frame_html` | Programmatic authoring and the Figma-import bridge |
| `set_status` / `get_feedback` | Human-in-the-loop sign-off before a card is created |

`approvalStatus` is `draft | ready_for_dev | needs_review` and is readable from
`get_canvas` and `get_frame`. That is a natural Create Task filter: only frames
a human marked ready for dev become cards.

### Self-hosting facts

- `docker compose up -d` with `BETTER_AUTH_SECRET` (app + Postgres) or
  `bun run dev` with zero config (embedded PGlite in `data/pg`). Production
  should set `DATABASE_URL` to real Postgres.
- Web `:4300`, API + WebSocket + MCP server `:4400`; `/mcp` is proxied.
  Health check `GET /healthz`.
- MCP endpoint is streamable HTTP, **POST only**, OAuth by default. Headless
  clients use an **agent key** (`dpk_…`) as
  `Authorization: Bearer dpk_…` — exactly what a Go control plane needs, no
  browser flow.
- **"Self-hosting: billing is off unless you turn it on."** Without
  `STRIPE_SECRET_KEY` every workspace is active and nothing is locked. This is
  the "unlimited MCP" claim, and it is correct for self-host.
- Licence is **AGPL-3.0** (the marketing site says MIT — the repo's LICENSE and
  README say AGPL v3). Internal self-host is fine; offering a modified version
  as a service requires publishing changes; derived services must rebrand
  (name/logo are trademarks).
- No published RAM figure, but the production image ships **Chromium for frame
  screenshots** plus Postgres plus a Node server. **Do not put this on the
  2 GB VPS** that already OOMs on frontend builds. Run it on the Mac and reach
  it over the existing Tailscale network — the same pattern node-agent already
  uses. The VPS control plane only needs an outbound HTTP call to a tailnet IP.

### Cloud-only (decisive)

> "Figma, Canva and Photoshop (PSD) import and export are currently available
> in Doop Cloud and not part of the open source."

Hosted is "free while in beta" — a pricing and privacy dependency. Self-hosted
integrations page shows Linear, Slack, Meta Ads; no Figma. Layer preservation
for Figma import is not documented either way ("import frames as editable
HTML" is the only claim).

---

## 3. Architecture — Doop provider, same snapshot boundary

The rev 1 principle survives unchanged; only the resolver changes. **Resolve at
create time on the control plane, materialise before dispatch, implement from
committed files.**

### Data model — minimal change

Keep `design_source` as the pointer. Add `doop` to the provider enum and reuse
`design_ref` for the frame identity:

```go
// DesignProvider: "", "pen", "doop", "figma_link", "figma_plugin", "figma_mcp"
DesignProvider string `json:"design_provider,omitempty"`
// DesignRef for doop: "doop://<canvas-id>/<frame-id>@<version>"
// Never a token, never a command. Capped + control-char checked.
DesignRef string `json:"design_ref,omitempty"`
```

Do **not** overload `design_tool` — its `TaskDesignWarnings` vocabulary guard
would fire on design prose. `design_scope` (`design_only` / `design_and_code`)
is reused as-is. Frame selectors from `get_comments` go in the bundle, not in a
new column.

### Bundle layout

```
design/doop/<task-slug>/
  frame.html       # get_frame output — real markup + inline CSS
  frame.png        # get_frame_screenshot, scale 1 (verify:ui compares this)
  frame.json       # canvas_id, frame_id, version, approvalStatus,
                   #   selectors[], sha256, fetched_at, source URL
  guidelines.md    # optional get_guidelines export
```

`frame.html` is the authoritative contract — far more precise than a screenshot
and directly implementable. `frame.png` is for humans and the pixel-drift gate.
`version` makes the snapshot immutable even if someone edits the Doop frame
later.

### New control-plane call

```
POST /api/boards/{slug}/design-slices
  { "provider": "doop", "canvas_id": "…", "frame_id": "…",
    "selectors": ["#hero", ".pricing-card"], "version": "…" }

  <- { "bundle": "design/doop/<slug>", "version": "…", "cached": bool }
```

- Control plane calls Doop MCP `get_frame` + `get_frame_screenshot` with the
  agent key, writes the bundle, registers the surface in
  `design/manifest.json` (route, export, viewport from frame bounds, theme).
- Cache on `(frame_id, version)`. A rerun or review continuation never
  re-fetches. Reject frames whose `approvalStatus != "ready_for_dev"` unless
  explicitly overridden.
- `selectors` narrow the implementation scope to specific layers, sourced from
  element comments in `get_comments`.

### Dispatcher change — one function

Extend `appendDesignReference(msg, designSource)` to detect a Doop bundle:

```
--- Design Reference (Doop frame) ---
Implement exactly the frame at design/doop/<slug>/:
  frame.html  = authoritative markup, styles, copy and layout
  frame.png   = visual reference at scale 1
  frame.json  = version, approval status and the selectors in scope
Do NOT call Doop, do NOT fetch anything from the network, do NOT regenerate
or restyle the design. Reuse existing design-system components where the
markup matches one in the codebase. Only the selectors listed in frame.json
are in scope.
The design is what verify:ui grades against.
--- End Design Reference ---
```

`appendDesignMandate` becomes a no-op (or is removed) once the pen rungs go.

### Security

- `DOOP_AGENT_KEY` (`dpk_…`) and `DOOP_MCP_URL` live **only** on the control
  plane, `0600`. Never in the dispatch payload, job command, prompt or logs —
  the same rule `buildDirectPenCommand` already applies to `PEN_AGENT_API_KEY`.
- Scope the Doop instance to the tailnet; do not expose `/mcp` publicly.
- Disable Doop's GitHub connection. Review gate owns every commit.

### Create Task UX

One compact **Design** row replacing the `pen.dev` chip:

```
[ Doop chip ]  [ canvas / frame picker ……… ]  [ Snapshot & attach ]
               ready_for_dev · v7 · 1440×900 · 2 selectors in scope
               [ thumbnail | frame.html 18 KB | ✓ cached ]
```

- List frames with `approval_status: "ready_for_dev"`; show the thumbnail.
- Element comments → selectors checklist, so "which layer to implement" is a
  click, not prose.
- Show the snapshot summary before Create, so a wrong frame is caught by a
  human, not by an agent at 3am.
- `buildCreatePayload` sends `design_provider` / `design_ref` only when set,
  exactly like `design_source` today. `TaskDetail` shows provider, frame,
  version, approval status and selector count.

### Verification closes the loop (already free)

`verify:ui` already renders the surface and compares to the export with a 10%
pixel budget. Once the frame is registered in `design/manifest.json`, every
Doop card gets a numeric drift alarm in review. Figma MCP, a screenshot paste
and Doop's own PR flow give us none of that.

---

## 4. Options compared (revised)

| # | Option | Quota | Cost | Layer slice | Self-host | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Self-hosted Doop + snapshot boundary** | **none** | $0 + RAM on Mac | ✅ selectors + frame | ✅ | **CHOSEN** |
| 2 | Hosted doop.design beta | beta terms | $0 for now | ✅ | ❌ | import bridge only |
| 3 | Figma link + REST resolver | ~6/mo Starter, 15/min Pro Dev | $0 PoC / **$12/mo** | ✅ node ids | n/a | fallback |
| 4 | In-development Figma plugin | none | $0 | ✅✅ | n/a | only if Figma stays primary |
| 5 | Official Figma remote MCP | 20/mo Starter, 200/day Pro Dev | $12/mo | ✅ | ❌ | no longer needed |
| 6 | `pen_cli` / `pencil_mcp` | **5 agent-days + 25 images/mo** | pen.dev account | n/a | ❌ | **drop** |
| 7 | Framelink `figma-developer-mcp` | same REST quota | $0 | ✅ | ✅ | no longer needed |
| 8 | Local Canvas Studio (`.pen`) | none | $0 / 0 token | ✅ | ✅ | keep as alternate authoring |

Dropping pen.dev also removes the `PEN_CLI_KEY` per-machine login step, the
macOS-only desktop MCP requirement, and the "VPS has no GUI" workaround from
`design/README.md`. That is a real operational win, not just a quota one.

---

## 5. Background: Figma facts, verified 2026-11-10

Kept for the fallback lanes; no longer on the critical path.

- Remote MCP `https://mcp.figma.com/mcp`, all plans, no desktop app.
  Starter / View / Collab = **20 tool calls/month**; Professional Full/Dev =
  200/day + 10/min; Organization 200/day + 15/min; Enterprise 600/day + 20/min.
  Professional Dev ~$12/mo, Full ~$16/mo (annual-billed equivalent).
- REST `GET /v1/files/:key/nodes` and `GET /v1/images` are **Tier 1**:
  Starter Dev/Full 10/min, Professional 15/min — but Figma's docs warn a file
  in a **Starter** plan is capped at **~6 requests/month** even with a paid
  seat elsewhere. `429` carries `Retry-After` + `X-Figma-Plan-Tier`.
- Plugin development is free; in-development plugins run on Starter from a
  local manifest with no REST quota. Private org-wide publishing needs
  Organization/Enterprise.

Sources: [Figma MCP guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server),
[MCP rate limits](https://help.figma.com/hc/en-us/articles/39252411778583),
[pricing](https://www.figma.com/pricing/),
[REST rate limits](https://developers.figma.com/docs/rest-api/rate-limits/),
[doop README](https://github.com/kgoedecke/doop),
[doop.design](https://doop.design/).

---

## 6. Phased plan

| Phase | Work | Cost | Exit criteria |
|---|---|---|---|
| **P0** | **Hosted `doop.design` first**: Figma import → frame `ready_for_dev` → manual/`get_frame` snapshot attached to a card; extend `appendDesignReference`. No self-host yet. | $0 beta | A real Doop frame dispatches and `verify:ui` can compare. |
| **P0.5** | Self-host Doop on the Mac over Tailscale (`docker compose up -d`, agent key, `GET /healthz`); point `DOOP_MCP_URL` at it. Only when Figma import is no longer needed. | $0 | Same card contract works unchanged against the local MCP. |
| **P1** | `POST /design-slices` Doop provider: `get_frame` + screenshot, bundle, version cache, manifest registration, agent key on control plane only. Ready-for-dev filter. | $0 | Paste/select frame → preview → Create → dispatch with zero manual files; 10 reruns with zero re-fetch. |
| **P2** | Selector scoping from `get_comments`, Create Task frame picker + element checklist, `TaskDetail` version/approval display. | $0 | "Implement only these two layers" works without prose. |
| **P3** | Remove `pen_cli` / `pencil_mcp`, `appendDesignMandate`, `buildDirectPenCommand`, `pen_agent`/`pen_model` UI and tests. Update `design/README.md`. | $0 | `go test ./...` and `pnpm --dir web verify:fast` green; no pen.dev credential anywhere. |
| **P4** | Figma-import bridge (hosted beta → `get_frame` → `set_frame_html`) only if Figma files remain a real input. | $0 beta | A Figma frame lands in self-hosted Doop and becomes a card. |

**Do not build:** a general Figma→code exporter, a `.pen`-to-HTML converter,
a Doop fork, or a second design format. `design_source` + `manifest.json` +
`verify:ui` are the contract; Doop only supplies the artifact.

---

## 7. Open questions

1. Where does Doop run? Recommendation: Mac over Tailscale, not the 2 GB VPS.
   Confirm the Mac has Docker and enough RAM for Postgres + Chromium.
2. Is Figma still a primary input, or are designs authored in Doop? This
   decides whether P4 is needed at all — and it is the only reason to keep any
   cloud dependency.
3. Should `pen_cli` be hard-removed or kept behind a deprecated flag for one
   release? Recommendation: hard-remove in P3 for existing cards, but migrate
   in-flight `pen_cli` cards first.
4. Confirm the hosted beta's free tier still includes Figma import before
   documenting P4 as a supported path.
5. Which executors need Doop cards first? `dsh` / `deepseek-flash` is default
   and may not be vision-capable — `frame.html` must carry the load, not the
   PNG. Confirm before relying on screenshots.
