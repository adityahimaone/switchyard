# Design loop

Committed designs are the source of truth for cards that carry a
`design_source`. The loop:

1. **Mock** — an agent (or you) produces a `.pen` file with the
   pen.dev CLI and exports a PNG beside it.
2. **Commit** — both files land in this directory, and the surface
   is registered in `manifest.json`.
3. **Implement** — a card with `design_source` pointing at the
   `.pen` file is dispatched with the design in its prompt; the
   coding agent reads the committed file and builds to it.
4. **Compare** — `verify:ui` runs `e2e/design-compare.spec.ts`,
   which renders the surface and asserts it is *close* to the
   export (10% pixel budget — a drift alarm, not a pixel lock).

A card with no `design_source` never invokes pen and never runs a
compare. The `manifest.json` above starts empty for exactly that
reason: with no surfaces, the compare suite skips cleanly.

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

## Producing a mock

```bash
pen --out design/board.pen \
    --prompt "Switchyard board, three columns, calm glass style" \
    --export design/exports/board.png --export-scale 1
```

Iterate on an existing mock with `--in design/board.pen`. The
`.pen` file is plain JSON (version 2.20), so it diffs cleanly —
edit it by hand when a change is a tweak, and let pen do the
generative work.

## One-time setup (needs your credentials)

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

Free tier: 5 agent-days and 25 image generations per month —
enough for the loop, not for bulk production.

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
