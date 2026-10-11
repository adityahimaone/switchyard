# Glass material — transparency and occlusion audit

**Scope:** the frosted-glass material system — the `--glass-*` tokens and the
`glass*` utilities in `web/src/index.css`, plus every call site in `web/src`.
**Trigger:** reported as *"sometimes it's too transparent so it looks like a
collision, or is not clearly visible because of a component in behind."*
**Date:** 2026-10-11
**Method:** composite each fill over its worst-case backdrop (the orb peak over
the canvas), in sRGB, then linearise — the same model `design.md` used for the
palette work. Bar is WCAG AA 4.5:1 for body text.

---

## Verdict

The report was accurate, and it turned out to be **two separate problems**, one
of which was invisible to both of the project's own guards.

1. **A real WCAG failure in light mode.** `--glass-tint` at `0.66` put
   `danger-text` at **4.36:1**, under the 4.5:1 bar. Fixed by returning the token
   to `0.74` (worst case 4.52:1).
2. **Surfaces that cannot occlude.** Three sticky search rows sit over lists that
   scroll *behind* them, and they used `glass-flat-strong` — a tint with **no
   `backdrop-filter`**. Whatever scrolled under stayed sharp, so a quarter of a
   menu item sat visibly inside the strip. That is the "collision". Fixed with a
   new `glass-occlude` utility (tint **plus** blur) applied to all three.

And the reason neither problem was caught:

3. **Both contrast guards were blind, in different ways.** See below. This is the
   most important finding in the report.

---

## Findings

### G1 — [P1] Light `glass-tint` failed WCAG AA, and had for a while

- **Location:** `web/src/index.css` — `--glass-tint` in the light block
- **Measured:** `danger-text` on light `glass` / `glass-card` = **4.36:1**
  (bar 4.5:1). `success-text` was also marginal at 4.55:1.
- **Cause:** the token had drifted down to `0.66` while `design.md` and
  `scripts/contrast-glass.py` both still documented `0.74`. Three copies of one
  number, two of them stale.
- **Fixed:** light `--glass-tint` → `rgb(255 255 255 / 0.74)`. Worst case across
  all seven text tokens is now **4.52:1**. 0.74 is the lowest value that clears
  the bar — verified by sweeping alpha, not chosen.
- **Also raised:** `--glass-tint-strong` `0.82 → 0.86` (4.69 → 4.78:1), because
  overlays are the layer most likely to sit over dense content.

### G2 — [P0, process] Both contrast guards were blind, so G1 could not be caught

This is the finding worth remembering.

**`scripts/contrast-glass.py` had hardcoded, stale values.** It checked
`0.74 / 0.84` light and `0.42 / 0.78` dark. The CSS said `0.66 / 0.82` and
`0.52 / 0.72`. It passed every run while the token it was supposed to guard
failed. **Fixed:** the script now parses the declarations out of `index.css`,
prints what it read, and **exits non-zero** on failure. Verified both ways —
exit 1 at 0.66, exit 0 at 0.74.

**`scripts/token-lint.mjs` Rule 6 never checked light at all.** It resolved the
light theme as `themeBlock(text, ":root")`. But light's *palette* lives in the
first `:root` while light's *glass fills* live in `@theme inline` — different
blocks. So `cssVar(block, "glass-tint")` returned `null`, the panel map came out
empty, the inner loop never executed, and the rule reported success having
measured nothing. **Fixed:** each theme now names its palette block and its glass
block separately, the new `glass-tint-occlude` tier is covered, and a token that
cannot be resolved is an **error** rather than a silent skip. Proven by
regression: with 0.66 restored the gate now reports
`--c-danger-text on light glass-tint … 4.36:1` and the count rises 14 → 15.

**`design.md` carried a third set of values** (`0.74 / 0.84`, `0.42 / 0.78`,
blur `20px / 32px`, and two `glass-edge` colours that matched neither theme).
Updated to the real tokens, with a note that the checker reads them.

### G3 — [P1] The sticky rows could not occlude, by construction

- **Location:** `ChatPage.tsx` (model picker), `ProfilesPage.tsx`,
  `AttachmentAnalysisSettings.tsx` — all three `<div className="glass-flat-strong sticky top-0 z-10 p-1">`
- **Category:** Theming / legibility
- **Impact:** `glass-flat-strong` is a tint with **no blur**, chosen deliberately
  with the reasoning recorded in the source: *"blur once per visual stack, at the
  panel — so the row reads as part of the menu rather than an opaque slab pasted
  over it."* That reasoning missed the one thing the row has to do. The list
  scrolls **under** it; with no filter the list stays sharp, so menu items read
  through the strip. Tint alone cannot fix that without going essentially opaque.
- **Fix:** a new `glass-occlude` utility — the occlude tint **plus**
  `backdrop-filter: blur(18px) saturate(1.6)`. This is the one place a
  sub-surface earns its own filter: it is a single element, not the 400 that made
  `glass-flat` worth having, so the cost is one compositing layer. Both
  degradation paths are wired (`@supports not (backdrop-filter)` and
  `prefers-reduced-transparency: reduce` land on the opaque surface token) —
  `glass-occlude` needs them more than the others, since losing the blur without
  losing the transparency is exactly the bug it exists to fix.

### G4 — [P2] The dark hue was the tightest choice available

- **Location:** `--glass-tint` in `.dark`
- **Impact:** `rgb(46 56 78)` put `ink-3` at **4.52:1** and, counter-intuitively,
  got *worse* as it got more opaque — **4.48:1 by 0.92** — because that hue sits
  too close to `ink-3`'s own luminance to gain anything from more of itself. So
  the dark tint could not be raised for occlusion without spending contrast to
  pay for it.
- **Fixed:** the hue moved to `rgb(40 49 68)` — the one `--glass-tint-strong`
  already used — which clears **4.86:1 at every alpha from 0.72 to 0.92**. Alpha
  raised `0.52 → 0.62`, and the three dark tiers now share one hue, removing a
  difference nobody chose.

### G5 — [P2] `token-lint` printed contrast failures as warnings

- **Location:** `scripts/token-lint.mjs`, the reporting block
- **Impact:** severity for the *heading* came from a second hardcoded rule list
  (`raw-colour | backdrop-filter | lantern`), written before the `contrast` rule
  existed and never updated. A contrast failure was therefore counted as an error
  and exited 1, while being **printed under a `warn` heading** and sorted with
  the warnings. The one finding that means text is unreadable looked like the
  class of finding the file itself calls "informational until phase 5".
- **Fixed:** severity is now derived from the bucket the finding was pushed into.
  The contrast failure now prints as `FAIL  contrast`.

---

## Not a defect — and must not be "fixed"

### The app header is correct as `glass-flat`

`app-header.tsx` uses `glass-flat sticky top-0 z-50`, which looks like exactly
the G3 case. It is not, for two independent reasons recorded in its own comment:

1. **A `backdrop-filter` ancestor becomes the containing block for
   `position: fixed` descendants.** The header is nothing *but* overlay triggers
   — notification bell, theme switch, account menu. Adding a filter would make
   any un-portalled overlay positioned *and clipped to the bar*. Radix portals
   them today, so the safety rests on every future overlay remembering to portal.
   That is not a guarantee worth trading for a blur.
2. **Nothing scrolls behind it.** The shell is `h-svh` with `overflow-hidden` and
   scrolling happens inside per-page containers, so the bar sits on the opaque
   canvas. There is no backdrop to diffuse and nothing that can collide.

So the header keeps `glass-flat`, and the correct fix for its transparency is the
token (`0.74`), which it inherits.

### The other `glass-flat` / `glass-card` call sites are fine

Checked and left alone, because their backdrop is a smooth or opaque ground with
nothing sharp behind:

| Surface | Why it is safe |
|---|---|
| `button.tsx` `glass-flat` (231 on /skills) | Sits on a card that is already glass; nothing sharp behind |
| `input.tsx` `glass-flat` | Same — an input always sits on a panel |
| `segmented.tsx`, `theme-switch.tsx` | The active pill sits over its own track, not over content |
| `glass-card` × ~35 (Knowledge, Overview) | On the opaque canvas; the design comment's "opaque ground" argument holds |
| `TaskCard` `glass-card` | Inside a glass column; cards stack, they do not overlap |
| All L4/L5 overlays | `glass-strong`, 30px blur — the blur is what keeps them legible over dense content |

---

## Verification

| Gate | Before | After |
|---|---|---|
| `contrast-glass.py` | PASS on **stale** values (0.74/0.84, 0.42/0.78) | PASS on the **live** values, exit code enforced |
| `contrast-glass.py` at light 0.66 | — | **exit 1**, names `danger-text at 4.36:1` |
| `token-lint.mjs` | `14 error(s), 0 warning(s)` — light half of Rule 6 dead | `14 error(s), 0 warning(s)` — light half live |
| `token-lint.mjs` at light 0.66 | would have passed | **15 errors**, `--c-danger-text on light glass-tint` |
| `check-undefined-css-vars.py` | 9 | 9 (unchanged; all verified false positives) |
| `tsc -b --force` TS1xxx | 0 | 0 |

Final token values, as read back by the checker:

| Token | Light | Dark |
|---|---|---|
| `glass-tint` | `rgb(255 255 255 / 0.74)` | `rgb(40 49 68 / 0.62)` |
| `glass-tint-strong` | `rgb(255 255 255 / 0.86)` | `rgb(40 49 68 / 0.78)` |
| `glass-tint-occlude` | `rgb(255 255 255 / 0.90)` | `rgb(40 49 68 / 0.86)` |

Tightest token on each tier, worst-case backdrop: `glass` 4.52:1, `glass-strong`
4.78:1, `glass-occlude` 4.86:1.

---

## Residual risks

1. **Verified by measurement and parse, not by eye.** `web/node_modules` is still
   a partial install, so nothing could be rendered. The contrast numbers are
   arithmetic and the wiring is type-checked, but the *look* of `glass-occlude`
   (a near-opaque strip inside a translucent panel) has not been seen. Worth a
   glance once the app runs.
2. **The occlude tier is deliberately heavy** (0.90 light / 0.86 dark). If it
   reads as a slab rather than as part of the panel, lower the tint — the blur is
   doing most of the occlusion, so there is room — but re-run both checks.
3. **The visual baselines will diff again.** Four surfaces changed appearance and
   every glass surface shifted slightly in both themes.
4. **The 14 remaining `token-lint` errors are unrelated** — raw gradient stops in
   the dead `DOT_MATRIX_COLOR_PRESETS` table. Unchanged by this pass.
