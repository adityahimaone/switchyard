# Switchyard UI Redesign 2026, Part 2: App surfaces

Companion to `design.md` (Signal & track: tokens, type, buttons, lamps, board, task card, rail). This document applies that system to every other surface: chat, profiles, providers, skills, workspaces, settings, overview, memory, knowledge, cron, logs, ecosystem, notifications, sign-in, command palette, task detail and the flow map.

Skeleton code is in `skeleton-surfaces.md`. Nothing here changes APIs, routes, queries or mutations.

## 1. Rules inherited from Part 1

Read `design.md` sections 3 to 9 first. The short version:

| Rule | Consequence for these surfaces |
|---|---|
| Neutral steel surfaces, flat, 1px `line` | No `glass-*`, `aurora-*`, `decorative-card`, `BorderBeam`, glow or gradient washes on content |
| Lantern yellow = one forward action per screen | Each page below names its one `signal` button, or has none |
| Status uses `StatusLamp` (lamp plus label) | Chat run state, workspace ping, key state, MCP state all reuse it |
| Sentence case, no tracked caps | Delete every `uppercase tracking-*` label and `text-[10px]` eyebrow |
| Mono only for real identifiers | Session IDs, model names, paths, URLs, commands, cron expressions, log lines |
| One h1 per page via `PageHeader` | Replaces the per-page `<p class="font-mono uppercase">` eyebrow plus `h1` |

## 2. What the audit found

| Finding | Where |
|---|---|
| Every page opens with a mono ALL CAPS eyebrow ("Hermes Studio", "Hermes Execution", "Hermes Runtime", "Node fleet", "Review gate") | Settings, Workspaces, Cron, Overview, others |
| Page titles are re-implemented per page with different paddings (`p-4`, `px-6 py-4`, `max-w-6xl`) | all pages |
| Semantic color is hard-coded per component (`text-emerald-300`, `text-amber-300`, `violet-500/10`, `sky-300`, `fuchsia-300`) | chat `EventCard`, workspace badges, review section |
| Chat state is shouted: `stateLabel()` returns "READY", "RUNNING", "ERROR" | `ChatPage.tsx` |
| Composer is wrapped in an animated rainbow `BorderBeam` | `ChatPage.tsx` |
| Chat user bubbles use `bg-primary` (will become ink after the token swap) and `rounded-2xl` | `ChatPage.tsx` |
| Model, profile and workspace selectors in the composer are three pill selects with different widths (`w-36`, `max-w-36`, `w-32`) | `ChatPage.tsx` |
| Modals are hand-built (`fixed inset-0 bg-black/60`) in Cron and Workspaces while `dialog.tsx`, `sheet.tsx` and `system-modal.tsx` also exist: three dialog systems | Cron, Workspaces, Chat |
| Workspace cards use `decorative-card`, a colored platform badge and an `ssh` violet badge, each with its own tint | `WorkspacesPage.tsx` |
| Settings has 8 tabs, one 560-line file, an always-hidden `TabsList` and a left nav rebuilt by hand | `SettingsPage.tsx` |
| Knowledge page is a 290-line static doc laid out as cards with icon headings; content mixes English and Indonesian | `KnowledgePage.tsx` |
| Copy is bilingual ("Cari setting…", "Memuat…", "lu buka halaman") | all pages |
| Sign-in page: 4xl headline with a marketing tagline and an eyebrow ("Protected app") | `auth-page.tsx` |

## 3. Shared page patterns

Four page layouts cover the whole app. Every feature page picks one.

| Layout | Pages | Structure |
|---|---|---|
| **Collection** | Profiles, Providers, Skills, Workspaces, Cron jobs, Ecosystem | `PageHeader` with toolbar slot, then a responsive grid or list of entries, optional detail sheet at right |
| **Split** | Chat, Settings, Memory | Fixed 260 to 280px list or nav at left, fluid content at right |
| **Dashboard** | Overview | `PageHeader`, then a tile row, then panels in a 12-column grid |
| **Document** | Knowledge, Logs, Task detail | Prose column at max 72ch (Logs and diffs are full width) |

Page frame: `PageHeader` (from Part 1), then content in a scroll area. Page gutter 24px (16 on mobile). Content max width: Collection 1200px, Document 1040px, Dashboard 1280px, Split fills the shell.

### Entry cards (Collection)

One card anatomy, three densities. The old `design.md` rule stays: same system, different information hierarchy.

```
┌────────────────────────────────────────┐
│ ● name                        [status] │  identity row: lamp or icon, name (truncates), one state
│ secondary line, mono if identifier     │  one line, truncates, title tooltip
│ metric · metric                        │  compact metrics with labels
│ [Primary]                     [ ⋯ ]    │  one visible primary action, overflow menu for the rest
└────────────────────────────────────────┘
```

- Surface `surface`, 1px `line`, `radius-card`, padding 16 (12 compact).
- Hover: border to `line-strong`. Selected: 1px `lantern` outline. No shadow, no scale.
- Delete never sits next to Edit: it lives in the overflow menu, in `danger-text`, and asks for confirmation.
- Every flex row that holds technical text uses `min-w-0`. No fixed card widths.

| Density | Used for | Padding | Rows |
|---|---|---|---|
| Identity | Profiles, Workspaces | 16 | 3 to 4 |
| Infrastructure | Providers, MCP servers, Extensions | 16 | 3, expandable roster |
| Registry | Skills | 12 | 2, description clamped to 2 lines |

### Detail sheet

Selecting an entry opens a right-side `Sheet` (480px, full width on mobile), not a centered modal and not an inline panel. One dialog system only: `Dialog` for confirmations and small forms, `Sheet` for anything that shows or edits an entry. `system-modal.tsx` and the two hand-built overlays in Cron and Workspaces are removed.

### Filter toolbar

Same pattern as the board: search input (32px), dropdown chips that show the chosen value ("Platform: Mac"), a live count ("6 of 8"), and view or sort controls right-aligned. Never a side panel.

### Empty, loading, error

Follow Part 1 section 7. Loading skeletons keep final card geometry. Errors name the feature and the failure and give one action. Empty search states name the query and offer no fake action: "No skills match 'deploy'."

## 4. Chat

Job: run a conversation with an agent profile in a chosen workspace, watch what the agent does, and stop it if it goes wrong. Layout: **Split**.

```
┌───────────────┬──────────────────────────────────────────────────────┐
│ Sessions      │ Fix the flaky test          worker · Mac · codex   ⋯ │
│ [ Search… ]   ├──────────────────────────────────────────────────────┤
│ Today         │                                       ┌────────────┐ │
│ ▸ Fix flaky…  │                                       │ Run the…   │ │
│   Refactor …  │  ● worker                              └────────────┘ │
│ Yesterday     │  Found it. The test relies on…                       │
│   Deploy che… │  ▸ 3 tool calls · 12.4s                              │
│               │                                                      │
│               ├──────────────────────────────────────────────────────┤
│ [ New chat ]  │  Message worker…                                     │
│               │  [profile ▾] [workspace ▾] [model ▾] [+]   [ Send ]  │
└───────────────┴──────────────────────────────────────────────────────┘
```

### Session list (left, 280px)

- Search on top, grouped by Today, Yesterday, Earlier this week, Older. Group labels are sentence case, `xs`, `ink-3`.
- Row: title (1 line, truncates), then profile name and relative time in `xs` `ink-3`. Active row gets `raised` fill and the 2px lantern marker like the rail.
- Running sessions show a pulsing `StatusLamp` instead of a timestamp.
- Row actions (rename, duplicate, fork, export, archive, delete) live in the `SessionMenu` overflow, visible on hover and focus. Delete asks for confirmation.
- Collapsible below 1024px. On mobile it becomes a `Sheet`.
- Primary button "New chat" is `secondary` at the top of the list (not `signal`; sending a message is the forward action here).

### Conversation header

Title (editable inline), then chips for profile, workspace host, model. One overflow menu. No state label: state is shown by the lamp next to the newest assistant turn.

### Turns

- **User turn:** right-aligned block, `raised` fill, `radius-card` (not fully round), max width 70ch, `base` text. No shadow.
- **Assistant turn:** full-width, left-aligned, no bubble. A 20px avatar and profile name in `sm`/500 above the text, `base` text in a 72ch column, markdown rendered with the Part 1 prose rules.
- **Turn footer** (visible on hover and focus, always visible for the latest turn): time, model, elapsed time, all `xs`. Model and session ID are mono because they are identifiers. Errors add a `StatusLamp` labelled "Error" or "Cancelled" and a "Retry" ghost button.
- **Activity group:** consecutive events (tool calls, reasoning, approvals, subagents) collapse into one row under the turn, "3 tool calls · 12.4s", expandable. Expanded, each event is an `EventRow`.

### Event rows

Replace the six-color `eventMeta` map with one neutral row and a small icon per kind. Only two kinds get color, because only they need attention.

| Kind | Icon | Treatment |
|---|---|---|
| tool | Wrench | neutral; name in mono, output in a bounded mono block (max 8 lines, "Show all") |
| reasoning | Lightbulb | collapsed by default, `ink-3`, prose |
| subagent | Cpu | neutral, name plus status |
| spawned, completed | CircleDot, Check | neutral, one line |
| clarify | HelpCircle | **lantern** left border, question plus inline reply box |
| approval | ShieldCheck | **lantern** left border, command in mono, buttons "Approve" (`signal`) and "Deny" (`secondary`) |
| error, cancelled | AlertCircle, X | `danger-text` icon and label, message below |

### Composer

- One `surface` box with 1px `line-strong`, `radius-panel`. Focus: 2px focus outline on the box. No `BorderBeam`, no gradient, no glow.
- Textarea auto-grows to 8 lines. Placeholder: "Message worker" (profile name), `ink-3`.
- Control row below the text, left to right: attach (`ghost` icon), Profile chip, Workspace chip, Model chip, then Send at the right.
- The three chips are the same `outline` `xs` dropdown with the current value visible ("worker", "Mac · development", "codex"). One shared width rule: content-sized, max 160px, truncate. Broken profiles are disabled with the reason in the item ("Broken config").
- Send is `signal` and is the only lantern element on the page. While a run is active it becomes `destructive` "Stop" with a square icon.
- Slash commands and skills autocomplete opens above the composer in a `raised` popover, 28px rows, command in mono, description in `ink-3`.
- Hint row (`xs`, `ink-3`): "Enter to send, Shift+Enter for a new line", character count right-aligned, hidden until the text is longer than 500 characters.
- Attachments appear as removable chips above the text; analysis status is text in the chip ("Analyzed"), not a green check line.
- The running state shows a slim progress row above the composer: pulsing lamp, phase label ("Preparing chat session", "Running tool"), elapsed timer. `ThinkingOrb` is removed from the transcript; the lamp replaces it.

## 5. Profiles, providers, skills

Layout: **Collection**. Card anatomy from section 3 and the existing `design.md` hierarchy rules.

### Profiles (identity)

```
┌────────────────────────────────────────┐
│ (avatar) default              ● Active │
│          codex · custom                │
│ 261 skills                    Valid    │
│ [ Edit ]                       [ ⋯ ]   │
└────────────────────────────────────────┘
```

- Runtime state ("Active") is stronger than configuration state ("Valid", "Broken config"). Config state is text with an icon; broken uses `danger-text` and the card gets a `danger-tint` footer line, never a tinted card.
- Model and provider on one mono line. Skill count is a labelled metric.
- Edit is the visible action (`secondary`). "Set active" and "Delete" sit in the overflow. Delete is disabled for the active profile, with a tooltip.
- Header actions: "New profile" is the page's `signal` button.
- Editing opens the detail `Sheet` with three sections (Identity, Model and provider, Skills) using `SettingsSection` from section 6.

### Providers (infrastructure)

```
┌────────────────────────────────────────┐
│ ▤ 9router.adityahimaone.space  ● Key set│
│   https://9router.adityahimaone.space/v1│
│   435 models        Default: codex     │
└────────────────────────────────────────┘
```

- Key state is a `StatusLamp`-style row: "Key set" (success lamp) or "Key missing" (danger lamp, filled), always labelled.
- Endpoint is mono, one line, truncated, full URL in `title`.
- Click toggles an expanded roster inside the card: divider, filter input, bounded list (max 240px) with default model marked. The card is a real `button` region with `aria-expanded`.
- Header: "Add provider" is the `signal` button.

### Skills (registry)

- Denser than the other two. Row layout in a 3-column grid (`lg`), 2 (`sm`), 1: name (`sm`/500, truncates), category chip right-aligned, 2-line description in `ink-3`.
- The puzzle icon is dropped. The category chip carries the grouping.
- Toolbar: search, Category dropdown chip, count. A list view (table) toggle for scanning 260 skills, using the Part 1 table rules.
- Selecting a skill opens the detail `Sheet` with the rendered SKILL.md in a 72ch prose column. No permanent side panel.
- No `signal` button on this page.

## 6. Settings

Layout: **Split**. Today: 8 tabs in one file, a hidden `TabsList`, a hand-built nav, and search that filters labels.

```
┌────────────┬─────────────────────────────────────────────────────────┐
│ General    │ Appearance                                              │
│ Appearance │ How Switchyard looks on this device.                    │
│ Notifica…  │                                                         │
│ Executors  │ Theme                                     ( ◐ System ▾ )│
│ Boards     │ Choose light, dark or match your system.                │
│ AI         │ ─────────────────────────────────────────────────────── │
│ Account    │ Density                                  ( Comfortable )│
│ Advanced   │ Compact fits about 20% more cards on screen.            │
│            │ ─────────────────────────────────────────────────────── │
│ [Search…]  │ Sidebar items                                           │
└────────────┴─────────────────────────────────────────────────────────┘
```

- Left nav 200px, plain text items, active item like the rail (`raised` plus lantern marker). It is a real `nav` with `aria-current`. Above 1024px only; below it becomes a `Select` at the top of the page.
- Content column max 640px, one `SettingsSection` per topic (`h2`, one-line description, then rows). Save is automatic per row where the setting is local; sections with server-side effects (Account password, Executors, AI) have an explicit "Save changes" `default` button at the section bottom, disabled until something changed.
- **Row anatomy:** label (`sm`/500) and help text (`xs`, `ink-3`, max 56ch) at left, control at right (Switch, Select, Segmented, Input). Rows separated by 1px `line`. No card per row.
- Search moves to the top of the nav and filters rows, showing matching sections and highlighting nothing (no yellow marks). "No settings match 'x'" when empty.
- Rename "AI / Vision" to "Vision and attachments". Rename "Boards" to "Boards and dispatch". Sentence case throughout.
- Danger zone (delete data, reset navigation): a `SettingsSection` with a `danger` left border and destructive buttons that open a confirm `Dialog`.
- Split the file: one component per tab under `features/settings/tabs/`.
- Appearance gains **Theme** (System, Light, Dark), **Density** (Comfortable, Compact) and **Reduce motion** (System, On). These write `data-density` on `<html>` and the `light` class per Part 1.

## 7. Workspaces

Job: see which hosts are reachable, add or edit them, browse files, read host logs. Layout: **Collection**, grouped by platform.

- Header: title "Workspaces", description "Where agents run. Loaded from `~/.hermes/workspaces.yaml`." (path in mono). Actions: "Ping all" (`secondary`) and "New workspace" (`signal`).
- Toolbar: Platform segmented control (All 8, Mac 5, Windows 2, Linux 1), "Auto-ping every 30s" switch, count.
- Groups: platform name as `h2` (`lg`), count in `xs`, no divider rules. Grid 1 to 2 columns.
- **Workspace card (identity):**

```
┌────────────────────────────────────────┐
│ ▣ next-portfolio-blog       ● Connected │
│   Mac · ssh · 42 ms                    │
│   /Users/adit/dev/next-portfolio-blog  │
│ [ Files ]  [ Logs ]                [ ⋯ ]│
└────────────────────────────────────────┘
```

  - Status lamp with label: Connected (success), Local (neutral filled), Unreachable (danger), Unknown (hollow). Ping latency in `xs` tabular text. Failure message in `danger-text` below when present, never only in a tooltip.
  - Platform, transport (ssh or local) and OS become plain text meta, not three colored badges. The ID is mono inside the overflow and the detail sheet, not on the card.
  - Path is mono, truncates from the start ("…dev/next-portfolio-blog") using `direction: rtl` on the truncating span.
  - Files and Logs open the detail `Sheet` on the right tab. Edit, Ping, Copy path, Delete are in the overflow.
- **Detail sheet** has three tabs: Overview (fields, Ping), Files (tree with keyboard navigation and a preview pane), Logs (mono, tail control, Copy). CodeGraph gets its own sub-section under Overview, not a separate panel.
- The workspace form is a `Sheet`. Fields: Name, ID, Path, Host, OS, Kind, Note. Validation is inline under the field.

## 8. Overview

Job: know in five seconds whether the system is healthy and what needs the human. Layout: **Dashboard**.

- Header: "Overview" plus a range dropdown chip (7 days, 30 days, 6 months).
- **Tile row** (4 tiles, no icons): Needs review (count, `StatusLamp` review), Blocked (count), Running (count with elapsed of longest), Workers online (3 of 4). Number in `2xl` display, label in `sm`, delta in `xs`. Tiles link to the filtered board. A tile is a link, so it gets hover border and focus outline.
- **Panels** (12-column grid, `surface`, `radius-panel`, 1px `line`, 16px padding):
  - Worker fleet (span 5): one row per host, lamp, name, OS, ping, current task title. This replaces the "Node fleet" eyebrow plus "Worker fleet status" double title.
  - Approval pipeline (span 7): horizontal segmented bar of tasks per stage from ready to done, each segment in its status lamp color, labelled below with counts. This is the one place color fills area.
  - Queue trend (span 8): line chart, 30 days, created versus completed. Series use the ink and lantern colors, not status colors.
  - Activity heatmap (span 12): bklit heatmap with the `heat-0` to `heat-4` ramp, 3px cell radius, months labelled, tooltip "12 tasks, 30 chats on Sep 12".
- Panel titles are `h2` `lg`, sentence case, with an optional description. No eyebrows.

## 9. Memory, knowledge, cron, logs, ecosystem

| Page | Layout | Notes |
|---|---|---|
| **Memory** | Split | Left list: Global context, then one entry per profile. Right: one editor with mono text, "Save changes" (`signal` only when dirty), "Revert" `secondary`. The dirty state is text: "Unsaved changes". Filter input above the list. |
| **Knowledge** | Document | Rename "Execution knowledge" to "How Switchyard works". Left in-page contents (sticky, 200px), right prose at 72ch. Replace icon-headed cards with `h2` sections. The three matrices (continuity fence, executor, chat run) become real tables with the Part 1 rules. Translate the Indonesian headings ("A sampai Z") to English. No `signal` button. |
| **Cron jobs** | Collection (list) | Table rows: name, schedule (mono, with a plain-language line below: "Every 2 hours"), last run with `StatusLamp`, next run, enabled switch. "New cron job" is `signal`. Create and edit use the detail `Sheet`; the hand-built overlay is removed. Skills field becomes a multi-select combobox instead of comma-separated text. |
| **Logs** | Document (full width) | Toolbar: file dropdown, tail dropdown, search, "Follow" switch, "Copy". Body is a virtualized mono list, 12px/20px, timestamps `ink-3`, level as text plus lamp (error danger, warn warning), matched terms in a `lantern-tint` background. Sticky toolbar. Search placeholder in English: "Search logs, e.g. dispatch, t_0b6b086c". |
| **Ecosystem** | Collection | Three `SectionHeader` groups: Gateway (one infrastructure card with status), Agent MCP servers (cards with enabled switch, transport, command or endpoint in mono), Extensions (registry cards). Add forms open in the detail `Sheet`, not inline at the bottom of the page. "Add MCP server" is the `signal` button on that section. |

## 10. Notifications, command palette, sign-in

### Notification center

- Popover from the header bell, 360px, `raised`, `shadow-float`. Tabs: All, Needs action. Row: `StatusLamp` (lamp only), title, one-line detail, relative time. Rows needing review show an inline "Review" `secondary` button.
- "Mark all as read" is a `link` button at the top right. Release notes live here as a normal entry instead of a card pinned to the sidebar.
- Bell dot: lantern, only when something needs action.

### Command palette (⌘K)

- Centered `raised` panel, 560px, `radius-panel`, `shadow-float`, background scrim with the app's only allowed blur (4px).
- Input 40px, no border, placeholder "Search tasks, pages and actions". Groups: Actions, Pages, Tasks, Chats (sentence case, `xs`, `ink-3`). Rows 32px: icon, label, right-aligned `Kbd` hint. Active row: `raised` fill. Task rows show a `StatusLamp` and the mono ID.
- Footer hints in `xs`: "↑↓ to move, Enter to open, Esc to close".

### Sign-in

- Single centered column, 360px, on `canvas`. Logo, `h1` "Sign in to Switchyard" (`xl`), password field, `signal`-free: the button is `default` "Sign in" (ink), full width. Error under the field in `danger-text`: "Wrong password. Try again."
- The marketing headline, eyebrow and left hero panel are removed. The one memorable element is a decorative row of lamps under the logo, one per status color, drawn like the track lines on load (reuses the `track-draw` motion; static under reduced motion).

## 11. Task detail and review gate

Extends Part 1 section 6.

- Left column (320px, sticky): title (`lg`), `StatusLamp`, fields (Assignee, Workspace, Executor, Priority, Created, Elapsed) as a definition list, health block for running tasks, "Move to" dropdown, overflow (clone, retry, release, archive, delete).
- Right column tabs: Activity, Output, Diff, Settings. Activity uses the same `EventRow` as chat. Output uses the mono block with a Copy button and "Show all".
- **Review gate:** sticky footer bar across the right column when status is `review`: file count and change summary at left ("4 files, +82 −17"), then "Reject" (`destructive`), "Request changes" (`secondary`) and "Approve and commit" (`signal`). Diff file list has "Select all", "Invert", and per-file checkboxes; the footer button label reflects the selection ("Approve 3 files").
- Diff view: full width mono, added lines `success` at 12% tint with a `+` gutter, removed lines `danger` at 12% tint with a `−` gutter. The gutter symbol carries meaning, so color is never alone.
- Copy: "Choose an action…" becomes explicit buttons. Failure text names the file and the reason.

## 12. Flow map

- Keep the dotted canvas, orthogonal connectors and minimap from the existing service-map design.
- Nodes: 200px wide, `surface`, 1px `line`, `radius-card`, a coupler tick in the node's status lamp color. Title `sm`/500, meta line `xs` `ink-3`. Selected: lantern outline.
- Connectors: 1px `line-strong`. Traveling dots use the lantern color only for edges with an active task; idle edges have no dot. This replaces the always-moving idle dots.
- Controls bottom-left: zoom in, zoom out, fit, all `secondary` `icon-sm`. Minimap bottom-right in `raised`.
- Reduced motion: dots are replaced by a solid lantern edge for active connections.

## 13. Copy and language

- One UI language: English. Move remaining Indonesian strings behind a `t()` dictionary if you want both.
- Replace: "Cari setting…" with "Search settings", "Memuat workspaces" with "Loading workspaces", "Belum ada task" with "No tasks yet", "Buka detail page" with "Open task page", "Semua status" with "All statuses", "Pilih aksi…" with the explicit buttons in section 11.
- Verbs name actions and toasts repeat them: "Save changes" then "Changes saved", "Ping all" then "Pinged 8 workspaces".
- Never write `→` in a label, "WORD — fragment" titles, or dot-joined meta strings; use chips or separate lines.

## 14. Component inventory (new or changed)

| Component | Status | Used by |
|---|---|---|
| `PageHeader`, `SectionHeader` | from Part 1 | all pages |
| `StatusLamp` | from Part 1 | all pages |
| `EntryCard` (identity, infrastructure, registry) | new | Profiles, Providers, Skills, Workspaces, Ecosystem |
| `DetailSheet` | new (wraps `sheet.tsx`) | all Collection pages, Cron, Ecosystem |
| `FilterBar`, `FilterChip` | new | board, Collection pages |
| `SettingsSection`, `SettingRow`, `SettingsNav` | new | Settings, profile sheet |
| `ChatSessionList`, `ChatTurn`, `ActivityGroup`, `EventRow`, `Composer` | new | Chat, task activity |
| `StatTile`, `Panel` | new | Overview |
| `EmptyState` | restyle of `empty.tsx` | everywhere |
| `ConfirmDialog` | new (wraps `dialog.tsx`) | all destructive actions |
| `Switch`, `Segmented` | restyle | Settings, toolbars |
| `BorderBeam`, `ThinkingOrb`, `ht-loader`, `floating-paths`, `decor-icon`, `glass.tsx` | **removed** | chat, loaders, auth |

## 15. Migration plan (continues Part 1 phases 0 to 5)

| Phase | Work | Done when |
|---|---|---|
| 6 | `EntryCard`, `DetailSheet`, `FilterBar`, `ConfirmDialog`, `EmptyState`. Remove `system-modal.tsx` and hand-built overlays. | one dialog system left |
| 7 | Profiles, Providers, Skills, Workspaces, Ecosystem, Cron move to Collection layout | no `decorative-card` in `features/` |
| 8 | Settings split into per-tab files with `SettingsSection` and `SettingRow`. Add Theme, Density and Reduce motion. | Settings file under 200 lines |
| 9 | Chat: `Composer`, `ChatTurn`, `ActivityGroup`, `EventRow`, session list. Remove `BorderBeam` and `ThinkingOrb`. | chat matches section 4 |
| 10 | Overview tiles and panels, heatmap on `heat-*`. Memory, Knowledge, Logs to their layouts. | no eyebrows left (`grep -rn "uppercase tracking"` is empty) |
| 11 | Task detail two-pane and review gate. Sign-in, command palette, notifications, flow map restyle. | all Part 1 and Part 2 acceptance items pass |

## 16. Acceptance checklist

- [ ] No page renders an eyebrow, mono ALL CAPS label or `uppercase tracking-*` class.
- [ ] Every page has one `PageHeader` and at most one `signal` button in view.
- [ ] Chat has one lantern element (Send or Approve) at a time.
- [ ] Status is always a lamp plus a text label; no color-only state.
- [ ] One dialog system: `Dialog` for confirmations, `Sheet` for entries.
- [ ] Delete is never adjacent to Edit and always confirms.
- [ ] Names, URLs, paths, models and session IDs truncate safely and expose the full value in a tooltip.
- [ ] No horizontal page overflow from 375px to 1920px.
- [ ] Keyboard: every interactive element shows the focus outline; sheets and dialogs trap focus and return it on close.
- [ ] Reduced motion disables track draw, lamp pulse, traveling dots and layout springs.
- [ ] Both themes meet 4.5:1 for text.
- [ ] All copy is one language, sentence case.
- [ ] `pnpm build` and `pnpm test` pass from `web/`.
