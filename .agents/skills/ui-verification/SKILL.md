---
name: ui-verification
description: Use when changing anything under web/src — components, features, tokens, or CSS. Covers which verify gate applies, where design rules actually live, and why baselines are never bumped silently.
---

# UI work — Switchyard

## The gate runs for you. Don't run it by hand, don't skip it.

Every card carries a `verify_profile`, routed from the diff rather than from memory:

| Profile | Runs | Triggered by |
|---|---|---|
| `none` | nothing | a change with no `web/` diff — Go, cron, dispatch, docs |
| `fast` | `tsc -b`, `vitest`, `token-lint` | any change that compiles |
| `ui` | `fast` + Playwright screenshots (light + dark) + axe | any change under `web/src/**` |
| `e2e` | `ui` + the `e2e` flow suite | a change to a path in `web/e2e-flows.txt` |

Rungs are cumulative. A `none` card means the change touched no UI — trust it and
move on; you do not need to open a browser. If you believe a card is routed
wrong, say so in a comment rather than working around it.

To reproduce a failure locally: `pnpm --dir web verify:ui`.

## Design rules live in one place

`design.md` Revision 4 is authoritative. **`redesign.md` is superseded** — it
disagrees with Rev 4 on the default theme, the blur radius and the corner radius,
and reading it is how you build the wrong thing. `index.css` implements Rev 4.

- Colour, radius and shadow come from tokens in `web/src/index.css`. Never a raw
  hex, `rgb()` or `hsl()` outside the token files.
- Radius comes from the scale: `rounded-control` 8, `rounded-card` 12,
  `rounded-panel` 16, `rounded-full`. The base `rounded`/`-md`/`-lg` ladder is
  also legal (design.md 5) — what is not legal is inventing a value.
- `backdrop-filter` is not decoration. Each one is its own compositing layer the
  browser cannot batch, and a blur only means something when there is a *varying*
  backdrop behind it. A panel with solid surface behind it has nothing to
  diffuse — use the `glass-flat` family instead. `composer.tsx` and
  `app-header.tsx` both document this at their call sites.
- Contrast was measured with **sRGB linearisation**. A luminance function that
  skips it collapses every ratio toward 1.

## Inspect before you guess

Before changing a component, look at the live page rather than guessing prop
names: `e2e mcp` → `open_session` → `observe` → `locate`. This repo has no
Storybook; `observe` is the equivalent.

## Baselines

If a visual diff is intended, update the baseline **in the same commit** and say
why in the review comment. A silent baseline bump is a rejected change — it
destroys the only signal the gate exists to give.

If a diff is *not* intended and the baseline is telling you about a real
regression, fix the code. Do not reach for the baseline first.

Anything that changes per run — clocks, run ids, live counters, heartbeats —
carries `data-volatile` so the mask covers it. If a new per-run value appears in
a captured surface, mark it rather than loosening `maxDiffPixelRatio`.

### A mask needs a stable box

`data-volatile` masks an element's **bounding box**, so an element whose width
changes with its content moves the mask. The board's task counter was the
run-to-run noise floor for exactly this reason: "9 tasks" and "224 tasks" produce
different boxes, so ~800 pixels differed on every run. Give a masked element a
fixed width (`minWidth: "6.5ch"`) and the mask lands on the same pixels each time.

Overview's whole data region is masked as one block — every figure on that page
is a live aggregate. The shell, type scale, glass, spacing and colour around it
are still compared, which is what the capture is for.

### Pixel diffs cannot catch subtle token changes

Measured on this repo: changing `--radius-card` from 12px to 17px alters the two
visible board cards by **160 pixels out of 1.6M — 0.01%**. The run-to-run noise
floor is ~0.018%. The signal is *below* the noise, so no pixel threshold separates
them: at 0.1% the regression passes, and anything tight enough to catch it fails
on ordinary runs.

That is why the `tokens` describe block asserts the compiled radius scale
directly, and why `token-lint` covers the source. The screenshot catches layout,
missing elements, and colour or spacing changes of a size you would notice. Use
all three; do not expect the screenshot alone to hold the line.

## Serving for a capture

The gate runs against the **Go server on :8790**, not `vite preview` and not a
static serve of `dist/`. Served statically, `/api/*` is answered with
`index.html`, the shell never mounts, and the screenshot is a blank page — which
reads exactly like a passing test.

The server serves `web/dist`, so **`pnpm build` before capturing** or the gate
photographs the previous bundle.

Dark mode is the `.dark` class on `<html>`, not `prefers-color-scheme`.

## Running the gate

```sh
cd web && pnpm build          # the server serves web/dist, so rebuild first
cd web && SWITCHYARD_SESSION=<cookie> pnpm exec playwright test
cd web && pnpm verify:fast    # tsc -b + vitest + token-lint, no browser needed
```

**Auth.** The seeded password `123456` only applies to a *fresh* `auth.db` —
`internal/kanban/auth.go` inserts it on first run only, and `ChangePassword` is
supported, so on a machine that has changed it the seed is rejected. Sessions are
stored **hashed**, so an existing token cannot be recovered from the DB. Export a
live cookie from a signed-in browser as `SWITCHYARD_SESSION`, or set
`SWITCHYARD_PASSWORD` if it was never changed.

**The fixture board.** `web/e2e/visual.spec.ts` seeds a `visual-fixture` board so
the Board capture has real cards in it. Against a live board every column renders
empty, so there is no card to catch a change — a green suite that photographs
nothing.

The suite **recreates** the board itself, once per run, via `hermes kanban boards
rm --delete` + `create`. Do not set it up by hand and do not add another seeding
path: the server's `POST /api/boards` writes `board.json` and an *empty* database
file, and only the CLI creates the `tasks` schema.

Why recreate rather than clear:

- `DELETE /tasks/{id}` **archives** (`ArchiveTask`), it does not delete. Clearing
  per run left 1,165 archived rows after ~40 runs.
- Archiving is O(rows), so the fixture got slower every run — Board alone went from
  milliseconds to ~90s and pushed the suite past its own timeout. After the fix a
  full run is ~2.6 minutes, down from 17.4.
- `hermes kanban boards rm` without `--delete` moves the board to
  `boards/_archived/`, which still leaves the rows on disk. `--delete` is required.

**Reset and seed must both run exactly once per suite** (`beforeAll`). Seeding per
test is a real bug I hit: the second Board test found the first one's five cards
already present and added five more, so every card rendered twice.

`running` is dispatcher-owned — it can be neither created nor PATCHed through the
API — so that column is left to render its empty state, which is worth capturing.

**Auth applies to fixtures too.** Every `/api/*` route is behind `authHandler`, and
the `beforeAll` request context gets no cookie from `page.context().addCookies`. The
session is sent via `extraHTTPHeaders` in `playwright.config.ts` instead. Without
it the seed POSTs 401 and the board silently renders empty — which looks like a
passing capture of nothing.

Keep the session token in `.scratch/`, not `/tmp`: something on this host sweeps
`/tmp`, and a vanishing token makes the suite fall back to the seed password and
fail with a 401 that looks like a code problem.

**Environment overrides:** `SWITCHYARD_URL` (default `http://127.0.0.1:8790`),
`SWITCHYARD_SESSION`, `SWITCHYARD_PASSWORD`, `SWITCHYARD_BOARD` (use a board other
than the fixture), `SWITCHYARD_CHAT_SESSION` (pin a transcript).

**Pin the platform.** Visual tests run on the Mac node only. Fonts and
anti-aliasing differ per OS, and `deviceScaleFactor` and the platform name are
part of the baseline path — a baseline captured at 2× will not match a 1× capture
on another machine.

## If a rule looks wrong

Say so in the review comment. `design.md` records decisions and the measurements
behind them, so a disagreement is usually a real finding — not something to
route around quietly.