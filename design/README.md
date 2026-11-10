# Design loop

Committed designs are the source of truth for cards that carry a
`design_source`. The current loop uses **Doop**; the legacy pen.dev
CLI loop is documented below for cards created before the migration.

1. **Approve** — in Doop, mark a frame `ready_for_dev`. Only approved
   frames appear in the Create Task picker.
2. **Snapshot** — Create Task calls `POST /api/boards/{slug}/design-slices`.
   The control plane reads the frame over MCP (`get_frame`,
   `get_frame_screenshot`) and freezes it into an immutable bundle:
   `frame.html`, `frame.png`, `frame.json`. This happens **once, at
   create time**.
3. **Attach** — the card stores `design_provider=doop`,
   `design_ref=doop://<canvas>/<frame>@<version>` and a repo-relative
   `design_source`. It never stores a live Doop URL.
4. **Implement** — the dispatcher inlines the frozen `frame.html` into
   the prompt. Workers see a self-contained design contract: no Doop,
   no agent key, no network access.
5. **Compare** — `verify:ui` renders the surface and asserts it is
   *close* to the export (10% pixel budget — a drift alarm, not a
   pixel lock).

The snapshot store lives at
`~/.hermes/kanban/design-slices/<slug>/<key>/` on the control plane.
`frame.html` is served with a sandbox CSP because it is authored
markup. `manifest.json` starts empty: with no surfaces the compare
suite skips cleanly.

### Configuration (control plane only)

| Variable | Default | Purpose |
|---|---|---|
| `DOOP_AGENT_KEY` | — | Required. Headless MCP bearer key (`dpk_…`). Never send it to a worker. |
| `DOOP_MCP_URL` | `https://doop.design/mcp` | Hosted doop.design first; switch to a self-hosted tailnet `:4400/mcp` later. |
| `DOOP_REST_URL` | derived from `DOOP_MCP_URL` | Optional override for the screenshot renderer. |

Any unset variable falls back to **`~/.hermes/doop.env`** (mode `0600`,
`KEY=VALUE` lines, `#` comments allowed). Prefer that file over
`pm2 restart --update-env` on a live service: `--update-env` replaces the
process environment with the calling shell's, which drops the `HERMES_*`
variables the process was started with. The file is read per request, so a
key added after startup takes effect without a restart.

```sh
install -m 600 /dev/null ~/.hermes/doop.env
printf 'DOOP_AGENT_KEY=dpk_...\n' > ~/.hermes/doop.env
```

Staging is only a URL change — the card contract is identical hosted
or self-hosted. **Figma / Canva / PSD import is Doop Cloud only**; a
self-hosted instance cannot import a Figma file, so phase 1 uses the
hosted beta for that one-time import. Disable Doop's GitHub PR
feature: the review gate owns every commit.

## Manifest

```json
{
  "surfaces": [
    {
      "name": "board",
      "route": "/board/f8-saas",
      "export": "exports/board.png",
      "viewport": { "width": 1600, "height": 1000 },
      "theme": "light"
    }
  ]
}
```

- `name` is also the export's file name.
- `viewport` must match the canvas the mock was designed at, and
  the export must be **scale 1** (`--export-scale 1`) — a scale-2
  export is twice the screenshot's size and the compare fails on
  dimensions, not pixels.
- `theme` is the theme the mock depicts; the app is toggled to it
  before the capture.

## Legacy: producing a .pen mock (deprecated)

```bash
pen --out design/board.pen \
    --prompt "Switchyard board, three columns, calm glass style" \
    --export design/exports/board.png --export-scale 1
```

Iterate on an existing mock with `--in design/board.pen`. The
`.pen` file is plain JSON (version 2.20), so it diffs cleanly —
edit it by hand when a change is a tweak, and let pen do the
generative work.

## Legacy: pen.dev CLI setup (deprecated)

New cards attach a Doop frame. The pen.dev generator remains only so
cards created before the migration can still run. Its free tier is
5 agent-days + 25 image generations per month, and it needs a
per-machine login — which is why it was replaced.

The CLI authenticates per machine, and none of these can run
unattended:

- **Sign in** — `pen login` (browser, email + password, or OTP),
  or create a session key in pen.dev → organization → Developer
  Keys and export it as `PEN_CLI_KEY`. The key wins over a stored
  session and is what unattended dispatch (node-agent) uses, so
  set it on the node that runs workers.
- **Desktop MCP** — the pen.dev desktop MCP binary is macOS-only.
  On the Mac, register it in the client that runs coding agents
  (`claude mcp add pen -- …` per the desktop app's instructions).
  This VPS has no GUI; headless generation above is the path here.

## The loop, end to end

`cmd/server/verify_loop_e2e_test.go` drives the whole loop
through the real dispatcher against a stand-in node-agent: a
mac-side card (commandcode executor, `design_source`, the
`ui` rung) is created over the HTTP API, claimed, dispatched
with the committed design in its prompt, verified by
`pnpm verify:ui`, and its screenshots land as card
attachments readable over the API. It proves the control
plane's half — the API surface, claim, dispatch,
design-reference injection, session continuity, the verify
hook, artifact transport — without a Mac or a pen.dev
login, both of which are per-machine, user-run steps.

The real loop on the Mac needs those steps done first:
`pen login` (or `PEN_CLI_KEY`) on the node that runs
workers, a node-agent with `command-code` on its PATH, and
the Switchyard backend on :8790. Then a card with
`design_source` set travels the loop for real: the
commandcode agent reads the committed `.pen`, implements to
it, and `verify:ui` compares the render against the export.

## e2e

`web/` holds the e2e project (`e2e.config.ts`, `web/tests/*.e2e.ts`,
`web/.mcp.json`). The `e2e` MCP server is registered from `web/`
with `claude mcp add e2e -- npx e2e mcp`; the config's `web`
target starts the dev server itself, but the Switchyard backend on
:8790 must already be running. Deterministic flows use `screen.*`
and never call a model; `agent.*` steps need `AI_GATEWAY_API_KEY`.

### Mobile (iOS simulator, Android emulator)

`@e2e-dev/mobile` is installed, but `e2e.config.ts` deliberately
has no mobile target: the engine drives **native** apps — a device
target needs `app.bundleId` or `app.appPath`, and `app.url` is not
supported on a device target yet (a target without an app is
`INVALID_CONFIG`). Switchyard is a web app, so mobile flows are
blocked until the app ships a native shell or agent-device learns to
open a URL. When that happens, the target is one line per machine:

```ts
import { mobile } from '@e2e-dev/mobile';
// Mac:       { name: 'iphone', engine: mobile({ platform: 'ios' }),     app: { bundleId: '<shell bundle id>' } }
// Windows:   { name: 'pixel',  engine: mobile({ platform: 'android' }), app: { bundleId: '<package name>' } }
```

Run `npx agent-device doctor` once per machine first (Xcode with a
simulator runtime on the Mac; the Android SDK with an emulator on
Windows). A test written against `screen`, `expect` and `app` runs
on a device target unchanged; only a check that names a platform
label needs `platforms: ['ios']` or `platforms: ['android']`.
