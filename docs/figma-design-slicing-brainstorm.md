# Figma → Create Task: design slicing brainstorm

**Date:** 2026-11-10
**Status:** proposal, not implemented
**Question:** when creating a Kanban card, how do we attach a Figma design so the
agent can "slice" (implement) it — and what is the cheapest, fastest, most
reasonable way to get there? Doop? A Figma plugin? The official Figma MCP?

---

## TL;DR

**Do not build a new design pipeline.** This repo already has ~80% of one:

| Already in the repo | File |
|---|---|
| `design_source` — a committed design the card implements verbatim | `internal/kanban/kanban.go:85` |
| `appendDesignReference` — tells the agent to read the design and not regenerate it | `cmd/server/remote_dispatch.go:463` |
| `design/manifest.json` + surface registration | `design/README.md`, `design/manifest.json` |
| `verify:ui` pixel-compare against the design export (10% drift budget) | `design/README.md` |
| A **deterministic 0-token `.pen` → React + Tailwind compiler** | `web/src/features/canvas/penCompiler.ts:317` |
| A node-level design tool switch, validation, warnings, dry-run | `internal/kanban/design_tool.go`, `task_validate.go` |

So the answer is: **normalise a Figma slice into the existing `.pen` + PNG
bundle format, then reuse `design_source`, the dispatcher mandate, the compiler
and `verify:ui`.** The agent never talks to Figma. No worker ever holds a Figma
token. Nothing new is needed in the execution plane.

**Recommended path:**

1. **P0 (free, ~half a day):** paste a Figma link with `node-id` into Create Task +
   a PNG. Control plane stores the bundle, sets `design_source`. Zero external
   API calls.
2. **P1 (free, small Go service):** "Slice" button resolves the Figma link via
   the REST API into `.pen` + PNG + `slice.json`, at **create time, not dispatch
   time**. Cache by `(file_key, node_id, version)`.
3. **P2 (free, best UX):** a small in-development Figma plugin — select the
   exact layers, click "Send to Switchyard". No API quota at all, true
   layer-level slicing, works on the free Starter plan.
4. **P3 (~$12/mo, optional):** official Figma remote MCP for high-fidelity
   cards that need variables / Code Connect. Opt-in per card, not the default.

**Doop is not the implementation path.** It is a good optional *authoring*
lane (see §5); its "export the code" story is a marketing claim with no
documented API behind it, and its "select a layer" is frame-level whole-HTML,
not layer-level slicing.

---

## 1. What "slicing" actually requires

The agent does not need "code export". It needs four things, in this order:

1. **A bounded selection.** A Figma file is huge. A card must name exactly the
   frame/layers it implements. A Figma "Copy link to selection" already carries
   this: `...?node-id=123-456`. Multiple `node-id`s = multiple slices.
2. **A machine-readable spec.** Bounds, auto-layout, fills, typography, text
   content, component/variant names, spacing. This is the real payload — an
   LLM can implement from this accurately. A screenshot alone cannot give
   exact spacing, tokens or type ramps.
3. **A visual reference.** PNG for humans and for `verify:ui` pixel-compare.
   Secondary: several executors (`dsh` / `deepseek-flash`) may not be
   vision-capable, so **never make the PNG the only contract**.
4. **An immutability rule.** The design is the thing the card is graded
   against. The agent must not regenerate, move or restyle it.
   `appendDesignReference` already says exactly this.

Everything else — "export code", "generate a PR", "AI slicing" — is a
convenience layer on top of those four. Buying it is only worth it if it saves
more than it costs in drift.

---

## 2. Verified facts (checked 2026-11-10)

These changed the recommendation, so they are worth pinning down.

### Figma MCP server

- Remote endpoint `https://mcp.figma.com/mcp` — **no Figma desktop app
  needed**, OAuth sign-in. Desktop MCP requires a Dev/Full seat.
- Available on **all plans**, but rate limits are brutal at the bottom:
  Starter / View / Collab = **20 tool calls per month**; Professional Full/Dev
  = 200/day + 10/min; Organization Full/Dev = 200/day + 15/min; Enterprise
  Full/Dev = 600/day + 20/min.
- Tools include design context, screenshots, variables, Code Connect mapping.
- Professional seats: Full **$16/mo**, Dev **$12/mo**, Collab **$3/mo**
  (monthly-equivalent on annual billing; confirm at checkout). Organization
  Dev is $25/mo, Enterprise Dev is $35/mo.

### Figma REST API — the free-tier trap

- `GET /v1/files/:key/nodes` and `GET /v1/images` are both **Tier 1**.
- Tier 1 Dev/Full: Starter 10/min, Professional 15/min, Org/Enterprise 20/min.
- **But the resource's plan dominates the seat.** Figma's own docs: a personal
  access token reading a file that lives in a **Starter** plan is limited to
  **~6 requests per month**, even if the token owner has a paid Full seat
  elsewhere. View/Collab Tier 1 is "up to 20/month" and may be as low as
  2/month under load.
- `429` returns `Retry-After`, `X-Figma-Plan-Tier`, `X-Figma-Rate-Limit-Type`.
  Batch node ids into one `GET /v1/images` call; cache aggressively.

**Consequence:** the "free REST API" lane is a proof-of-concept only. A real
link resolver needs either a **Professional Dev seat ($12/mo)** or the
**Figma plugin lane**, which makes no REST calls at all.

### Figma plugins

- Plugin development is free; an in-development plugin runs from a local
  `manifest.json` on the **Starter** plan. Figma Design plugins are supported
  on Starter and Full seats; Dev Mode plugins need Full/Dev.
- The Plugin API gives full local access to `figma.currentPage.selection` and
  all node properties, `exportAsync` for PNG/SVG — **no REST quota**.
- Private org-wide publishing requires an Organization/Enterprise plan. For a
  solo dev, in-development plugins are enough; Community publishing is an
  option if it ever needs to be shared.

### doop.design

- Site: AI design canvas + MCP (`https://doop.design/mcp`), imports Figma /
  Canva / PSD / HTML as an editable snapshot, exports frame as
  PNG/PDF/HTML/Figma, can open a GitHub PR with real HTML+CSS.
- "Free while in beta", site says MIT; **the GitHub repo says AGPL-3.0**.
  Verify the licence before self-hosting or vendoring anything.
- Self-host: Docker + Postgres/PGlite + Bun build + Node/tsx runtime +
  Puppeteer for screenshots. This is a poor fit for the 2 GB VPS that already
  struggles with frontend builds (see README "Build and deploy").
- **Reality check on the user's assumption:** the repo documents
  `get_canvas`, `get_comments`, `create_frame`, `get_frame_screenshot`, but
  **no documented API endpoint, MCP tool or CLI for exporting a frame's HTML/
  code**, and no documented frame/layer-by-ID selector. Frames are stored and
  returned whole as HTML — "select what to implement" is **frame-level**, not
  layer-level slicing.
- A doop-opened PR would also route around Switchyard's review gate ("agent
  mutates the working tree but does not commit or push"), which is an
  architectural conflict, not just a tooling choice.

Sources: [Figma MCP guide](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Dev-Mode-MCP-Server),
[MCP rate limits](https://help.figma.com/hc/en-us/articles/39252411778583),
[pricing](https://www.figma.com/pricing/),
[REST API rate limits](https://developers.figma.com/docs/rest-api/rate-limits/),
[Framelink Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP),
[doop.design](https://doop.design/), [doop repo](https://github.com/kgoedecke/doop).

---

## 3. Options compared

| # | Option | Cost | Speed to ship | Fidelity | Layer-level slice | Headless workers | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **Figma link + PNG, manual** | $0 | hours | low–med | via `node-id` only | ✅ | **P0 ship now** |
| 2 | **Figma REST API resolver → `.pen` bundle** | $0 PoC / **$12/mo** Dev seat for real use | 2–3 days | high (exact numbers) | ✅ node ids | ✅ (control plane only) | **P1 core** |
| 3 | **In-development Figma plugin** | $0 | 2–3 days | highest (full Plugin API) | ✅✅ true selection | ✅ (posts bundle) | **P2 best UX** |
| 4 | Official Figma remote MCP | $12/mo + 200 calls/day | 1–2 days | highest (+ variables, Code Connect) | ✅ frame-level | ⚠️ OAuth per worker | **P3 opt-in** |
| 5 | Framelink `figma-developer-mcp` (MIT) | $0 + same REST quota | 1 day | high | ✅ | ⚠️ Node stdio process on worker | ❌ port the logic into Go instead |
| 6 | doop.design | free beta / self-host RAM | 3–5 days | medium (HTML frame) | ❌ frame-level | ⚠️ cloud + OAuth | ⚠️ authoring lane only |
| 7 | Screenshot paste / vision | $0 | hours | low | ❌ | ⚠️ needs vision model | ✅ fallback, not primary |
| 8 | **Existing pen.dev / Canvas Studio** | $0 / 0 token | already built | high (structured) | ✅ | ✅ | ✅ keep, becomes the target format |

**Why not option 5:** it does exactly what option 2 does, but as a Node stdio
MCP process that would have to run on every worker. Switchyard already builds
the dispatch prompt in Go on the control plane — putting the extraction there
means one cached fetch per design, no new runtime on workers, and no third-party
process with network access to design files. Port the *simplification logic*
(keep layout/style, drop the rest), not the process.

**Why not MCP on workers generally:** workers are headless, remote, and
ephemeral (Mac/Windows over node-agent). OAuth browser flows, per-node config
and Figma desktop requirements do not fit. Any design provider must resolve on
the **control plane before dispatch**, then travel as plain files.

---

## 4. Recommended architecture — the "design bundle"

### Core rule

> **Resolve at create time, materialise before dispatch, implement from files.**
> The agent sees a committed bundle; it never sees Figma, a token, or a
> network call.

This matches the existing `design_source` contract one-to-one and keeps
dispatch independent of Figma's availability and rate limits.

### Data model — minimal change, no new tables

Keep `design_source` as the pointer. Add two optional columns:

```go
// DesignProvider: "", "pen", "figma_link", "figma_plugin", "figma_mcp", "doop"
DesignProvider string `json:"design_provider,omitempty"`
// DesignRef: canonical source URL (figma.com/design/<key>/...?node-id=<id>)
// Never a token, never a command. Capped + control-char checked like design_source.
DesignRef string `json:"design_ref,omitempty"`
```

`design_tool` stays the pen.dev *generator* switch. Do not overload it with
Figma providers — the existing `TaskDesignWarnings` two-way vocabulary guard
would fire on every Figma card. A separate field keeps validation honest.
`design_scope` (`design_only` / `design_and_code`) is reused as-is.

### Bundle layout (committed in the workspace, or materialised by node-agent)

```
design/figma/<task-slug>/
  slice.pen        # normalised Figma nodes -> existing .pen JSON v2.20
  slice.png        # GET /v1/images render, scale 1
  slice.json       # normalised node tree: bounds, auto-layout, fills, type,
                   #   text, component names, image refs — the LLM contract
  slice.tsx        # compilePenDocumentToReact(slice.pen) — 0-token preview
  meta.json        # file_key, node_ids[], version, fetched_at, source URL, sha256
```

`slice.pen` is the important one: it makes the existing
`compilePenDocumentToReact` produce a real TSX starting point with zero LLM
tokens, and it diffs cleanly in review. `slice.json` is what the agent reads
for exact numbers. `slice.png` feeds `verify:ui`.

### New control-plane endpoint

```
POST /api/boards/{slug}/design-slices
  { "url": "https://figma.com/design/<key>/...?node-id=123-456",
    "node_ids": ["123-456"], "provider": "figma_link" | "figma_plugin" }

  <- { "bundle": "design/figma/<slug>", "surfaces": [...], "cached": bool }
```

- On `figma_link`: `GET /v1/files/<key>/nodes?ids=...` + one batched
  `GET /v1/images?ids=...&format=png&scale=1`; normalise; compile `.pen` →
  `.tsx`; write the bundle.
- On `figma_plugin`: the plugin already did the extraction client-side and
  posts `slice.json` + PNG directly — **zero Figma API calls, zero quota**.
- Cache key `(file_key, sorted(node_ids), file_version)`. Never re-fetch on a
  rerun or a review continuation. On `429`, honour `Retry-After` and fail the
  slice with a readable card warning, never a hung dispatch.
- Register the surface in `design/manifest.json` (route, export, viewport from
  the slice bounds, theme) so `verify:ui` picks it up for free.

**Token handling:** `FIGMA_ACCESS_TOKEN` lives only on the control plane
(`~/.hermes/...` or env, `0600`). It must never appear in the dispatch payload,
the job command, the prompt or logs — the same rule `buildDirectPenCommand`
already applies to `PEN_AGENT_API_KEY`.

### Dispatcher change — one function

Extend `appendDesignReference(msg, designSource)` to detect a bundle directory
and emit a bundle-aware block:

```
--- Design Reference (Figma slice) ---
Implement exactly the slice at design/figma/<slug>/:
  slice.json  = authoritative geometry, tokens, text, component names
  slice.pen   = .pen source; slice.tsx is a deterministic 0-token starting point
  slice.png   = visual reference at scale 1
Do NOT call Figma, do NOT regenerate or restyle the design, do NOT fetch
anything from the network. Reuse existing design-system components where a
component name in slice.json matches one in the codebase.
The design is what verify:ui grades against.
--- End Design Reference ---
```

`appendDesignMandate` stays pen.dev-only. A Figma card must not collect the pen
skill pack (`DesignSkillPackForTask` gates on `designTool`), so no 22 KB of
irrelevant brand/typography skills ride the prompt.

### Create Task UX

One compact **Design** row next to the existing `pen.dev` chip:

```
[ Figma chip ]  [ paste link ………………………………… ]  [ Slice & attach ]
                node-id 123-456 · 1440×900 · optional "add another layer"
                [ thumbnail | 3 layers | provider: link ▾ | ✓ cached ]
```

- Parse `node-id` from the pasted link automatically; paste more links to add
  slices. No separate "which layer" step for the common case.
- Provider dropdown: `Link (API)` / `Plugin` / `Manual upload` / `pen.dev
  (existing)`. Defaults to Manual upload when no token is configured, so the
  feature never hard-fails on a missing credential.
- Show the thumbnail + layer count before Create, so a wrong `node-id` is
  caught by a human, not by an agent at 3am.
- `buildCreatePayload` adds `design_provider` / `design_ref` only when non-empty,
  exactly like `design_source` today. `TaskDetail` shows source, provider,
  node ids and slice count.

### Verification closes the loop (already free)

`verify:ui` already renders the surface and compares to the export with a 10%
pixel budget. Once the slice is registered in `design/manifest.json`, every
Figma card gets a numeric drift alarm in review — something none of Doop,
MCP or a screenshot paste gives us.

---

## 5. Where doop actually fits

Keep it as an **optional authoring lane**, not an implementation dependency:

```
Figma / prompt  ->  doop (agent edits the canvas, human marks frame
                    "ready for dev")
               ->  export PNG + HTML frame
               ->  Switchyard design bundle (same format as §4)
               ->  normal card + review gate
```

Legitimate uses: generating design variants, localising ad sizes, visual
brainstorming with an agent, "mark frame ready for dev" as a human sign-off.
Its MCP is genuinely useful for *designing*, including with the `dsh` executor
we already support.

Guardrails before adopting:
- Confirm the licence (site says MIT, repo says AGPL-3.0).
- "Free while in beta" — do not make a core path depend on it.
- No documented HTML/code export API or layer-by-ID selector; budget for
  scraping/contributing one if we need it.
- Do not self-host on the 2 GB VPS; do not let it open PRs in repos the
  review gate owns.

---

## 6. Phased plan

| Phase | Work | Cost | Exit criteria |
|---|---|---|---|
| **P0** | Create Task accepts a Figma URL + uploaded PNG, stores a bundle, sets `design_source`, extends `appendDesignReference`. No API calls. | $0 | A card created from a Figma link dispatches, agent reads the files, `verify:ui` can compare. |
| **P1** | `POST /design-slices` REST resolver, Figma → `.pen`/`.json`/`.tsx`, cache, `429` handling, `FIGMA_ACCESS_TOKEN` on control plane only. | $0 PoC, **$12/mo** Dev seat for >6 slices/month | Paste link → preview → Create → dispatch with zero manual files. 10 consecutive slices without a re-fetch. |
| **P2** | In-development Figma plugin "Switchyard Slice": select layers → normalise client-side → POST bundle (optionally create the card). | $0 | True layer-level slicing on the free Starter plan; no PAT, no quota. |
| **P3** | `design_provider=figma_mcp` opt-in lane via `https://mcp.figma.com/mcp` for variables / Code Connect on design-system-heavy cards. | $12/mo | Card tagged `figma_mcp` gets variable defs + component mapping; default path unchanged. |

**Do not build:** a general Figma→code exporter, a Figma clone, a second
design file format, or a doop fork. The compiler, the manifest and the review
gate already exist; every new format would fork all three.

---

## 7. Open questions

1. Which Figma plan/seat is the file actually on? This decides P1 vs P2 first —
   if the file lives in a Starter plan, the REST resolver is capped at ~6
   calls/month and the plugin should be P1 instead.
2. Is there a Figma PAT already available on the VPS, or should we stay
   plugin-only (no credential at all)?
3. Are the design files single frames, or whole pages with many states? If many
   states, the bundle needs one `slice.*` set per `node-id` plus a small index.
4. Which executors need to support this first? `dsh` / `deepseek-flash` is the
   default and may not be vision-capable — the JSON/`.pen` contract must carry
   the load. Confirm before relying on PNG.
5. Should a Figma slice be allowed to open its own PR, or must everything go
   through the review gate? Recommendation: review gate, always.
