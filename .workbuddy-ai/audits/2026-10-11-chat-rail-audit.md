# Chat rail — technical UI audit

**Scope:** `web/src/features/chat/ChatPage.tsx` (the chat sidebar / "rail"), plus the  
shared primitives it depends on (`ui/dropdown-menu.tsx`, `ui/input.tsx`,  
`components/nav-user.tsx`).  
**Date:** 2026-10-11  
**Protocol:** `impeccable` → `references/audit.md` (5 dimensions × 0–4 = /20)  
**Design authority:** `design.md` Revision 5; enforced by `scripts/token-lint.mjs`

---

## Audit Health Score

| #         | Dimension         | Before    | After     | Key finding                                                        |
| --------- | ----------------- | --------- | --------- | ------------------------------------------------------------------ |
| 1         | Accessibility     | 2         | **3**     | Two rail controls were 22px — under the 24px WCAG 2.5.8 minimum    |
| 2         | Performance       | 2         | **3**     | Every rail row re-rendered on every streaming delta (now memoized) |
| 3         | Responsive Design | 2         | **3**     | Overlay rail below `lg` was sound; touch targets were the gap      |
| 4         | Theming           | 2         | **3**     | Two overlays overrode the glass tier; radius drift off §5          |
| 5         | Anti-Patterns     | 3         | **3**     | Disciplined, intentional glass — but Inter is on the DON'T list    |
| **Total** |                   | **11/20** | **15/20** | **Acceptable → Good**                                              |

Rating bands: 18–20 Excellent · **14–17 Good** · 10–13 Acceptable · 6–9 Poor · 0–5 Critical

The "Before" column is the state as found; "After" reflects the six fixes applied in  
this pass. The two dimensions that moved most are Accessibility and Responsive, both  
because of one defect: controls that only exist on a device with a mouse.

---

## Anti-Patterns Verdict

**Start here. Does this look AI-generated? No — and that is the interesting result.**

This is the rare case where the most obvious "AI tell" is present *and legitimate*.  
The interface is glassmorphic, which the skill lists as a tell — but here it is a  
documented, measured, tiered material system, not decoration applied for flavour:

- Glass is **capped by depth, not spread**. `glass` (panels) keeps its  
  `backdrop-filter`; `glass-card` deliberately does **not** ("a card's backdrop is  
  already a blurred panel; blurring again diffuses nothing and doubles the layer  
  cost"); `glass-flat` drops the blur entirely for dense rows.
- The cost was **measured, not guessed**: `index.css` records "glass-card plus glass  
  plus glass-strong came to **463**" compositing layers on `/skills`, which is why  
  `glass-card` lost its filter.
- Contrast is **measured against the worst case** (an orb behind the glass), not the  
  best: `--glass-tint` is tuned so `ink-3` lands at 5.01:1, and `scripts/contrast-glass.py`  
  exists to keep it honest.
- A **lint gate** (`token-lint.mjs`) fails the build on raw colour literals, stray  
  `backdrop-filter`, off-scale radii, and too many blurred panels per file.

That is the opposite of slop: slop is glass because glass looks expensive; this is  
glass because someone did the arithmetic. **Verdict: pass, with two honest caveats.**

| Tell                             | Present?                   | Assessment                                                                                                                     |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Glassmorphism abuse              | Yes, system-wide           | **Intentional and disciplined** — tiered, blur-capped, contrast-measured                                                       |
| Gradient text                    | No                         | —                                                                                                                              |
| Hero metrics                     | No                         | —                                                                                                                              |
| Bounce / elastic easing          | No                         | §8 forbids looping motion; reduced-motion is respected                                                                         |
| Rounded corners + generic shadow | No                         | `shadow-md`/`shadow-xl`/`shadow-float` were **removed** from overlays in favour of the glass lift                              |
| Nested cards                     | No                         | —                                                                                                                              |
| **Inter as the typeface**        | **Yes**                    | `@fontsource-variable/inter` — explicitly on the DON'T list. A real tell, but a system-wide brand choice, not a sidebar defect |
| Icon-above-heading               | No                         | —                                                                                                                              |
| Tracked caps                     | Only the rail group labels | `design.md` §4 sanctions these as structural, not content                                                                      |

---

## Executive Summary

- **Audit Health Score: 15/20 (Good)** — up from **11/20 (Acceptable)** as found.
- **Issues found: 12** — 1 P0, 2 P1, 5 P2, 4 P3. **Six fixed in this pass** (marked ✅).
- **The headline defect was a touch-device blocker.** The rail's row actions  
  (rename / archive / delete) rest at `opacity-0` and rely on `:hover` to appear.  
  A touch device never fires a real hover, so on a phone or tablet these controls  
  were present, tappable, and **invisible**. For *projects* there was no  
  alternative path at all — project rename and delete were undiscoverable.
- **The most interesting finding is architectural, not visual:** the codebase has  
  a *documented, measured* design system with a lint gate, and the rail had drifted  
  off it in three separate, invisible ways (overlay fill, radius, legacy aliases).  
  A gate that sees colour and radius cannot see *semantic* drift.
- **Recommended next steps:** raise the two 22px targets to 24px, then run  
  `/normalize` across the remaining overlay/legacy-token drift.

---

## Detailed Findings by Severity

### P0 — Blocking

#### ✅ [P0] Row actions are invisible on touch devices

- **Location:** `ChatPage.tsx` — `RailRow` (`…` trigger), project node (`+`, `…`)
- **Category:** Accessibility / Responsive
- **Impact:** On any device without a true hover pointer, the rename / archive /  
  delete menu could not be seen. It stayed in the DOM and stayed tappable, so it  
  was an invisible hit target rather than a missing one — the worst of both. For  
  projects this was the *only* route to rename or delete, so on touch the feature  
  was unreachable. On a desktop pointer this is cosmetic, which is exactly why it  
  survived review: it is a P0 that only exists on hardware the author was not using.
- **WCAG:** 2.5.8 Target Size (Minimum); 1.4.11 Non-text Contrast
- **Recommendation:** Read the pointer capability once and gate the reveal on it.
- **Fixed:** `const canHover = useHoverCapable()` in the page, threaded to `RailRow`;  
  `canHover ? "opacity-0 … group-hover:opacity-100" : "opacity-100"`. Read once, not  
  per row — fifty `matchMedia` listeners for one media query is waste.
- **Suggested command:** `/adapt`

### P1 — Major

#### ✅ [P1] Two rail controls were 22px, below the 24px AA minimum

- **Location:** `ChatPage.tsx` — project chevron (`size-3.5` + `p-1`), project `+` (`size-3.5` + `p-1`)
- **Category:** Accessibility / Responsive
- **Impact:** 14px icon + 8px padding = **22px**. WCAG 2.5.8 (AA, 2.2) requires  
  24×24. The two worst offenders are *adjacent to each other* and do different  
  things (expand vs. new chat), so a near-miss tap does the wrong thing rather than  
  nothing. Note the header buttons were already fine: `size="icon-sm"` is `size-6` =  
  exactly 24px. The row `…` was also fine (`size-4` + `p-1` = 24px). The  
  inconsistency is the tell that these two were sized by eye, not by rule.
- **WCAG:** 2.5.8 Target Size (Minimum)
- **Recommendation:** Give both a 24px box without changing the icon size, so the  
  14px glyph stays consistent with the `RailSection` chevron next to it.
- **Fixed:** both (and, for consistency, the other three row buttons) now use  
  `inline-flex size-6 items-center justify-center` instead of `p-1`, so every rail  
  action is exactly 24×24 and the glyphs stay their original size. Bumping the icon  
  to `size-4` would have hit the target too but would have made the project chevron  
  visibly heavier than the section chevrons above it.
- **Suggested command:** `/adapt`

#### ✅ [P1] Overlay fill overrode the glass tier on two menus

- **Location:** `ChatPage.tsx` (project `…` menu), `ChatPage.tsx` (`RailRow` `…` menu)
- **Category:** Theming / Anti-Pattern
- **Impact:** `DropdownMenuContent` already defaults to `glass-strong glass-sheen`.  
  Both rail menus passed `className="border-line bg-raised"` (one also `shadow-float`),  
  which replaced the translucent tint with an **opaque** fill. `design.md` §0c is  
  explicit: *"A transparent control on glass is a hole, not a control"* — and the  
  converse holds too: an opaque fill on a glass overlay severs it from the tier  
  system, kills the backdrop diffusion it was paying a compositing layer for, and  
  draws a hard `border-line` edge on top of the lit `glass-sheen` rim that is  
  supposed to be the edge cue. Every other overlay in the app (`dialog`, `popover`,  
  `sheet`, `select`, `combobox`, `command-palette`, `tooltip`, `filter-token-bar`,  
  `toaster`) uses the glass default; these two were the last outliers.
- **Recommendation:** Drop the override and let the primitive's default stand. Do  
  **not** re-add `shadow-float` — the primitive's own comment records that  
  `shadow-md` was deliberately removed because `glass-strong` already carries  
  `--glass-lift-strong`. Adding a second shadow would double the elevation cue.
- **Fixed:** both call sites now pass no `className` (the project one keeps only its  
  explanatory comment).
- **Suggested command:** `/normalize`

### P2 — Minor

#### ✅ [P2] Every rail row re-rendered on every streaming delta

- **Location:** `ChatPage.tsx` — `RailRow`, `setActive` / `selectSession` / `openSessionAction`
- **Category:** Performance
- **Impact:** `onSessionChange` arrives as an inline arrow from `App`, so it had a  
  fresh identity on every render. It was closed over directly by `setActive`, which  
  was closed over by `selectSession` and `openSessionAction`, which were passed to  
  every `RailRow` — so every stream delta invalidated the whole chain and re-rendered  
  the entire list. The rail is completely static while a response streams.  
  **Honesty note:** the cascade is provable by reading the code, but I did not  
  *measure* the frame cost, so this is a reasoned fix, not a profiled one. `memo` is  
  explicitly exempt from the "no unmeasured optimization" rule here because the  
  render cascade is established from the source, not assumed.
- **Recommendation:** Stabilize the chain, then memoize the leaf.
- **Fixed:** `onSessionChange` held in a ref (`onSessionChangeRef`) + `setActive`  
  wrapped in `useCallback([])`; `selectSession` / `openSessionAction` wrapped in  
  `useCallback`; `RailRow` wrapped in `memo` at module scope. **No custom  
  comparator** — every other prop is a primitive and `item` comes from the query  
  cache with stable identity, so the default shallow compare is exactly right and a  
  hand-written comparator would only add a way to get it wrong.
- **Suggested command:** `/optimize`

#### ✅ [P2] Radius drift off the §5 scale

- **Location:** `ChatPage.tsx` — `RailSection` trigger, `RailRow` root + body, project node row + name button
- **Category:** Theming
- **Impact:** All five used `rounded-lg` = **10px**, which is on **no role's row** in  
  the §5 scale (control 8 / card 12 / panel 16). 10px is not a considered choice  
  here; it is what `rounded-lg` happens to be, which is precisely how a corner  
  drifts without anyone deciding it should. **The lint gate cannot catch this** —  
  `RADIUS_SCALE` sanctions `rounded-lg` as part of the permitted 0.5rem ladder, so  
  the drift is legal by the letter and wrong by the table. This is the clearest  
  example of the systemic gap in *Patterns* below.
- **Recommendation:** Buttons → `rounded-control`; list rows → `rounded-card`.
- **Fixed:** section trigger → `rounded-control`; row root + body and project node  
  row + name button → `rounded-card`.
- **Suggested command:** `/normalize`


#### [P2] `InputGroup` is defined twice and used nowhere

- **Location:** `web/src/components/ui/input.tsx:9` **and** `web/src/components/ui/input-group.tsx:9`
- **Category:** Anti-Pattern (dead code / conflicting primitives)
- **Impact:** Two different components share the name `InputGroup`, each with its own  
  `InputGroupInput` / `InputGroupAddon`, and **neither has a single call site** in  
  `web/src`. Meanwhile the chat rail hand-rolls the icon-plus-input pattern that  
  `InputGroup` exists to provide — an absolutely-positioned `Search` icon at  
  `left-2.5` over a plain `Input` with `pl-7`. So the app has two unused solutions  
  and one hand-rolled one for the same problem. The practical risk is not the dead  
  code; it is that a future contributor imports the *wrong* `InputGroup` and gets a  
  visually different control with no error.
- **Recommendation:** Pick one implementation, delete the other, and migrate the  
  rail's search field onto it — or delete both and accept the hand-rolled version.  
  Either way, resolve the ambiguity before adding a third.
- **Suggested command:** `/distill`

#### [P2] 144 uses of legacy `--color-*` aliases

- **Location:** repo-wide (18 distinct aliases, 18 files)
- **Category:** Theming
- **Impact:** The lint gate reports this as a warning ("informational until phase 5"),  
  so it is a known, tracked migration rather than a defect. It matters to the rail  
  because `ChatPage.tsx:277` reads raw `var(--c-line)` / `var(--c-well)` /  
  `var(--c-ink-3)` instead of using the Tailwind classes — correct tokens, wrong  
  access path, so they bypass the `@theme inline` mapping.
- **Recommendation:** Continue the phase-5 migration; in the rail, swap raw `var()`  
  reads for the class equivalents.
- **Suggested command:** `/normalize`

#### [P2] Opaque sticky header inside the glass model-picker menu

- **Location:** `ChatPage.tsx:1306`
- **Category:** Theming / Anti-Pattern
- **Impact:** The model picker's `SelectContent` is `glass-strong`, but its sticky  
  search row is a `<div className="sticky top-0 z-10 bg-raised p-1">`. Scrolling the  
  model list slides items under an **opaque** slab inside a translucent panel — the  
  same §0c violation as the two menus above, in a third place. Out of scope for a  
  sidebar pass, but it is the same root cause and should be fixed together with it.
- **Recommendation:** Drop `bg-raised`; the sticky row can rely on the panel's own  
  tint, or take a `glass-flat`-style fill consistent with the tier.
- **Suggested command:** `/normalize`

### P3 — Polish

#### [P3] Harness footnote box uses raw `var()` and an off-scale radius

- **Location:** `ChatPage.tsx:277` — `rounded-lg border border-[var(--c-line)] bg-[var(--c-well)] …`
- **Category:** Theming
- **Impact:** A callout box with a card's shape should be `radius-card` and should  
  use the token classes, not `var()` reads plus an arbitrary-value border.
- **Suggested command:** `/normalize`

#### [P3] `DropdownMenuItem` uses `rounded-sm` (6px), not `radius-control` (8px)

- **Location:** `web/src/components/ui/dropdown-menu.tsx:78`
- **Category:** Theming
- **Impact:** §5 assigns menu items `radius-control` (8px). `rounded-sm` is stock  
  shadcn and resolves to **6px** here (`--radius-sm: 6px` in `index.css:458` — the  
  project overrides Tailwind's 4px default). This is a **shared primitive**, so  
  changing it moves every menu in the app — which is why it is P3 here and flagged  
  rather than applied. Same class of drift as the rail radius issue: sanctioned by  
  the ladder, wrong by the table. Note the ladder overlaps the semantic scale  
  (`--radius-md` is also 8px, `--radius-xl` also 16px), so `rounded-sm` is the only  
  step here that lands on no role.
- **Suggested command:** `/normalize`

#### [P3] `nav-user.tsx` uses legacy tokens and a focusable no-op item

- **Location:** `web/src/components/nav-user.tsx`
- **Category:** Theming / Accessibility
- **Impact:** Three small things. (1) `text-foreground` / `text-muted-foreground` are  
  legacy shadcn tokens, not `ink` / `ink-2` / `ink-3`. (2) The identity block is a  
  `DropdownMenuLabel` nested **inside** a `DropdownMenuItem`, which makes the whole  
  row a focusable menu item that does nothing when activated — a dead stop in the  
  keyboard tab order. (3) A `<br />` immediately before a `<div>` is invalid  
  phrasing content. Also indented with tabs while the rest of the codebase uses spaces.
- **Recommendation:** Render the identity block as a plain non-interactive header  
  (`DropdownMenuLabel` outside the item), and move the colours to `ink-*`.
- **Suggested command:** `/normalize`

#### [P3] `ChatPage` search field does not use the `InputGroup` pattern

- **Location:** `ChatPage.tsx` — rail search
- **Category:** Consistency
- **Impact:** Hand-rolled icon positioning duplicates what `InputGroup` provides,  
  including the `focus-within` ring on the shell. Currently the ring sits on the bare  
  `Input`, which also carries an inset shadow, so the focus treatment differs subtly  
  from every other field. Folded into the `InputGroup` finding above — listed  
  separately because it is the *call site* that would change.
- **Suggested command:** `/distill`

---

## Patterns & Systemic Issues

1. **A gate that sees syntax cannot see semantics.** `token-lint.mjs` is genuinely  
   good — it catches raw colours, stray blur, and off-scale radii. But it sanctions  
   `rounded-lg` (10px) and `rounded-sm` (6px) as part of the permitted ladder, so  
   **four separate off-role radii passed the gate cleanly**. The rule the codebase  
   actually wants is not "is this radius on the scale?" but "is this radius *the one  
   this role gets*?" — a mapping the lint has no way to check. The same shape applies  
   to `bg-raised` on an overlay: a legal token, in the wrong tier.
2. **`design.md` contains a live contradiction.** §0b's L4 tier table (Revision 5)  
   says overlays are `glass-strong`; §7 line 819 says "Selects and dropdowns use  
   `raised` with `shadow-float`". That is Revision-4 text that Revision 5 superseded  
   but did not delete. Every component implementation follows Rev 5, so the  
   implementations are right and the prose is stale — but anyone reading §7 first  
   will reintroduce exactly the bug fixed here. **Recommendation: reconcile §7.**
3. **`web/node_modules` is a partial install**, so nothing in the repo can currently  
   be built or visually verified on this machine. See *Verification* below.

---

## Positive Findings

Worth keeping, and worth copying elsewhere:

- **Focus is never carried by colour alone.** Every rail control pairs a  
  `focus-visible:ring-[3px] focus-visible:ring-focus/40` with the interaction; the  
  shared `Input` goes further and changes the *border* as well, because "a glow on  
  its own is a colour cue".
- **The rail's `<h1>` is correct, not a duplicate.** The chat page deliberately  
  renders no `PageHeader` ("the board and chat start flush"), so the rail header is  
  the page's only `<h1>` — and it is inside an `<aside aria-label="Chats">`, so the  
  landmark and the heading agree.
- **ARIA state is complete on the rail:** `aria-current="page"` on the active row,  
  `aria-expanded` + a label that flips between "Expand/Collapse X" on the chevron,  
  `aria-pressed` on the archive toggle, and an `aria-label` on every icon-only button.
- **Empty states are educational, not decorative** — "No chats yet" is followed by  
  the next step ("Type in the composer below to start one, or create a project to  
  group your work"), and a project with no chats offers a "Start one" action rather  
  than a dead end. This is the DO in the skill's own interaction table.
- **Glass cost was measured and reduced** rather than asserted — 463 compositing  
  layers found on `/skills`, then `glass-card` was de-blurred with the number  
  recorded in the source.
- **`useHoverCapable` already existed** as a documented hook; the fix used the  
  house solution instead of inventing a second one.

---

## Recommended Actions

The P0 and both P1s are already applied. What remains:

1. **[P2] `/normalize`** — Sweep the remaining semantic drift: the sticky  
   `bg-raised` row inside the glass model picker (`ChatPage.tsx:1306`), the  
   `nav-user.tsx` legacy tokens, and `rounded-sm` → `radius-control` on  
   `DropdownMenuItem` (a shared primitive — decide deliberately, it moves every menu).
2. **[P2] `/distill`** — Resolve the duplicated `InputGroup`: keep one, delete the  
   other, and move the rail's search field onto it. Two unused implementations of  
   one component is a trap for the next contributor.
3. **[P3] `/polish`** — Reconcile `design.md` §7's stale `raised` + `shadow-float`  
   guidance with Revision 5's `glass-strong` tier table, so the contradiction cannot  
   be reintroduced.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/audit` after fixes to see your score improve.

---

## Verification

`web/node_modules` is a **partial** install — `vitest`, `@vitejs/plugin-react` and  
`@tailwindcss/vite` are all missing, so neither the dev server nor the Playwright  
suite could run here. The changes were therefore verified by A/B against the same  
environment instead:

| Gate                                       | Before          | After           | Result                               |
| ------------------------------------------ | --------------- | --------------- | ------------------------------------ |
| `tsc -b` error count                       | 75              | 75              | identical                            |
| `tsc -b` error **set** (path+code, sorted) | —               | —               | byte-identical — **zero new errors** |
| `token-lint.mjs` full output               | 14 err / 4 warn | 14 err / 4 warn | byte-identical — **no new drift**    |
| `token-lint` findings in `ChatPage.tsx`    | 0               | 0               | clean                                |

All 75 `tsc` errors are pre-existing `Cannot find module` failures from the missing  
packages — none are in `ChatPage.tsx`. Both comparisons were run with `git stash` on  
the same `node_modules`, so the counts are directly comparable.

**Visual baselines:** `web/e2e/__screenshots__/visual.spec.ts-snapshots/` has committed  
`Chat-light-*` / `Chat-dark-*` snapshots. The rail header text, the project row, the  
row radii and the two menu surfaces all changed, so those baselines **will** diff on  
the next `pnpm verify:ui`. Expected, not a regression — review and re-baseline  
deliberately. CI is unaffected (`.github/workflows/ci.yml` runs only `pnpm build` +  
`pnpm test`).
