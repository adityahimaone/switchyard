# Switchyard UI Redesign 2026, Revision 5: "Signal Blue, Softened, Glass + Glow"

Supersedes Revision 4 in one area: **where the light comes from**. The palette,
shape, type, the accent, the board layout and the glass tiers themselves all
carry forward unchanged.

Extends `design-surfaces.md` for per-page layout where it does not conflict.

Scope: `web/` (React 19, Vite, Tailwind v4, shadcn/Radix, `motion`). No API,
routing, query or data-model changes.

## 0. What Revision 5 changes

Revision 4 built the material. Revision 5 supplies something for it to act on,
fixes the one rule that was costing more than it returned, and adds the
"Reduce effects" budget.

| Before (Revision 4) | Now | Why |
|---|---|---|
| glow defined (`glow-ground`) but **mounted nowhere** | `<GlowField />`, a fixed element behind the shell | Glass diffuses its backdrop. Over a flat canvas it is a rectangle, whatever the tint. This was the whole reason it looked flat. |
| `glass-card` blurred, so a board of 100 cards carried 100 `backdrop-filter`s | `glass-card` does **not** blur | A card's backdrop is already a blurred panel. Blurring again diffuses nothing and doubles the layer cost. |
| sidebar opaque, top bar opaque, content opaque | **glass on the top bar and content; sidebar stays opaque** | The rail is the frame's edge and has nothing behind it. The bar and the panels do — the board scrolls under both. |
| orbs would drift forever | drift gated on the motion preference | §8 still says nothing loops forever. |
| no way to trade quality for frame rate | `kb-effects` → "Reduce effects" | Low-end GPUs and battery. |
| five ad-hoc dim values (`bg-black/20`, `bg-black/55`, `bg-black/60`, `bg-canvas/60`) | one `--scrim` | The palette scrim was nearly 3× a dialog's, so one action read as more violent than another. |
| `text-success-text-text` in three places | `text-success-text` | Not a token. Resolved to nothing; the text silently fell back to inherited ink. |

### The rule this revision is really about

**Blur once per visual stack, at the panel.** Not "use glass where it looks
good" — the tier is decided by depth, and `glass-card` losing its
`backdrop-filter` is the same rule as the board having one blurred column rather
than one per card.

### Three decisions taken deliberately against the incoming spec

The spec this implements treats dark as the primary theme, drifting orbs as
always-on, and a per-element spotlight on every card. All three were decided
otherwise, and the reasons are part of the design:

1. **Light stays the default.** `kb-theme` defaults to `system` and `:root` is
   the light block. Every token is authored for both themes, but flipping the
   default would change the first paint for every existing user.
2. **Orbs paint always; they drift only on request.** Under reduced motion the
   glow field is still there — removing the motion must not remove the backdrop
   the entire material depends on. See §8.
3. **Spotlight is delegated.** One `pointermove` listener on the board root
   lights whichever card is under the pointer, rather than one handler per card.

### What did not change

The `--c-*` palette was **not** renamed to the spec's `--sy-*`, and the
`oklch()` values were not adopted wholesale. Eight status hues across two themes
carry measured contrast numbers in §0 of Revision 4; replacing the colour layer
would invalidate every one of them for a vocabulary change. The spec's
*structure* — five ingredients, a layer model, tier-by-depth — is adopted in
full. Its numbers are reconciled against the existing palette instead.

## 0b. Layer model

| Layer | Name | Contents | Material |
|---|---|---|---|
| L0 | Canvas | App background | Solid `--c-canvas` |
| L1 | Glow field | Three orbs + grid + grain | Decorative, `pointer-events:none`, `z-glow` |
| L2 | Panel | **Sidebar rail**, **top bar**, kanban column, chat rail, empty state | `glass` |
| L3 | Raised | Cards, tiles, chat bubbles, inputs, select trigger | `glass-card` / `glass-flat` — **no blur** |
| L4 | Overlay | Dialogs, popovers, dropdowns, palette | `glass-strong` |
| L5 | Toast | Transient | `glass-strong` + tone glow |

`--z-canvas 0 · --z-glow 1 · --z-panel 10 · --z-raised 20 · --z-overlay 50 ·
--z-toast 60`, exposed to Tailwind as `z-canvas` … `z-toast`.

**The whole shell is glass.** That reverses Revision 5's boundary, where the
rail stayed opaque, and it only works because of the shell structure it came
with — see §0c.

The content `<main>` is **transparent, not frosted**: it carries no filter of
its own, so it adds no compositing layer for the whole viewport and does not
become the containing block for the non-portalled `CommandPalette`. It just
stops painting over the glow field, which is what the columns and cards
underneath it need in order to be glass rather than flat translucent fill.

## 0c. The shell: `@efferd/app-shell-4`

The shell structure is the `@efferd/app-shell-4` registry block. What was
adopted, and what was not:

| From the block | Kept | Why |
|---|---|---|
| composition order: provider → sidebar → inset → header → content | yes | |
| `variant="floating"` sidebar | yes | **This is what makes the frosted shell work.** `inset` walls the rail off from the canvas with an opaque gutter; `floating` gives it a margin, so the glow field shows on all sides and the rail reads as a panel floating over light rather than a box cut into the page. |
| header as a sibling of the content, not a border on it | yes | and with it, a *rounded floating* header instead of a full-bleed band |
| `--sidebar-*` stock shadcn hsl tokens | **no** | It injected them into the `.dark` block, where they would have resolved `--sidebar` to a neutral slate and quietly de-Signal-Blued the rail while every other token still looked right. Stripped; `--sidebar-*` keeps resolving to `--c-*`. |
| `logo.tsx` (Efferd's own mark) | **no** | The Switchyard mark stays. Same principle as the palette: the block's structure is the deliverable, its identity is not. |
| demo destinations — "Add product", "Search store", `#link` | **no** | Replaced by the app's real pages via `buildNavGroups` / `buildFooterLinks`. |
| `pxx-4` in the block's header | corrected | Typo for `px-4`. |
| `mb-6` on the header, `gap-4` on content | dropped | Switchyard's pages are full-bleed and own their own gutters. |

**The install itself did not work, exactly as it has before in this repo.**
`npx shadcn@latest add @efferd/app-shell-4` exited **0** and wrote all 23 files
into a literal `web/@/` tree plus a duplicate `web/components/` — the CLI did
not resolve the `@/*` alias, so the real `src/` tree received nothing. Both
directories are unreachable (the Vite alias `@` → `src`) and were deleted after
their contents were read. **Treat exit 0 as "the files landed somewhere", not
as "the block is installed".**

### The overlay rule that this structure must not break

A `backdrop-filter` element becomes the containing block for any
`position: fixed` descendant. The shell now has blur on the rail and the
header, so:

- Every overlay trigger inside them (nav tooltips, account menu, notification
  bell, theme switch, ⌘K) is a Radix primitive that **portals to
  document.body**, so it escapes.
- `CommandPalette` is a `fixed inset-0` overlay that is **not** portalled. It
  renders as a *sibling* of `<AppHeader>`, not a descendant.

**The invariant:** neither `SidebarInset` nor the `SidebarProvider` wrapper may
ever gain a `backdrop-filter`. Putting one there captures the command palette
and clips its scrim to the shell's `overflow-hidden`.

### Controls inside a glass surface

The header is the clearest case: a frosted bar carrying five controls. Two rules
came out of building it.

**A transparent control on glass is a hole, not a control.** The `outline`
variant was `bg-transparent` + a hairline. Over a blurred panel a transparent
fill shows the *backdrop* but none of the bar's own tint, so each button
rendered **darker than the surface it sat on** and the whole cluster read as
cut-outs. `outline` is now `glass-flat`: same tint as the bar, plus the lift,
so the button reads as a small panel standing on it.

**A recessed track with a raised active pill.** The theme switch was
`bg-well` track + `bg-surface` pill — the one control on the bar still using
opaque fills, so it read as a dark slab pasted onto glass. It now matches
`Segmented`: `glass-flat` + an inset shadow for the track (recessed), and
`glass-flat-strong` + an outward lift for the active pill (standing proud). The
direction of the two shadows is what tells you which one is selected.

The header also carries `glass-spotlight`, wired through `useSpotlight` — one
listener on the bar, not on each control inside it.

## 0d. Type on a filled accent surface

The primary button is the one place in the app where the accent is a **fill**
rather than a tint, so its label colour is not a matter of taste — it is the
only text in the system whose contrast flips with the theme, in the opposite
direction from everything else.

| label on the accent fill | light | dark |
|---|---|---|
| **`--c-on-accent`** (used) | **6.40** | **7.98** |
| the other way round | 3.02 | **2.42** — fails |

The reason is the accent itself. Light's accent is `#2f57c4`, a *dark* blue, so
white clears 6.40:1. Dark's accent is `#7aa7f5`, a **light** blue — it has to
be, or accent text on the near-black canvas would fail — and you cannot put
white type on a light blue: 2.42:1.

So the rule is: **type on accent is theme-dependent, and the token carries that
flip.** Never hard-code `#fff` or `#000` on an accent-filled control. Use
`text-on-accent` (type) and `bg-on-accent` (a thumb or mark that sits *on* the
fill, e.g. the checked switch).

`scripts/contrast-glass.py` prints both directions, precisely so that "force it
white everywhere" is caught as a number instead of shipping.

### Two silent bugs this material hides, both found by measuring

1. **`to-accent-lo` did not exist.** `--color-accent-lo` is not in this palette,
   so the Tailwind class generated *nothing* and the primary button rendered
   **flat** — the one variant whose whole job is to look lit. Both stops are now
   `accent` at two opacities.
2. **A bare `/* … */` in a JSX children position is a text node.** A comment
   written while re-theming the chat header rendered as literal prose at the top
   of the transcript. Neither `tsc`, the build, nor the 98 tests caught it — only
   a screenshot did.

Both are the same shape as the `-webkit-backdrop-filter` problem above: valid
code, clean gate, wrong picture. **Render it.**

## 1. What changed in Revision 3, and why

Revision 1 ("Signal & Track") used lantern yellow as the single accent: the
signal button, selection outlines, running lamp and focus ring. Its own §1
critique of the previous system was that *"one accent carries brand, focus,
selection and info at once."* Revision 1 repeated that mistake with a different
hue.

This revision makes **blue the system accent** and gives every status lamp its
own hue, so the accent no longer has to carry state.

| Before (Revision 1) | Now | Why |
|---|---|---|
| Lantern `#ffc83d` accent, `#1b1400` on-accent | Blue `#2563eb`, white on-accent | Blue is the conventional control-plane accent and separates cleanly from all nine status hues |
| 9 lamps sharing one accent plus 8 others | 9 lamps, each a distinct hue, none equal to the accent | Status must never be mistaken for "this is selected" |
| Running lamp = lantern = the accent | Running lamp = indigo, pulses | The accent is now reserved for interaction, so running can be its own colour |
| 56px icon rail | 250px collapsible sidebar | Twelve named destinations deserve labels, not icons alone |
| Barlow / Barlow Semi Condensed | Inter Variable | Matches the reference shell and reads better at 13px UI density |
| Dark-first, dark default | Light-first, both themes | The reference is light; dark is kept because the board is open all day on a dim monitor |

**Not adopted from the reference.** Its system is monochrome warm-grey
(`--primary: #1f2937`, no hue at all). We take its *structure* — sidebar
proportion, collapse behaviour, breadcrumb bar, hairline borders, density,
easing — and substitute a blue chromatic system. Its KPI cards, sparklines and
user-account card are support-desk features; Switchyard has no equivalent, so
they are not copied.

## 2. Reference: what we take, what we leave

Reference: `https://github.com/salungp/kravio-dashboard` (read at
`.scratch/kravio-ref`). The shell, sidebar, button and input are ported from its
actual source, with the palette swapped for blue. No assets, branding or copy are
reused — the icons, logo, nav manifest and page content are Switchyard's.

| Take from the reference | Do not take |
|---|---|
| 250px sidebar, collapses to zero width, state persisted | Monochrome grey palette — replaced with blue |
| Nav rows: 32px, `gap-0.5`, 13px, `rounded-lg`, 0.8px border | Nested sub-items — our 12 destinations are flat (the `children` API exists for when they are not) |
| Active pill: `bg-card`, 0.8px border, `shadow-[0px_4px_7px]` | Account card with avatar and online dot — there is one shared password and no user record, so actions take its place |
| Content on `bg-card` with `shadow-[inset_0_0_0_0.8px_var(--border)]` | KPI tiles, sparklines, greeting headline — support-desk features with no equivalent here |
| Header: 52px, breadcrumb, icon actions right, sidebar toggle | Weekly range picker (the board has no time range) |
| 0.8px hairlines, 4px radius ladder, `shadow-float` / `shadow-lift` set | `font-variation-settings: "opsz"` is kept, since it is what makes Inter read right at 13px |
| `--ease-out-expo`, `active:scale-[0.97]`, 3px focus rings | |

**Corrections to an earlier draft of this spec.** The first port was built from a
screenshot and got the structure roughly right but the details wrong. Measured
against the source:

- Nav rows are a `gap-0.5` list, **not** hairline-separated. The 1px bottom
  borders seen in the DOM belong to a parent, not the rows.
- The active pill border is `0.8px` and the shadow is `0px_4px_7px`, not a
  generic 1px border.
- The sidebar collapses to `w-0` and is `inert`, not to a 56px icon rail.
- The shell `main` is the only `main`; pages must not render their own.
- Focus is `ring-[3px] ring-ring/40`, not a 2px outline.


## 3. Colour

Tokens are declared as `--c-*` on `:root` (light, default) and `.dark`, then
exposed to Tailwind. Legacy names (`ink`, `line`, `inset`, `surface-raised`,
`accent`) are aliased so unmigrated components keep rendering. Targets: text
4.5:1, UI boundaries 3:1.

### Neutrals

Light is the default. Both themes are first-class: the board is a daytime-long
surface on a dim monitor, and each theme gets its own tuned blue ramp.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#f2f4fd` | `#101319` | app background, blue-tinted rather than neutral |
| `well` | `#eaeefa` | `#0b0e14` | sunken column bodies, inputs |
| `surface` | `#ffffff` | `#181c26` | cards, panels |
| `raised` | `#ffffff` | `#1f2430` | popovers, menus, secondary buttons |
| `line` | `#e0e5f2` | `#252b39` | default 1px borders |
| `line-strong` | `#c7cee0` | `#394154` | hover borders, input borders |
| `ink` | `#0f172a` | `#e8edf5` | primary text, primary button fill |
| `ink-2` | `#4d4c63` | `#c2c9d6` | secondary text |
| `ink-3` | `#5c5f70` | `#9aa0ae` | tertiary text (still 4.5:1) |
| `ink-4` | `#8b8fa3` | `#6f7480` | non-text only (icons at rest, dividers) |

### Accent

| Token | Light | Dark | Use |
|---|---|---|---|
| `accent` | `#2f57c4` | `#7aa7f5` | signal button fill, selection outline, active icons, links |
| `accent-ink` | `#ffffff` | `#0b0e14` | text on accent fills |
| `accent-tint` | `rgb(47 87 196 / 0.10)` | `rgb(122 167 245 / 0.16)` | selection fill, active nav |
| `focus` | `#2f57c4` | `#7cb0ff` | 2px focus outline, offset 2, every interactive element |

**The accent never means status.** It means: this is interactive, this is
selected, this is the forward action. Every status has its own hue, so
"selected" and "running" can never be confused.

### Semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `danger` / `danger-text` | `#d94f4f` / `#c43f3f` | `#fb8f8f` / `#ff9e9e` | destructive, failures |
| `warning` | `#b45309` | `#fbbf24` | silent or stuck health only |
| `success` / `success-text` | `#2b8f5c` / `#217a4e` | `#6ee7a0` / `#7cf0ac` | confirmations |
| `review` / `review-text` | `#8b5cd6` / `#7440c4` | `#bb9bf5` / `#c7aaf7` | awaiting the review gate |

### Status lamps

Nine distinct hues, none equal to the accent. Filled means "has a state",
hollow means "waiting or parked", so state survives colour blindness and is
always paired with a label.

| Status | Lamp | Light | Dark |
|---|---|---|---|
| triage | hollow | `#8b8fa3` | `#7b8090` |
| todo | hollow | `#4a4560` | `#cfd5e0` |
| scheduled | hollow, dashed | `#8b8fa3` | `#7b8090` |
| ready | filled | `#3b6fe0` | `#7aa7f5` |
| running | filled, pulsing | `#6d5ce0` | `#9b8cfb` |
| blocked | filled | `#d94f4f` | `#fb8f8f` |
| review | filled | `#8b5cd6` | `#bb9bf5` |
| done | filled | `#2b8f5c` | `#6ee7a0` |
| archived | hollow, dim | `#8b8fa3` | `#7b8090` |

Two notes on this table. `ready` shares the accent's hue family, which is
deliberate: ready means "queued, actionable", the same family as the signal
button, and it is the one state where the resemblance is meaningful. `running`
is indigo, not blue, so the two adjacent columns never read as the same thing.

### Measured contrast (Revision 3)

The lamp values above are **non-text** — a 2px track line and an 8px dot. WCAG
1.4.11 sets the bar at **3:1** for those, and every one clears it.

The **label** values, which do carry meaning in text and so need **4.5:1**, are a
separate ramp. Measured against their own surface:

| Status | Light label | Ratio | Dark label | Ratio |
|---|---|---|---|---|
| triage / scheduled | `#5c5f70` | 6.31 | `#9aa0ae` | 6.50 |
| todo | `#3f3a52` | 10.83 | `#dbe1ea` | 12.95 |
| ready | `#2f57c4` | 6.40 | `#8fb6f8` | 8.28 |
| running | `#5b4bc9` | 6.37 | `#ab9dfc` | 7.27 |
| blocked | `#c43f3f` | **5.08** | `#ff9e9e` | 8.63 |
| review | `#7440c4` | 6.42 | `#c7aaf7` | 8.53 |
| done | `#217a4e` | 5.31 | `#7cf0ac` | 12.10 |

Blocked is the tightest at 5.08 — still passing, but it is the value to re-check
first if the palette ever moves again. Lamps measure 3.20 minimum against
surface, against the 3.0 bar.

These ratios required sRGB linearisation to compute. A luminance function that
skips it collapses every value toward 1 and reports the whole ramp as failing,
which is how the first pass of this check went badly wrong.

### Chart and heatmap scale

`heat-0` to `heat-4`, a single blue ramp for the activity heatmap. Light:
`#e2e8f0`, `#bfdbfe`, `#93c5fd`, `#60a5fa`, `#2563eb`. Dark: `#1e293b`, `#1e3a5f`,
`#1d4ed8`, `#3b82f6`, `#60a5fa`. Categorical charts reuse the status lamp
colours.

## 4. Typography

| Role | Family | Notes |
|---|---|---|
| UI, body, headings | **Inter Variable** | One family, weight and size carry hierarchy. The reference uses it and it holds up at 13px. |
| Identifiers only | **JetBrains Mono** (variable) | Task IDs, paths, commands, executor args, diffs, cron expressions, log lines. Never for labels. |

Install: `pnpm add @fontsource-variable/inter @fontsource-variable/jetbrains-mono`

### Scale

| Token | Size / line | Use |
|---|---|---|
| `2xs` | 11 / 16 | timestamps, mono IDs |
| `xs` | 12 / 16 | chips, meta, helper text |
| `sm` | 13 / 20 | default UI text, buttons, inputs |
| `base` | 15 / 24 | long-form: task results, markdown |
| `lg` | 18 / 26 | section titles |
| `xl` | 24 / 30 | page titles |
| `2xl` | 32 / 36 | overview numbers, empty-state hero |

Headings use `-0.011em` tracking. Counts and timers use `tabular-nums`. Long-form
lines stay under 72ch. Sentence case everywhere. No tracked caps except the
sidebar's group labels, which are structural, not content.

## 5. Shape, elevation, spacing, density

| Token | Value | Applies to |
|---|---|---|
| `radius-control` | 8px | buttons, inputs, chips, menu items |
| `radius-card` | 12px | task cards, list rows, popovers |
| `radius-panel` | 16px | column wells, dialogs, sheets |
| `radius-full` | 9999px | lamps, avatars, count pills |

Reference the 0.5rem base radius and its `rounded` / `rounded-md` / `rounded-lg`
ladder, but keep three distinct steps rather than one global value.

### Surface texture — decorative areas only

Two utilities, both composable:

- `dot-grid` — 1px dots at a 22px pitch, in `line-strong` at 55%. A repeating
  `radial-gradient`, so no extra request and the pitch is a variable.
- `smoke-wash` — two soft radial blooms, accent at 6% and review at 5%. Keeps
  the page ground alive without becoming a field the eye reads through.
- `glow-ground` — three blooms with a real falloff curve (0 → peak → 0 via an
  extra midpoint stop), accent 14% / review 11% peaking. This is the **app shell
  ground**, where the sidebar's glass stands directly on it.

**`glow-ground` replaced `dot-grid` on the shell.** The dot grid was the wrong
texture at that specific spot for two reasons, both measured rather than
eyeballed:

1. 1px dots at a 22px pitch are too fine to survive the sidebar's
   `backdrop-filter`. The blur averaged them into a flat haze, so the glass was
   diffusing nothing — the exact failure the wash was introduced to prevent.
   A dot grid only works where nothing blurs over it.
2. A regular lattice reads as graph paper. Switchyard is a work tool; the shell
   wants a material, not a texture.

The glow keeps a scale the blur cannot flatten, and the soft edge reads as
emission where a hard-tinted field reads as paint. `dot-grid` stays on the flow
map canvas, empty states and sign-in.

Peak alphas match `smoke-wash` deliberately: the sidebar's 12px section labels
sit directly on this ground. Verified against the canvas the blooms peak on —
body ink 13.30:1, `ink-2` 6.19:1, `ink-3` **4.71:1**, the narrowest margin on the
labels. Dark mode needs 22% / 16% for the same reason the wash does (a near-black
canvas swallows the light-mode strength); verified at `ink-3` 4.77:1.

**Where they are allowed:** empty states, sign-in, the flow map canvas, page
headers. Anywhere with no data on it.

**Where they are not:** the board, tables, forms, the chat transcript, any
surface carrying 13px body copy. A texture behind small text competes with the
glyphs and costs legibility. This is the one rule that keeps the texture from
becoming the consumer-app look the references actually are.

Verified: on the most saturated canvas the wash produces, body ink holds
**8.54:1** and tertiary ink **5.40:1**. The texture is affordable because it
never sits under text that matters.

### Glass

The tier is chosen by **depth**, not taste. Three strengths:

| Utility | Blur | Layer | Consumers |
|---|---|---|---|
| `glass` | 20px | L2 | **sidebar rail**, **top bar**, kanban column, chat rail, empty state |
| `glass-card` | **none** | L3 | `ui/card.tsx`, `entry-card`, flow node cards, overview/knowledge grids, **select trigger** |
| `glass-flat` / `-strong` | none | dense | buttons, segmented tracks, dense rows |
| `glass-strong` | 32px | L4/L5 | dialog, sheet, popover, dropdown, **select panel**, palette, toast, composer, review gate |

The shell is glass from the rail inward; see §0c for why the `floating`
sidebar variant is what makes that hold up rather than reading as a plate over
the page.

### Rows inside a frosted panel carry no elevation

The single easiest way to break this material is to put a tier on a list item.
`glass-flat` carries a `box-shadow`, so on a 12-item list that is a dozen boxes
each casting its own shadow onto the panel above them — the list stops reading
as frosted and starts reading as striped.

So: **the panel is the surface, the rows are content.** A row gets a hover or
keyboard-highlight fill and nothing else. Measured on the profile select:

| | background | shadow | backdrop-filter |
|---|---|---|---|
| panel | `rgb(30 38 55 / .78)` | glass elevation | `blur(32px) saturate(1.8)` |
| row (highlighted) | accent @ 14% | **none** | **none** |
| trigger | `rgb(46 56 78 / .42)` | glass elevation | **none** |

The trigger takes `glass-card` rather than `glass-flat`: it needs the 1px
hairline and the radius to read as something you press, and a closed select was
otherwise a tint with no edge. It carries no blur, because a trigger sits on a
panel that is already glass — that blur would be paid on every select on the
page rather than only while one is open.

Tokens (light block, overridden on `.dark`):

| Token | Light | Dark | Use |
|---|---|---|---|
| `glass-tint` | `rgb(255 255 255 / .74)` | `rgb(46 56 78 / .42)` | panel + card fill |
| `glass-tint-strong` | `rgb(255 255 255 / .84)` | `rgb(30 38 55 / .78)` | overlay fill |
| `glass-blur` | 20px | 20px | `backdrop-filter` radius |
| `glass-blur-strong` | 32px | 32px | overlays |
| `glass-saturate` | 1.6 | 1.6 | keeps the blur from going grey |
| `glass-edge` | `rgb(21 34 66 / .16)` | `rgb(255 255 255 / .14)` | the 1px hairline |
| `glass-lift` / `-card` / `-strong` | soft wide + inset | dark contact + wide ambient | elevation, per theme |

Five ingredients: **translucent fill → backdrop blur + saturate → 1px hairline →
inset top highlight → layered shadow.** Two optional ones: `glass-sheen` (a
gradient rim for overlays) and `glass-spotlight` (a pointer-tracked radial).

### Verified, not eyeballed — and measured against the orbs

`scripts/contrast-glass.py` composites each glass fill over its **worst-case
backdrop — an orb directly behind the panel**, not the flat canvas — and runs
WCAG relative luminance. Re-run it after any tint or orb change.

| | ink | ink-2 | ink-3 | accent-text | success-text | danger-text | review-text |
|---|---|---|---|---|---|---|---|
| **Light** panel | 15.88 | 7.39 | 5.62 | 5.69 | 4.72 | **4.52** | 5.71 |
| **Dark** panel | 10.10 | 7.14 | 4.53 | 5.78 | 8.44 | 6.02 | 5.95 |
| **Light** overlay | 16.62 | 7.73 | 5.88 | 5.96 | 4.94 | 4.73 | 5.97 |
| **Dark** overlay | 12.27 | 8.67 | 5.51 | 7.02 | 10.25 | 7.31 | 7.23 |

Bar is 4.5:1. The tightest cases are `danger-text` on light panel glass at
**4.52** and `ink-3` on dark panel glass at **4.53** — both clearing, and both
close enough that a future orb brighter than `--glow-a` would break them.

**These alphas are the measured result, not a preference.** The first pass
carried light panel at `0.62` and dark at `0.32`, which put `danger-text` at
4.28, `success-text` at 4.46 and dark `ink-3` at 4.14 — three real failures
that a glance at a screenshot would not have caught. Raising the tints and
pulling `--glow-a` back from `0.40` to `0.32` is what closed them.

**The hairline is a dark line on light and a light line on dark.** At
`white/0.9` on light it was invisible against a bright ground — which is the
same class of error as a white border on white.

**Glass is defined by elevation, not by an outline.** A version that drew a rim
and almost no shadow measured the panel at 1.16:1 against its own ground. A
shadow is the honest signal: glass is a surface *above* something.

### Glass is capped by depth, not spread

`backdrop-filter` is not free: every element carrying one becomes its own
compositing layer and the browser cannot batch them. Measured on `/skills`
before Revision 5, a normal-sized page carried **463** of them — because
`ui/card.tsx` put blurred glass on *every* card root.

So the material is chosen by depth:

- **L2 panels blur.** One layer per visual stack.
- **L3 cards do not.** A card's backdrop is already a blurred panel.
- **Inputs do not.** Small, and always sitting on a panel that is already glass.
- **`glass-flat`** covers dense rows, where 400 identical blurred panels buy
  nothing because they sit edge to edge on the same ground.

Budget: **≤ 3 stacked blur layers per viewport region.** Measured on the board
in Chromium: **10 blurred elements — the top bar and the nine columns. 0 on the
sidebar, 0 on cards.** Counted with `getComputedStyle`, not assumed.

### `-webkit-backdrop-filter` must come first, or the blur silently vanishes

This is the single most dangerous rule in the material, because getting it
wrong produces **no error at all** — the CSS is valid, the build is clean, the
tests pass, and the glass silently renders as flat translucent fill.

Lightning CSS (Tailwind v4's transform) treats the prefixed and standard
`backdrop-filter` as one declaration. Written in the conventional order —

```css
backdrop-filter: blur(20px) saturate(1.6);
-webkit-backdrop-filter: blur(20px) saturate(1.6);
```

— it dedupes the rule down to the **prefixed form only**:

```css
.glass{background-color:var(--glass-tint);
       -webkit-backdrop-filter:blur(var(--glass-blur)) saturate(var(--glass-saturate));
       …}   /* no unprefixed property — and Chromium ignores the prefixed one */
```

Measured directly: `style="-webkit-backdrop-filter:blur(5px)"` computes to
`none`; `style="backdrop-filter:blur(5px)"` computes to `blur(5px)`. So the
order decides whether the effect exists at all.

**Always write the prefixed declaration first, then the standard one.** Verified
in the built CSS:

```css
.glass{-webkit-backdrop-filter:blur(var(--glass-blur)) saturate(var(--glass-saturate));
       backdrop-filter:blur(var(--glass-blur)) saturate(var(--glass-saturate)); …}
```

**Check this after any change to the glass utilities**, with:
`grep -o '\.glass{[^}]*}' web/dist/assets/index-*.css | grep -c 'backdrop-filter'`
— it must be `2`, not `1`.

### The glow field

`components/app/glow-field.tsx`, mounted once in `AppShell`. Three orbs
(`--glow-a/b/c`, `blur(90px)`) positioned so the sidebar, the column strip and
the composer each have coloured light behind them, plus a masked `--glow-grid`
and a grain overlay on `body::after` that kills the banding a 90px blur of a
low-alpha gradient would otherwise produce.

Dark blends the orbs with `screen` — an additive blend clipped the cyan orb to
a flat pale disc and the panels behind it lost their edge entirely.

Measured on the board, dark theme: field 1440×900, orbs 669 / 581 / 529 px,
`blur(90px)`, `screen` blend, all three on `orb-drift`, grid at 48px, grain at
0.035.

`glow-ground` and `smoke-wash` are removed. Both were painted gradients on the
element itself, which meant they sat *behind* an opaque fill and did nothing
once the surfaces became real glass panels.

### Glow means state

`glow-focus · glow-running · glow-success · glow-danger · glow-review`, each a
ring plus a bloom. Never used on a static element: a glow on something with no
state is decoration pretending to be a signal. Every one is paired with a
non-colour cue — a `StatusLamp`, a chip, a label — because colour alone never
conveys state.

| Switchyard state | Glow |
|---|---|
| Card running on a node | `glow-running` + `glow-pulse` |
| Awaiting the review gate | `glow-review` |
| Blocked / failed | `glow-danger` |
| Dragging | `glow-focus`-style lift + `scale(1.02)` + `rotate(1.5deg)` |
| Keyboard focus | `glow-focus` |

### The effects budget

`kb-effects` → `data-effects` on `<html>`, set pre-paint by the same inline
script that applies the theme. **"Reduce effects"** in Settings:

| | Full | Lite |
|---|---|---|
| blur | 20 / 32px | 8 / 12px |
| orb drift | on (if motion allowed) | off |
| grain | on | off |
| glass fill, shadows, every colour | — | **unchanged** |

It is a performance setting, not a visual style: it trades what is expensive and
leaves what is cheap. `prefers-reduced-transparency` does the same thing at the
OS level. Under both, the focus **ring** survives and only the bloom drops —
the ring is what focus actually is.

`@media (forced-colors: active)` drops fills and blur entirely and draws real
borders in `CanvasText`.

### Density

`--card-pad` and `--row-h` existed but were consumed by exactly one component,
so the density setting did nothing on collection pages. Card padding is now on
the `EntryCard` variants themselves: identity and infrastructure are the same
shape (`gap-2.5 p-3.5`) because they carry the same information volume, and
`registry` is denser (`gap-1 p-2.5`) because it lists rather than describes.

### Motion

The audit found **zero** animations running on a static page, which is correct:
nothing in the app loops forever. Every repeating animation means something is
actually happening — a streaming response, a running task, a fetch in flight.

What was missing was the opposite problem. There is now one orchestrated
entrance: `CollectionGrid` rises its first eight children 6px over 260ms on
`--ease-out-expo`, staggered 14ms apart, and the rest are simply present. Past
eight the stagger becomes latency rather than choreography. It is keyframed, not
a transition, so it runs once and stops; and it is skipped under reduced motion.

- **Elevation:** content sits flat on tonal steps (`well` < `canvas` < `surface`
  < `raised`) plus a 1px `line`. Shadows only for things that float:
  popovers, dialogs, dragged cards. `shadow-float: 0 12px 32px -12px rgb(0 0 0 / .18), 0 0 0 1px var(--c-line-strong)`.
- **Borders:** hairline `line`, rising to `line-strong` on hover. This is the
  reference's `black/0.04` idea expressed as a token.
- **Blur** is allowed only on the command palette scrim (4px), never on content.
- **Spacing:** 4px base. Card padding 12, column gap 12, card gap 8, page
  gutter 24 (16 on mobile).
- **Content width:** Collection pages use a centred column capped at **1680px**,
  with the grid going 1 → 2 → 3 → 4 columns at `md` / `xl` / `2xl`. Prose inside
  stays capped separately at 64ch, which is the constraint that actually governs
  reading. A single fixed 1200px cap was wrong: exact at 1440px, but it wasted
  235px per side at 1920 and 555px at 2560, which reads as broken rather than
  sparse. These figures are measured, not estimated.
- **Density:** `data-density="comfortable"` (default, 32px rows) or `"compact"`
  (28px rows, 10px card padding). Stored in settings.

## 6. Layout

### Shell

The 250px sidebar collapses to 56px and remembers the choice. Content shifts,
it never sits underneath.

```
┌────────────────┬──────────────────────────────────────────────────────────┐
│ ◆ Switchyard ⇤ │ ▦ Board / Local                             ⌘   🔔     │
├────────────────┼──────────────────────────────────────────────────────────┤
│ [ Search…    K]│ Local board                          [Local ▾][⋯][New]  │
│                │ Queue, dispatch and review for this board.               │
│ WORK           ├──────────────────────────────────────────────────────────┤
│ ▦ Board        │ [Search tasks…][Status ▾][Agent ▾][Workspace ▾]  6 of 6  │
│ ▤ Chat         │                                                          │
│ ◈ Flow map     │  ● Ready 2   ● Running 0   ● Blocked 2   ● Review 1     │
│                │  ━━━━━━━━   ━━━━━━━━━━   ━━━━━━━━━━   ━━━━━━━━━━        │
│ AGENTS         │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐         │
│ …              │  │ card   │  │ card   │  │ card   │  │ card   │         │
│                │                                                          │
├────────────────┼──────────────────────────────────────────────────────────┤
│ ＋ New chat    │                                                          │
│ ⚙ Settings     │                                                          │
│ ⏻ Sign out     │                                                          │
└────────────────┴──────────────────────────────────────────────────────────┘
```

Sidebar, ported from the reference's source:

| Part | Spec |
|---|---|
| Width | 250px. Collapses to `w-0` and is `inert`; a menu button appears in the header to reopen it |
| Brand | 250px row, `px-3 py-3.5`, logo left, 24px collapse toggle right in a tooltip |
| Divider | 1px `line` between brand and search |
| Search | 32px `InputGroup`, 0.8px `line`, `rounded-lg`, 226px wide, `⌘K` badge that hides on focus |
| Group label | 12px, uppercase, `ink-3`, `leading-[1.6]` |
| Row | 32px, `gap-0.5` between rows, 13px, `rounded-lg`, `px-2.5` |
| Active row | `surface` fill, 0.8px `line`, `shadow-active`, accent icon and ink text |
| Icon | 16px, `ink-3` at rest, `scale-110` on hover |
| Focus | `ring-[3px] ring-focus/40` on every control |
| Sub-items | 28px, `text-xs`, `ink-3`, behind a tree connector; expand with a `grid-template-rows` transition |
| Footer | New chat, Settings, Sign out at 32px rows |

The logo is `currentColor` and lives in `components/app/brand.tsx`:

| Part | Spec |
|---|---|
| `LogoMark` | 24×24 grid. Filled head, eyes punched out with an SVG mask (not a hard-coded colour, so it works on canvas, card and sign-in), four stroked tentacles with curled tips. Renders at 24px in the sidebar and is **not legible below 20px**, so it is never smaller |
| `LogoWordmark` | "Switchyard" set as text at 17px/600 in the UI font, not as an SVG path. A hand-written path renders as nonsense letterforms, and the reference sets its own name as text too |
| `LogoMascot` | The full-colour `mascot-switchyard.png`. The one place the original artwork belongs: sign-in and empty states, where there is room for its detail |

Both marks take the reference's brand treatment: 24px, `rotate-[-8deg] scale-105` on
hover over 300ms with `--ease-out-expo`.

Content is a `<main>` on `surface` with `shadow-[inset_0_0_0_0.8px_var(--c-line)]`.
**It is the only `main` in the document** — pages must not render their own.

Top bar, 52px: sidebar toggle (only when hidden), breadcrumb segments joined by
`/`, icon actions right.

**Breadcrumbs express location, not title.** They appear only when a page is
genuinely nested one level below its nav entry. Every top-level page already
carries an `h1` in its own page header, so naming it twice is noise. Task detail
is the only page that passes segments (`Board / <task title>`). The bar itself
stays mounted when the sidebar is collapsed, since the reopen toggle needs a
home.

### Board

- Filters are a **toolbar row** of dropdown chips with a live "6 of 6" count,
  plus Saved views. Never a side panel.
- Columns: 296px wide, headers on the canvas, bodies in a `well` with
  `radius-panel`.
- Column header: lamp, title (Inter 600 at 14px), tabular count, optional
  quick-add. A 2px track line in the lamp colour sits under it.
- Column order: Triage, Todo, Scheduled, Ready, Running, Blocked, Review, Done,
  Archived. Rarely used columns (Triage, Scheduled, Archived) collapse to a 40px
  vertical strip showing the lamp and count.
- **Scroll.** The grid scrolls horizontally: nine 296px columns cannot fit a
  1440px viewport, and a board genuinely should scroll. A clipped card at the
  edge gave no hint that scrolling was possible, so the scroller shows a gradient
  on whichever side has more content and hides it when there is none. Both are
  `pointer-events-none` so they never swallow a drag.
- Left-aligned everywhere. No centred text except empty states.

### Task detail

Two-pane on desktop: summary and controls (lamp, assignee, workspace, executor,
health) in a 320px sticky left column, activity and output in a `base`-size
prose column (max 72ch) with mono for commands and diffs. The review gate is a
sticky footer bar: Reject, Request changes, and one accent button, "Approve and
commit".

## 7. Components

### Buttons

| Variant | Look | When |
|---|---|---|
| `default` | accent fill, `accent-ink` text | main action on most screens |
| `signal` | alias of `default`, kept for call sites | the one forward action on the screen (max one visible) |
| `secondary` | `raised` fill, 1px `line` | supporting actions |
| `outline` | transparent, `line-strong` | toolbar and filter triggers |
| `ghost` | text only, `raised` on hover | row and card actions, icon buttons |
| `destructive` | danger tint, danger text | delete, stop |
| `link` | accent text, underline on hover | inline navigation |

Sizes: `xs` 24, `sm` 28, `default` 32, `lg` 40, plus `icon-xs`, `icon-sm`,
`icon`, `icon-lg`. Press: `scale(0.97)`. Loading: spinner replaces the icon and
the width holds. Focus: 2px `focus` outline, offset 2. Disabled: 45% opacity.
Icon-only buttons always carry `aria-label`. Essential actions are never
hover-only.

### Title groups

- **PageHeader:** breadcrumb (optional), title (`xl`), one-line description
  (`sm`, `ink-3`, max 64ch), actions right-aligned, optional toolbar slot. One
  `h1` per page.
- **SectionHeader:** `h2` (`lg`), optional description, optional actions. Use
  instead of card-in-card titles.
- Titles are nouns ("Board", "Providers"). Actions are verbs ("New task",
  "Add provider").

### Status lamp and chips

- `StatusLamp` is the only way to show task status: lamp plus label, `xs` text.
- Chips: `radius-control`, 1px `line`, `xs`, 24px tall, for host (Mac, Windows,
  Linux), executor and priority. Mono only inside chips showing a literal
  identifier.

### Task card

```
▎ Refactor executor dispatch to a queue        ↗
▎ Move the in-memory dispatch loop behi…  (mono, 1 line)
▎ (◐) worker ▾              Windows · P2    ⇄
```

- Surface `surface`, 1px `line`, `radius-card`, padding 12 (left 16 to clear
  the coupler tick).
- Coupler tick: 3px × 20px, status lamp colour, left edge.
- Title: 2 lines max, `sm`/500. Open-page icon is a ghost `icon-xs` button,
  always visible at rest colour.
- Body: first line of result or body only, 1 line, mono. Full text in the detail
  view.
- Footer: assignee menu (avatar and name), host chip, failure count
  (`danger-text` with icon, never colour alone), a Move menu ("Move to Ready")
  replacing arrow chips.
- Selection: checkbox appears on hover, on focus, or once any card is selected.
  Selected cards get an `accent` outline and `accent-tint` fill.
- Running cards show the pulsing lamp with health text ("healthy", "silent",
  "stuck") and elapsed time. No border beam, no glow.
- Dragging: `shadow-float`, 40% opacity at the origin, drop target gets a dashed
  `line-strong` outline.

### Inputs and menus

- Inputs: `well` fill, 1px `line-strong`, `radius-control`, 32px tall. Focus:
  focus outline. Placeholder: `ink-3`.
- Selects and dropdowns use `raised` with `shadow-float`. Item height 28,
  `radius-control`.
- Filter chips show the selected value ("Agent: worker"), not an empty label.
- Tooltips: `raised`, `xs`, no blur, origin-aware.

### Tables and lists

Row height 36 (32 compact), 1px `line` between rows, no zebra, sticky header
with `ink-3` sentence-case labels. Numbers right-aligned and tabular.

### Empty, error, loading

- Empty states say what is true and what to do. Running column: "Nothing
  running" / "Ready tasks start on the next dispatch, within 30 seconds." Board
  with zero tasks: "No tasks yet" / "Create a task or drag one in from another
  board." with an accent "New task" button.
- Errors state what failed and how to fix it, with no apology. Example:
  "Couldn't reach the Mac worker. Check that node-agent is running and Tailscale
  is connected." with a "Retry" button.
- Loading uses skeletons with `well` fills. The `simple-loader` spinner remains
  for buttons only.

## 8. Motion

| Moment | Motion | Duration |
|---|---|---|
| First board load per session | column track lines draw in, staggered 70ms | 600ms, `--ease-out-expo` |
| Card moves between columns | layout position spring (`motion`) | about 250ms |
| Task enters running | lamp starts pulsing | 2s loop, ends when status changes |
| Approve at review gate | check mark draws, card exits | 300ms |
| Hover, focus, press | colour and scale only | 100 to 150ms |
| Glow orb drift | three orbs, alternate | 28 / 34 / 40s — **only when motion is not reduced** |

### The one ambient loop, and why it is opt-in

Revision 5 adds three drifting orbs, and this section's standing rule — no
loop the user cannot stop — is why they are gated on the motion preference
rather than on by default.

The orbs are the only thing in the app whose animation carries no meaning: they
are ambience. Every other repeating animation in this list means something is
actually happening. So they run only under `motion: system`, and they are
**removed entirely** by "Reduce effects", which is a performance setting.

What is *not* removed under reduced motion is the orbs themselves. They are the
backdrop the entire material diffuses; turning off the drift must not turn off
the light. The user asked for less movement, not for a different app.

Easing curves, from the reference and stronger where the UI needs it:

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);   /* reference */
--ease-out-quint: cubic-bezier(0.23, 1, 0.32, 1);  /* interaction default */
--ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

No `ease-in` on any UI element: it delays the exact moment the user is watching.
Popovers are origin-aware (`transform-origin: var(--transform-origin)`);
modals keep `center`. Nothing animates `width`, `height`, `padding` or `margin`.
The command palette opens with **no** animation — it is used hundreds of times a
day and animation makes it feel slow.

`prefers-reduced-motion` disables the track draw, lamp pulse, layout springs and
traveling dots. State changes still apply, instantly. The manual "Reduce motion"
setting (`data-motion="reduce"`) does the same.

## 9. Copy

- One UI language: English, sentence case. Move Indonesian strings behind a `t()`
  dictionary if you want both.
- Replace: "Cari setting…" with "Search settings", "Memuat workspaces" with
  "Loading workspaces", "Belum ada task" with "No tasks yet", "Buka detail
  page" with "Open task page", "Semua status" with "All statuses".
- Verbs name actions and toasts repeat them: "Save changes" then "Changes
  saved", "Ping all" then "Pinged 8 workspaces".
- Never write `→` in a label, "WORD — fragment" titles, or dot-joined meta
  strings; use chips or separate lines.

## 10. Accessibility floor

Visible 2px `focus` outline on everything, offset 2. 4.5:1 text contrast in
both themes (`ink-3` on `surface` is the tightest pair and must be measured, not
assumed). Lamps always paired with a label. Drag-and-drop always has the Move
menu as a keyboard path. Reduced motion respected. Board usable down to 375px
(columns become a tabbed single-column view). Sheets and dialogs trap focus and
restore it on close.

## 11. Migration

Phases 0 to 3 of the previous plan are already landed on this branch and remain
valid: dead code removal, the token system, the board rebuild and the rail.
This section covers what changes from that state.

| Phase | Work | Done when |
|---|---|---|
| R1 | Replace the lantern tokens with the blue system in `index.css`. Re-map every `--c-lantern*`, `--c-accent*` and `--c-st-*` value. Swap the `.light` / `.dark` class roles so light is the default. | The board renders blue; both themes look right |
| R2 | Recolor `StatusLamp` for the nine new hues. Verify the hollow/filled/pulsing shapes still distinguish state without colour. | Lamp is the only status display, no colour-only state |
| R3 | Replace the 56px rail with a 250px collapsible sidebar: logo header, collapse toggle, search, grouped items, footer. Persist collapse in settings. | Sidebar collapses and restores; content never sits under it |
| R4 | Switch typography to Inter Variable. Keep JetBrains Mono for identifiers only. | No Barlow remains; mono is identifiers only |
| R5 | Adopt the reference's density: 34px nav rows, 11px tracked group labels, hairline borders, `radius-card` 8px. | Sidebar and board match §5 and §6 |
| R6 | Rewire `Button` to the blue system. `signal` and `default` both resolve to accent so existing call sites keep working. | No lantern fill anywhere |
| R7 | Update `app-header` to a breadcrumb bar, and `design.md` §6 shell diagram to match. | Top bar matches the reference structure |
| R8 | Grep for `lantern`, `uppercase tracking` outside the sidebar, and hard-coded hex. Move every remaining value to a token. | `grep -rn "lantern" web/src` returns nothing |

## 12. Acceptance checklist

- [ ] Blue is the only accent; `grep -rn "lantern" web/src` is empty.
- [ ] Every status has a hue distinct from the accent; status is never shown by
      colour alone.
- [ ] Sidebar is 250px, collapses to 56px, remembers state, and shows the
      Switchyard logo in both themes.
- [ ] Logo is legible at 24px on `surface` in light and dark.
- [ ] One `h1` per page and at most one accent button in view.
- [ ] `axe-core` reports zero violations on the board in both themes.
- [ ] No `uppercase tracking-*` outside the sidebar group labels.
- [ ] Names, URLs, paths, models and IDs truncate safely with a full-value
      tooltip.
- [ ] No horizontal page overflow from 375px to 1920px.
- [ ] Keyboard: every interactive element shows the focus outline; sheets and
      dialogs trap and restore focus.
- [ ] Reduced motion disables track draw, lamp pulse, layout springs and dots.
- [ ] Reduced motion **stops orb drift but keeps the orbs painted**.
- [ ] `data-effects="lite"` drops blur to 8px and kills drift and grain, with
      no change to any colour or to the glass fill.
- [ ] `prefers-reduced-transparency: reduce` flattens the glass and drops the
      grain; `forced-colors: active` drops fills and blur for system borders.
- [ ] Glow is never the only cue: every `glow-*` element also has a lamp, a
      chip or a label.
- [ ] Blur layers per viewport region ≤ 3, measured with
      `getComputedStyle`, not assumed. Board baseline: top bar + rail + nine
      columns. **0 on cards, 0 on list rows.**
- [ ] The shell is frosted from the rail inward, on the **`floating`** sidebar
      variant — `inset` re-walls the rail off and the glass stops reading.
- [ ] `SidebarInset` and the `SidebarProvider` wrapper carry **no**
      `backdrop-filter`. Either one captures the non-portalled `CommandPalette`.
- [ ] No `glass*` tier on a list row. Rows inside a frosted panel carry a
      highlight fill and **no** `box-shadow` and **no** `backdrop-filter`.
- [ ] No control inside a glass surface uses `bg-transparent`. On a blurred
      panel a transparent fill renders *darker* than the surface beneath it and
      reads as a hole punched through the glass.
- [ ] Every segmented track on a glass surface is a recessed well (inset
      shadow) with a raised active pill (outward lift), matching `Segmented`.
- [ ] Type on a filled accent surface uses `text-on-accent` / `bg-on-accent`.
      Never a hard-coded `#fff` or `#000` — dark's accent is a light blue and
      white on it measures 2.42:1.
- [ ] No Tailwind class referencing a token that does not exist. A class with no
      matching `--color-*` generates nothing and fails open:
      `grep -o '\.to-accent-lo{' web/dist/assets/index-*.css` must be empty.
- [ ] A rendered screenshot of any surface whose JSX children you touched. A
      bare `/* */` among JSX children renders as visible text, and no gate
      catches it.
- [ ] **Every glass utility emits BOTH `-webkit-backdrop-filter` and
      `backdrop-filter`**:
      `grep -o '\.glass{[^}]*}' web/dist/assets/index-*.css | grep -c 'backdrop-filter'`
      must be `2`. This is the one failure that produces no error anywhere.
- [ ] Every portalled overlay escapes its `backdrop-filter` ancestor. In
      particular: `CommandPalette` is **not** portalled, so neither
      `SidebarInset` nor the `SidebarProvider` wrapper may ever carry a filter.
- [ ] Both themes meet 4.5:1 for text.
- [ ] All copy is one language, sentence case.
- [ ] `pnpm build` and `pnpm test` pass from `web/`.
