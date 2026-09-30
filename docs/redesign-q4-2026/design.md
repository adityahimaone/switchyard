# Switchyard UI Redesign 2026: Signal & Track

Supersedes `redesign.md` (Blue Glass). Extends `design.md` (feature-page cards) where they don't conflict.
Scope: `web/` (React 19, Vite, Tailwind v4, shadcn/Radix, `motion`). No API, routing, or data-model changes.

## 1. Brief

**Subject.** Switchyard is the control plane for coding agents. A solo developer queues tasks, watches workers on Mac and Windows hosts, and approves diffs at a review gate.

**Primary job.** Scan a queue of 60+ tasks, spot what needs a human (blocked, review), and act in one or two clicks.

**Physical scene.** A dim 27" monitor with the board open all day, plus a phone check on the go. Density, contrast, and calm matter more than spectacle.

### What's wrong today (from the repo and screenshot)

| Finding | Where |
|---|---|
| Glass, aurora gradients, glow, and radial washes on every card and button | `index.css`: `.glass-*`, `.aurora-*`, `.decorative-card`, `.kanban-task-card`, `.blue-glow` |
| One accent (blue) carries brand, focus, selection, and info at once | tokens |
| Column titles are tracked ALL CAPS; card footers use `→ todo → ready` arrow chips | `TaskCard.tsx`, `.kanban-column-title` |
| Filters open as a left panel that covers the first board column | Kanban toolbar |
| UI copy mixes English and Indonesian ("Semua status", "Belum ada task", "Buka detail page") | throughout |
| `!important` on `.kanban-column` and dead `.provider-card-*` / `.gauge-dial` rules | `index.css` |
| **Bug:** `@theme` chart aliases point to `var(----chart-*)` (four dashes), and `--chart-*` defaults are light-theme greys inside the dark `:root` | `index.css` |
| Promo card ("Smarter queue triage") pinned in the sidebar | `app-sidebar.tsx` |

## 2. Concept: Signal & track

A switchyard is a rail yard: tracks, signals, and an interlocking gate that stops a train until it is cleared. The UI borrows that vocabulary in exactly two places and stays quiet everywhere else.

1. **Signal lamps carry state.** Every status is a small lamp (filled, hollow, or pulsing) plus a text label. Color is information, never decoration.
2. **Tracks carry structure.** Each board column is a track: a 2px line in the column's lamp color under its header, and a 3px "coupler" tick on the left edge of each card.
3. **Everything else is neutral steel.** Surfaces are flat, separated by 1px lines and tonal steps. No glass, glow, gradients, or texture on content.
4. **Primary action is ink, not color.** The main button is high-contrast ink. The single lantern-yellow button ("Signal") is reserved for the one action that moves work forward on that screen (New task, Approve).
5. **The memorable moment:** on first board load per session, the column tracks draw in left to right (about 600ms, staggered). Nothing else animates on its own except the running lamp.

### Plan review against the brief (what I changed and why)

- Dropped a blue or violet accent. It reads as the default "AI dashboard" look and is what the app already has. Lantern yellow comes from rail signals and hi-vis gear, and it makes "running" (a lit lamp) the most visible thing on the board.
- Dropped monospace for all small labels. Mono is kept only for real machine text: task IDs, paths, commands, executor args, diffs.
- Dropped ALL CAPS and dotted meta strings. Labels use sentence case.
- Dropped a single radius for everything. Radii follow hierarchy (section 5).
- Dropped numbered markers and eyebrows. Nothing in this UI is a sequence except the pipeline itself, and the columns already show that order.

## 3. Color

Tokens are declared as `--c-*` on `:root` (dark, default) and `.light`, then exposed to Tailwind. Legacy names (`ink`, `line`, `inset`, `surface-raised`, `accent`) are aliased so existing components keep working during migration. Check contrast with tooling before shipping. Targets: text 4.5:1, UI boundaries 3:1.

### Neutrals

| Token | Dark "Night yard" | Light "Day yard" | Use |
|---|---|---|---|
| `canvas` | `#14181D` | `#EEF0EC` | app background |
| `well` | `#101317` | `#E6E9E4` | sunken column bodies, inputs |
| `surface` | `#1A1F26` | `#FBFBF9` | cards, panels |
| `raised` | `#212832` | `#FFFFFF` | popovers, menus, secondary buttons |
| `line` | `#2B333E` | `#D3D8D0` | default 1px borders |
| `line-strong` | `#3B4654` | `#B9C0B6` | hover borders, input borders |
| `ink` | `#E9EDF2` | `#171C22` | primary text, primary button fill |
| `ink-2` | `#B4BDC9` | `#3A4350` | secondary text |
| `ink-3` | `#8791A0` | `#5B6573` | tertiary text (still 4.5:1) |
| `ink-4` | `#5F6A79` | `#8A93A0` | non-text only (icons at rest, dividers) |

### Brand and semantic

| Token | Dark | Light | Use |
|---|---|---|---|
| `lantern` | `#FFC83D` | `#F5B70A` | Signal button fill, selection outline, running lamp |
| `lantern-ink` | `#1B1400` | `#1B1400` | text on lantern fills |
| `accent` (text-safe) | `#FFC83D` | `#7A5200` | links, active icons (legacy `--color-accent`) |
| `focus` | `#FFC83D` | `#2457D6` | 2px focus outline, offset 2px, every interactive element |
| `danger` / `danger-text` | `#FF6B6B` / `#FF9A9A` | `#C43D3D` / `#9A2222` | destructive, failures |
| `warning` | `#FF9A4D` | `#B45F00` | silent or stuck health only |
| `success` | `#4ADE9C` | `#167A4E` | confirmations |

### Status lamps

Each status has a color and a lamp shape, so state survives color blindness and is always paired with its label.

| Status | Lamp | Dark | Light |
|---|---|---|---|
| triage | hollow | `#8791A0` | `#5B6573` |
| todo | hollow | `#B4BDC9` | `#3A4350` |
| scheduled | hollow, dashed | `#8791A0` | `#5B6573` |
| ready | filled | `#7CC4FF` | `#1F6FB8` |
| running | filled, pulsing | `#FFC83D` | `#B77B00` |
| blocked | filled | `#FF6B6B` | `#C43D3D` |
| review | filled | `#A995FF` | `#6146D9` |
| done | filled | `#4ADE9C` | `#167A4E` |
| archived | hollow, dim | `#5F6A79` | `#8A93A0` |

### Chart and heatmap scale (fixes the broken chart tokens)

`heat-0` to `heat-4`. Dark: `#2B333E`, `#4A3D14`, `#8A6B17`, `#D1A028`, `#FFC83D`. Light: `#DDE1D9`, `#F6E2A6`, `#F0C95A`, `#D9A012`, `#A87700`. This is the single-hue ramp for the planned bklit activity heatmap. Categorical charts reuse the status lamp colors.

## 4. Typography

Two families, clearly different.

| Role | Family | Notes |
|---|---|---|
| Headings, column titles, big numerals | **Barlow Semi Condensed** 600 | Descended from transport signage, so it fits the theme. Semi-condensed keeps column titles and counts compact. |
| UI and body | **Barlow** 400/500/600 | Slightly warm, very legible at 13px. |
| Identifiers only | **JetBrains Mono** (variable) | Task IDs, paths, commands, executor args, diffs. Never for decorative labels. |

Install: `pnpm add @fontsource/barlow @fontsource/barlow-semi-condensed @fontsource-variable/jetbrains-mono`

### Scale (minor third, dense-UI base of 13px)

| Token | Size / line | Use |
|---|---|---|
| `2xs` | 11 / 16 | timestamps, mono IDs |
| `xs` | 12 / 16 | chips, meta, helper text |
| `sm` | 13 / 20 | default UI text, buttons, inputs |
| `base` | 15 / 24 | long-form: task results, markdown |
| `lg` | 18 / 26 | section titles |
| `xl` | 24 / 30 | page titles |
| `2xl` | 32 / 36 | overview numbers, empty-state hero |

Rules: headings use `-0.01em` tracking, everything else default. Counts and timers use `tabular-nums`. Long-form lines stay under 72ch. Sentence case everywhere. No tracked caps.

## 5. Shape, elevation, spacing, density

| Token | Value | Applies to |
|---|---|---|
| `radius-control` | 6px | buttons, inputs, chips, menu items |
| `radius-card` | 10px | task cards, list rows, popovers |
| `radius-panel` | 14px | column wells, dialogs, sheets |
| `radius-full` | 9999px | lamps, avatars, count pills |

- **Elevation:** content sits flat using tonal steps (`well` < `canvas` < `surface` < `raised`) plus 1px `line`. Shadows are only for things that float: popovers, dialogs, dragged cards. `shadow-float: 0 12px 32px -12px rgb(0 0 0 / .55), 0 0 0 1px var(--c-line-strong)`.
- **Blur** is allowed only on the command palette and modal scrim, never on content.
- **Spacing:** 4px base. Card padding 12, column gap 12, card gap 8, page gutter 24 (16 on mobile).
- **Density:** `data-density="comfortable"` (default, 32px rows) or `"compact"` (28px rows, 10px card padding). Stored in settings.

## 6. Layout

### Shell

Replace the wide glass sidebar with a **rail**: 56px icons by default, expanding to 232px when pinned or on hover. Titles never overlay content. The board keeps its full width.

```
┌────┬────────────────────────────────────────────────────────────────┐
│ ◈  │ Board · Default ▾          Search tasks…  ⌘K   Bulk  [New task]│
│ ▤  ├────────────────────────────────────────────────────────────────┤
│ ☰  │ Status ▾  Agent ▾  Workspace ▾  Priority ▾   63 of 63   Views ▾│
│ ⌥  ├────────────────────────────────────────────────────────────────┤
│ …  │ ● Ready 12   ● Running 0   ● Blocked 3   ● Review 31   ● Done 24│
│    │ ━━━━━━━━━    ━━━━━━━━━     ━━━━━━━━━     ━━━━━━━━━     ━━━━━━━━━ │
│ ⚙  │ ┌───────┐    ┌───────┐     ┌───────┐                            │
└────┴─┴───────┴────┴───────┴─────┴───────┴────────────────────────────┘
```

Nav groups (sentence case, no promo card):

| Group | Items |
|---|---|
| Work | Board, Chat, Flow map |
| Agents | Profiles, Skills, Providers, Memory |
| Infrastructure | Workspaces, Cron jobs, Ecosystem |
| Observe | Overview, Logs |

The active item gets a raised background and a 2px lantern marker on its left edge. "New chat" is a secondary button at the top. Release notes move into the notification menu.

### Board

- Filters become a **toolbar row** of dropdown chips (Status, Agent, Workspace, Priority) with a live "63 of 63" count, plus a Saved views menu. No side panel.
- Columns: 296px wide, headers on the canvas, bodies in a `well` with `radius-panel`.
- Column header: lamp, title (Barlow Semi Condensed 14/600), count (tabular), optional quick-add. A 2px track line in the lamp color sits under it.
- Left-aligned everywhere. No centered text except empty states.
- Column order stays: Triage, Todo, Scheduled, Ready, Running, Blocked, Review, Done, Archived. Rarely used columns (Triage, Scheduled, Archived) collapse to a 40px vertical strip showing the lamp and count.

### Task detail

Two-pane on desktop: summary and controls (lamp, assignee, workspace, executor, health) at left in a 320px column, activity and output at right in a `base`-size prose column (max 72ch) with mono for commands and diffs. The review gate is a sticky footer bar: Reject, Request changes, and one Signal button, "Approve and commit".

## 7. Components

### Buttons

| Variant | Look | When |
|---|---|---|
| `default` | ink fill, canvas text | main action on most screens |
| `signal` | lantern fill, lantern-ink text | the one forward action on the screen (max one visible) |
| `secondary` | raised fill, 1px line | supporting actions |
| `outline` | transparent, strong line | toolbar and filter triggers |
| `ghost` | text only, raised on hover | row and card actions, icon buttons |
| `destructive` | danger tint, danger text | delete, stop |
| `link` | accent text, underline on hover | inline navigation |

Sizes: `xs` 24, `sm` 28, `default` 32, `lg` 40, plus `icon-xs`, `icon-sm`, `icon`, `icon-lg`. Press: 1px downward shift. Loading: spinner replaces the icon and the width holds. Focus: 2px `focus` outline, offset 2. Disabled: 45% opacity. Icon-only buttons always carry `aria-label`. Essential actions are never hover-only.

### Title groups

- **PageHeader:** breadcrumb (optional), title (`xl`, display), one-line description (`sm`, `ink-3`, max 64ch), actions right-aligned, optional toolbar slot below. One `h1` per page.
- **SectionHeader:** `h2` (`lg`, display), optional description, optional actions. Use it instead of card-in-card titles.
- Titles are nouns ("Board", "Providers"). Actions are verbs ("New task", "Add provider").

### Status lamp and chips

- `StatusLamp` is the only way to show task status. Lamp plus label, `xs` text.
- Chips: `radius-control`, 1px line, `xs`, 24px tall, for host (Mac, Windows, Linux), executor, and priority. Mono only inside chips that show a literal identifier.

### Task card

```
▎ Git Pull Dev Bisadaya                         ↗
▎ provenance executor=dsh requested=dsh bin=/opt…      (one line, mono, truncated)
▎ (◐) jihyo ▾                  Mac · 2 failed    ⇄
```

- Surface `surface`, 1px `line`, `radius-card`, padding 12 (left 16 to clear the coupler tick).
- Coupler tick: 3px by 20px, status lamp color, left edge.
- Title: 2 lines max, `sm`/500. Open-page icon is a ghost `icon-xs` button, always visible at rest color.
- Body text: first line of result or body only, 1 line. Full text lives in the detail view.
- Footer: assignee menu (avatar and name), host chip, failure count (`danger-text` with icon, never color alone), a Move menu ("Move to Ready") replacing the arrow chips.
- Selection: checkbox appears on hover, on focus, or once any card is selected. Selected cards get a lantern outline and a `lantern-tint` fill.
- Running cards show the pulsing lamp with health text ("healthy", "silent", "stuck") and elapsed time. No border beam or glow.
- Dragging: `shadow-float`, 40% opacity at the origin, drop target gets a dashed `line-strong` outline.

### Inputs and menus

- Inputs: `well` fill, 1px `line-strong`, `radius-control`, 32px tall. Focus: focus outline. Placeholder: `ink-3`.
- Selects and dropdowns use `raised` with `shadow-float`. Item height 28, `radius-control`.
- Filter chips show the selected value ("Agent: worker"), not the empty label.
- Tooltips: `raised`, `xs`, no blur.

### Tables and lists

Row height 36 (32 compact), 1px `line` between rows, no zebra, sticky header with `ink-3` sentence-case labels. Numbers right-aligned and tabular.

### Empty, error, and loading

- Empty states say what is true and what to do. Running column: "Nothing running" / "Ready tasks start on the next dispatch, within 30 seconds." Board with zero tasks: "No tasks yet" / "Create a task or drag one in from another board." with a Signal button "New task".
- Errors state what failed and how to fix it, with no apology. Example: "Couldn't reach the Mac worker. Check that node-agent is running and Tailscale is connected." with a "Retry" button.
- Loading uses skeletons with `well` fills. The `simple-loader` spinner remains for buttons only.

### Charts and heatmap

Grid lines use `line` at 60%. Axis labels `xs`/`ink-3`. Tooltips use `raised` and `shadow-float`. The activity heatmap uses `heat-0` to `heat-4` with `radius: 3px` cells and 3px gaps.

## 8. Motion

| Moment | Motion | Duration |
|---|---|---|
| First board load per session | column track lines draw in, staggered 70ms | 600ms, `cubic-bezier(.22,1,.36,1)` |
| Card moves between columns | layout position spring (`motion`) | about 250ms |
| Task enters running | lamp starts pulsing | 2s loop, ends when status changes |
| Approve at review gate | check mark draws, card exits | 300ms |
| Hover, focus, press | color and 1px shift only | 100 to 120ms |

No scroll-triggered fade-ups, no entrance animation on every card, no idle glows. `prefers-reduced-motion` disables the track draw, lamp pulse, and layout springs (state changes still apply instantly).

## 9. Copy

- Pick one UI language. This spec is written in English; move Indonesian strings behind a small dictionary if you want both.
- Sentence case. Verbs for actions: "Save view", "Approve and commit", "Stop task". The toast repeats the verb: "Task stopped."
- Name things by what users manage ("Workers", "Review"), not how they are built ("node-agent queue").
- No `→` in labels, no `WORD — fragment` titles, no middle-dot meta strings. Use separate chips.

## 10. Accessibility floor

Visible keyboard focus on everything, 4.5:1 text contrast in both themes, 24px minimum target (32px on touch), lamps always paired with a label, drag-and-drop always has the Move menu as a keyboard path, reduced motion respected, board usable down to 375px (columns become a tabbed single-column view).

## 11. Migration plan

| Phase | Work | Done when |
|---|---|---|
| 0 | Fix `----chart-*` aliases. Delete dead `.provider-card-*`, `.gauge-dial`. | charts render in both themes |
| 1 | Add `tokens.css`, load fonts, keep legacy aliases. Swap `button.tsx`, add `status-lamp`, `page-header`. | app builds, shell recolored, nothing broken |
| 2 | New `BoardColumn` and `TaskCard`. Remove `.decorative-card`, `.kanban-task-card`, `.kanban-column-*` and their `!important`. | board matches section 6 |
| 3 | Rail sidebar, filter toolbar, task detail two-pane and review gate bar. | no overlay panels |
| 4 | Remaining pages (Profiles, Providers, Skills, Flow map, Logs, Overview) move to `PageHeader`, `SectionHeader`, and the shared card and table styles. Heatmap adopts `heat-*`. | old classes fully removed |
| 5 | Delete `.glass-*`, `.aurora-*`, `.blue-glow`, `.surface-texture`. Grep for hard-coded hex. | no matches |

### Old to new

| Old | New |
|---|---|
| `aurora-button`, `default` variant | `default` (ink) or `signal` |
| `glass-control`, `glass-panel*`, `glass-toolbar` | `surface` or `raised` with 1px `line` |
| `decorative-card`, `kanban-task-card` | `TaskCard` |
| `aurora-nav-active` | rail item with lantern marker |
| `--color-blue-glow`, `blue-glow`, `surface-texture` | removed |
| `text-[10px] uppercase tracking-wider` | `text-xs` sentence case |
| `status-pill` | `StatusLamp` |

## 12. Skeleton code

Copy the files into `web/src/` as noted. They target the existing aliases (`@/lib/utils`, `@/api`, `@/components/ui/*`).

| File | Destination |
|---|---|
| `skeleton/tokens.css` | append to or replace the token blocks in `src/index.css` |
| `skeleton/button.tsx` | `src/components/ui/button.tsx` |
| `skeleton/status-lamp.tsx` | `src/components/ui/status-lamp.tsx` |
| `skeleton/page-header.tsx` | `src/components/app/page-header.tsx` |
| `skeleton/board-column.tsx` | `src/features/board/BoardColumn.tsx` |
| `skeleton/task-card.tsx` | `src/features/board/TaskCard.tsx` |
| `skeleton/app-rail.tsx` | `src/components/app/app-rail.tsx` |
