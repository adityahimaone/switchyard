# Switchyard UI Redesign 2026, Revision 2: "Signal Blue"

Supersedes `redesign-q4-2026/design.md` ("Signal & Track", lantern yellow) and
the legacy dark/cyan spec in `redesign.md`. Extends `design-surfaces.md` for
per-page layout where it does not conflict.

Scope: `web/` (React 19, Vite, Tailwind v4, shadcn/Radix, `motion`). No API,
routing, query or data-model changes.

## 1. What changed from Revision 1, and why

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
| `canvas` | `#f7f8fa` | `#0f1319` | app background |
| `well` | `#eef1f6` | `#0a0d12` | sunken column bodies, inputs |
| `surface` | `#ffffff` | `#161b23` | cards, panels |
| `raised` | `#ffffff` | `#1d242e` | popovers, menus, secondary buttons |
| `line` | `#e3e8ef` | `#252d38` | default 1px borders |
| `line-strong` | `#cbd3de` | `#36404e` | hover borders, input borders |
| `ink` | `#0f172a` | `#e8edf5` | primary text, primary button fill |
| `ink-2` | `#475569` | `#b0bbcb` | secondary text |
| `ink-3` | `#64748b` | `#8592a3` | tertiary text (still 4.5:1) |
| `ink-4` | `#94a3b8` | `#5b6775` | non-text only (icons at rest, dividers) |

### Accent

| Token | Light | Dark | Use |
|---|---|---|---|
| `accent` | `#2563eb` | `#60a5fa` | signal button fill, selection outline, active icons, links |
| `accent-ink` | `#ffffff` | `#0a0d12` | text on accent fills |
| `accent-tint` | `rgb(37 99 235 / 0.10)` | `rgb(96 165 250 / 0.16)` | selection fill, active nav |
| `focus` | `#2563eb` | `#7cb0ff` | 2px focus outline, offset 2, every interactive element |

**The accent never means status.** It means: this is interactive, this is
selected, this is the forward action. Every status has its own hue, so
"selected" and "running" can never be confused.

### Semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `danger` / `danger-text` | `#dc2626` / `#b91c1c` | `#f87171` / `#fca5a5` | destructive, failures |
| `warning` | `#b45309` | `#fbbf24` | silent or stuck health only |
| `success` | `#15803d` | `#4ade80` | confirmations |

### Status lamps

Nine distinct hues, none equal to the accent. Filled means "has a state",
hollow means "waiting or parked", so state survives colour blindness and is
always paired with a label.

| Status | Lamp | Light | Dark |
|---|---|---|---|
| triage | hollow | `#94a3b8` | `#5b6775` |
| todo | hollow | `#475569` | `#b0bbcb` |
| scheduled | hollow, dashed | `#94a3b8` | `#5b6775` |
| ready | filled | `#2563eb` | `#60a5fa` |
| running | filled, pulsing | `#4f46e5` | `#818cf8` |
| blocked | filled | `#dc2626` | `#f87171` |
| review | filled | `#7c3aed` | `#a78bfa` |
| done | filled | `#15803d` | `#4ade80` |
| archived | hollow, dim | `#94a3b8` | `#5b6775` |

Two notes on this table. `ready` shares the accent's hue family, which is
deliberate: ready means "queued, actionable", the same family as the signal
button, and it is the one state where the resemblance is meaningful. `running`
is indigo, not blue, so the two adjacent columns never read as the same thing.

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
| `radius-control` | 6px | buttons, inputs, chips, menu items |
| `radius-card` | 8px | task cards, list rows, popovers |
| `radius-panel` | 10px | column wells, dialogs, sheets |
| `radius-full` | 9999px | lamps, avatars, count pills |

Reference the 0.5rem base radius and its `rounded` / `rounded-md` / `rounded-lg`
ladder, but keep three distinct steps rather than one global value.

- **Elevation:** content sits flat on tonal steps (`well` < `canvas` < `surface`
  < `raised`) plus a 1px `line`. Shadows only for things that float:
  popovers, dialogs, dragged cards. `shadow-float: 0 12px 32px -12px rgb(0 0 0 / .18), 0 0 0 1px var(--c-line-strong)`.
- **Borders:** hairline `line`, rising to `line-strong` on hover. This is the
  reference's `black/0.04` idea expressed as a token.
- **Blur** is allowed only on the command palette scrim (4px), never on content.
- **Spacing:** 4px base. Card padding 12, column gap 12, card gap 8, page
  gutter 24 (16 on mobile).
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

The logo is `currentColor`, so it inherits the theme. `Logo` is the full lockup
(mark plus wordmark, viewBox `0 0 114 24`) and `LogoIcon` is the mark alone; they
are alternatives, not siblings, because `hidden` is unconditional and cannot be
overridden by a variant.

Content is a `<main>` on `surface` with `shadow-[inset_0_0_0_0.8px_var(--c-line)]`.
**It is the only `main` in the document** — pages must not render their own.

Top bar, 52px: sidebar toggle (only when hidden), breadcrumb segments joined by
`/`, icon actions right.

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
- [ ] Both themes meet 4.5:1 for text.
- [ ] All copy is one language, sentence case.
- [ ] `pnpm build` and `pnpm test` pass from `web/`.
