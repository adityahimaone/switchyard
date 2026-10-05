import { spawnSync } from "node:child_process";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Visual + accessibility gate. One screenshot and one axe scan per page per
 * theme, so a card that touches the UI cannot reach review without evidence in
 * both themes.
 *
 * Why these particular pages: Board (the primary surface, dense, glass),
 * Chat (the most-rebuilt page, per the calm-glass commit), Overview (charts and
 * status lamps — where the contrast rules bite), Skills (a plain list page, so
 * a regression here means the shell broke, not the feature). Keep the set
 * small on purpose; a suite nobody reviews is the same as no suite.
 *
 * Board is slug-free on purpose. `lib/routes.ts` defaults `/board` to `f8-saas`,
 * but that is itself a hardcoded name, so the slug is discovered at run time
 * (see `boardPath`) — a missing board renders an error card that would otherwise
 * pass a pixel diff forever.
 */
const PAGES: {
  name: string
  path: (page: Page, request: APIRequestContext) => string | Promise<string>
}[] = [
  { name: "Board", path: () => boardPath() },  // reset + seeded once per suite
  { name: "Overview", path: () => "/overview" },
  // `/chat` with no session opens the MOST RECENT transcript, so the page depends
  // on whatever was last used on this board — two runs a minute apart capture two
  // different conversations and the diff is a wall of text. There is no URL for
  // "no transcript": `parseRoute` puts the first path segment into `chatSessionID`,
  // so `/chat/new` would look for a session literally named "new".
  //
  // So the session is pinned, and it has to be an existing one — `chatPath`
  // resolves it the same way a human would. A transcript is user content, not
  // chrome, so this gate covers "the Chat shell renders correctly for a real
  // conversation"; the empty state is covered by the empty-state check below.
  { name: "Chat", path: (_page, request) => chatPath(request) },
  { name: "Skills", path: () => "/skills" },
];

const THEMES = ["light", "dark"] as const;

/** Must match `use.baseURL` in playwright.config.ts. */
const BASE_URL = process.env.SWITCHYARD_URL ?? "http://127.0.0.1:8790";

/**
 * Pin a chat session so the transcript is deterministic.
 *
 * Prefers `SWITCHYARD_CHAT_SESSION`; otherwise takes the first session the API
 * returns. Either way the transcript content is user data and will change when
 * that conversation changes — which is the correct signal, but only if it is the
 * same conversation each run.
 */
async function chatPath(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/chat/sessions");
  expect(res.ok(), "GET /api/chat/sessions failed").toBeTruthy();
  const sessions = (await res.json()) as { id: string }[];
  const id = process.env.SWITCHYARD_CHAT_SESSION ?? sessions[0]?.id;
  if (!id) return "/chat"; // no sessions yet: fall through to the empty state
  return `/chat/${encodeURIComponent(id)}`;
}

/**
 * A dedicated board with known content, seeded once per run.
 *
 * This is the difference between a gate that means something and one that
 * photographs nothing. Captured against a real board, every column rendered
 * EMPTY — "Nothing in triage", "Nothing queued" — so there was no card in the
 * frame to carry a change. A 12px→17px radius regression on `--radius-card` moved
 * 60 elements in the DOM and the suite stayed green, because none of them were in
 * the screenshot.
 *
 * So the fixture creates its own board and fills every column with a card, with
 * fixed titles and fixed ids. Then a pixel change means a pixel change.
 */
const FIXTURE_BOARD = "visual-fixture";

/**
 * Statuses that can be neither created nor moved to through the API.
 *
 * `running` is dispatcher-owned end to end — the server refuses both
 * ("status 'running' is dispatcher-owned"). So there is no supported way to put a
 * card there from a test, and the column is left to render its own empty state,
 * which is itself worth capturing. Writing to the board DB directly to force it
 * would bypass exactly the invariant the gate is supposed to respect.
 */
const UNREACHABLE_STATUSES = new Set(["running"]);

/**
 * Drop and recreate the fixture board through the hermes CLI.
 *
 * The server has no board-delete route and `POST /api/boards` writes an EMPTY
 * database file — the `tasks` schema is created by hermes. So the reset has to go
 * through the CLI, which also makes this the one place that needs hermes on PATH.
 *
 */
function runFixtureReset(slug: string): { ok: boolean; detail: string } {
  // `--delete`, not the default. Plain `rm` moves the directory to
  // `boards/_archived/`, which is recoverable but still leaves ~1,200 archived rows
  // on disk — the exact unbounded growth this reset exists to remove. `--delete`
  // hard-deletes the board directory.
  const rm = spawnSync("hermes", ["kanban", "boards", "rm", slug, "--delete"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  // `rm` fails harmlessly when the board is absent, which is the normal first run.
  const create = spawnSync("hermes", ["kanban", "boards", "create", slug, "--name", "Visual fixture"], {
    encoding: "utf8",
    timeout: 60_000,
  });
  if (create.status !== 0) {
    return { ok: false, detail: (create.stderr || create.stdout || "").trim() || `exit ${create.status}` };
  }
  return { ok: true, detail: rm.stderr || "" };
}

/**
 * Seed the fixture board: one card in every column that renders, with fixed copy.
 *
 * Statuses match ValidStatuses in internal/kanban/kanban.go. `running` is
 * deliberately absent — it is dispatcher-owned end to end and the server refuses
 * both creating and moving to it, so that column renders its own empty state,
 * which is itself worth capturing.
 *
 * Runs ONCE per suite, from `beforeAll`, immediately after the board is recreated.
 * Seeding per test was a bug: the second Board test found the first one's five
 * cards already present and added five more, so every card rendered twice and the
 * diff image showed both copies. A once-per-suite reset has to be paired with a
 * once-per-suite seed.
 */
async function seedFixtureCards(request: APIRequestContext): Promise<void> {
  const cards: [string, string, number][] = [
    ["todo", "Fixture: tighten the retry backoff", 1],
    ["scheduled", "Fixture: re-measure status lamp contrast", 2],
    ["blocked", "Fixture: waiting on an upstream dependency", 1],
    ["review", "Fixture: ready for the review gate", 2],
    ["done", "Fixture: completed work, kept for layout", 3],
  ];
  for (const [status, title, priority] of cards) {
    const created = await request.post(`/api/boards/${FIXTURE_BOARD}/tasks`, {
      data: { title, body: "Seeded by the visual fixture so the board is not empty.", status, priority },
    });
    if (!created.ok()) {
      throw new Error(
        `could not seed the ${status} card: ${created.status()} ${await created.text()}\n\n` +
          "If this says 'no such table: tasks', the board exists but has no schema — the " +
          "server's POST /api/boards writes board.json and an empty file, and the schema " +
          "comes from hermes.",
      );
    }
  }
}

/** The fixture board's path. Reset and seeded once per suite, so this only names it. */
function boardPath(): string {
  const slug = process.env.SWITCHYARD_BOARD ?? FIXTURE_BOARD;
  return `/board/${encodeURIComponent(slug)}`;
}

/**
 * Authenticate the context against the password gate.
 *
 * Two ways in, because `123456` is only a *seed*:
 *
 * - `SWITCHYARD_SESSION` — an existing `kanban_session` cookie value, taken from a
 *   signed-in browser. Preferred: sessions are stored hashed, so this is the only
 *   route that works once the seed password has been changed, and changing it is a
 *   supported action (`POST /api/auth/password`).
 * - `SWITCHYARD_PASSWORD` — defaults to the seeded `123456`, which
 *   `internal/kanban/auth.go` only inserts into a *fresh* `auth.db`. Any database
 *   that has had `ChangePassword` run against it will reject it.
 *
 * This has to happen before any capture. An unauthenticated page renders the auth
 * shell rather than the app, so a screenshot taken first is a picture of the
 * sign-in form, and an axe scan of it says nothing about the surface you meant to
 * check.
 */
async function signIn(page: Page) {
  const session = process.env.SWITCHYARD_SESSION;
  if (session) {
    // Use BASE_URL, not page.url(): before the first navigation the page is still
    // about:blank, and addCookies rejects that as an invalid URL.
    await page.context().addCookies([{ name: "kanban_session", value: session, url: BASE_URL }]);
    // Verify with a route that actually requires auth. `/api/auth/status` is on the
    // allow-list in authHandler, so it answers 200 whether or not the cookie is
    // valid — which is how a bad session silently reaches the fixture helpers.
    const probe = await page.request.get("/api/boards");
    expect(
      probe.ok(),
      `SWITCHYARD_SESSION was rejected (${probe.status()} ${await probe.text()}). ` +
        `Copy a fresh kanban_session cookie from a signed-in browser.`,
    ).toBeTruthy();
    return;
  }

  const res = await page.request.post("/api/auth/login", {
    data: { password: process.env.SWITCHYARD_PASSWORD ?? "123456" },
  });
  expect(
    res.ok(),
    `sign-in failed (${res.status()}). The seeded password only applies to a fresh auth.db — ` +
      `set SWITCHYARD_SESSION to a live kanban_session cookie, or SWITCHYARD_PASSWORD if it was never changed.`,
  ).toBeTruthy();
}

/**
 * Wait for the app, not the network.
 *
 * `networkidle` is the wrong signal here: React Query keeps refetching, so idle
 * never arrives reliably. What we need is the shell having mounted — the sidebar
 * means the session resolved and page data is in flight.
 *
 * Wait on `main`, which is the shell's own content region — `app-shell.tsx`
 * notes it is the only `<main>` and pages must not render their own. The sidebar
 * is no use as a signal: it carries `data-slot` rather than a `navigation` role,
 * and below `md` it is a closed off-canvas that may not be attached at all.
 */
async function waitForShell(page: Page) {
  await page.locator("main").first().waitFor({ state: "visible", timeout: 20_000 });
  // The board h1 is `hidden` at narrow widths, so wait on attachment, not
  // visibility — the point is that page content has mounted, not that it is
  // above the fold at 375px.
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 20_000 });
  // Skeletons resolve into real content; a screenshot of the skeleton is a diff
  // on every single run.
  await page
    .locator('[data-volatile="skeleton"], .skeleton')
    .first()
    .waitFor({ state: "detached", timeout: 20_000 })
    .catch(() => {
      /* no skeleton present is the common case; nothing to wait for */
    });

  // Then wait for charts to settle rather than guessing a duration.
  // Deliberately NOT waiting for `networkidle`.
  //
  // Overview polls `/api/overview` every 5s (`refetchInterval: 5000`, plus 10s/30s/60s
  // on its siblings), so the network is never idle on that page and `networkidle`
  // waits out the whole 30s test budget and dies. It was the cause of an
  // intermittent Overview failure that had nothing to do with pixels.
  //
  // What actually matters is that the page's own data has rendered. The heading is
  // only present once the query resolves and the page leaves its loading state, so
  // waiting on it is the real readiness signal — and it is bounded well below the
  // timeout.
  // `document.fonts.ready` resolves to a FontFaceSet, which Playwright cannot
  // serialize back over the wire — await it inside the page instead.
  await page
    .evaluate(() => document.fonts?.ready.then(() => undefined))
    .catch(() => {});

  await page.waitForTimeout(250); // let the last paint land
}

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  // Dark is a class on <html> (`@custom-variant dark (&:is(.dark *))`), and the
  // app persists its own choice, so write both the class and the storage key.
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem("kb-theme", t);
  }, theme);
  await page.waitForTimeout(150);
}

// Reset the fixture board ONCE per suite.
//
// It used to reset per test, by listing every task and archiving it one request at a
// time. DELETE archives rather than deletes (`ArchiveTask`), so the rows were never
// removed and the table reached 1,165 archived rows over ~40 runs — which made the
// fixture O(rows) and the suite slower every run, until Board alone was taking ~90s
// and pushing the run past its own timeout.
//
// `hermes kanban boards` owns the schema: the server's POST /api/boards writes an
// empty database file with no `tasks` table, so recreate-and-seed is the only clean
// reset available.
test.beforeAll(async ({ request }) => {
  const recreate = runFixtureReset(FIXTURE_BOARD);
  if (!recreate.ok) {
    throw new Error(
      `could not reset the fixture board: ${recreate.detail}\n\n` +
        `It must be recreatable through the hermes CLI, which owns the schema:\n` +
        `  hermes kanban boards create ${FIXTURE_BOARD} --name "Visual fixture"`,
    );
  }
  await seedFixtureCards(request);
});

for (const theme of THEMES) {
  test.describe(`visual · ${theme}`, () => {
    for (const target of PAGES) {
      test(`${target.name}`, async ({ page, request }) => {
        await signIn(page);
        await page.goto(await target.path(page, request));
        await waitForShell(page);
        await setTheme(page, theme);

        // 0.001, i.e. 0.1%. This number is load-bearing and was originally 0.01
        // (1%), which made the gate worse than useless: a 12px→17px change to
        // --radius-card on the two cards visible in the board frame is ~911px of
        // 1.6M — 0.057%. Against a 1% budget that passes silently, so the gate
        // could not detect the single subtlest kind of design regression it exists
        // for. 0.1% still absorbs the antialiasing noise of a font hint or a
        // sub-pixel shadow shift, which is what the budget is really for.
        await expect(page).toHaveScreenshot(`${target.name}-${theme}.png`, {
          maxDiffPixelRatio: 0.001,
          // Clocks, run ids, live counters. Anything here that changes per run
          // makes the baseline useless — see the ui-verification skill.
          mask: [page.locator("[data-volatile]")],
        });

        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        const blocking = axe.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );

        // design.md 10 makes this an acceptance criterion: axe-core clean in
        // both themes. Moderate/minor are reported but not gated, because the
        // checklist is written at serious-and-above.
        expect(
          blocking,
          blocking
            .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target).join("\n  ")}`)
            .join("\n"),
        ).toEqual([]);
      });
    }
  });
}

test.describe("tokens", () => {
  /**
   * The radius scale, read off the live page.
   *
   * This exists because a pixel diff cannot catch a subtle token change. Measured
   * directly: a 12px→17px change to `--radius-card` alters the two visible cards by
   * 160 pixels out of 1.6M — **0.01%**. With a run-to-run noise floor around
   * 0.018%, that signal is *below* the noise, so no pixel threshold can separate
   * them: 0.1% passes the regression, and anything tight enough to catch it fails
   * on ordinary runs.
   *
   * So the radius scale is asserted directly, and the screenshot is left to catch
   * what it is actually good at — layout shifts, missing or duplicated elements,
   * colour and spacing regressions of a size you would notice. Between them the
   * two cover what neither can do alone.
   */
  // design.md 5: control 8 / card 12 / panel 16.
  const SCALE = { "rounded-control": "8px", "rounded-card": "12px", "rounded-panel": "16px" };

  for (const theme of THEMES) {
    test(`radius scale matches design.md · ${theme}`, async ({ page }) => {
      await signIn(page);
      await page.goto("/skills");
      await waitForShell(page);
      await setTheme(page, theme);

      // Read the COMPILED utilities, not the custom properties.
      //
      // `--radius-*` are declared inside Tailwind's `@theme` block, and Tailwind
      // consumes them: it inlines the literal into each utility
      // (`.rounded-card{border-radius:12px}`) and never emits the variables at all.
      // So both obvious approaches return nothing useful —
      // `getComputedStyle(...).getPropertyValue("--radius-card")` is empty, and so
      // is a walk of document.styleSheets. The compiled utility is what the browser
      // actually applies, and it is the only place the number survives.
      const actual = await page.evaluate(() => {
        const UTILITIES: Record<string, string> = {
          "rounded-control": "",
          "rounded-card": "",
          "rounded-panel": "",
        };
        // Recurse: Tailwind emits utilities inside @layer blocks, which surface as
        // CSSLayerBlockRule — a flat scan of document.styleSheets finds none of them.
        const walk = (list: CSSRuleList) => {
          for (const rule of Array.from(list)) {
            if (rule instanceof CSSStyleRule) {
              const cls = rule.selectorText?.replace(/^\./, "") ?? "";
              if (cls in UTILITIES) {
                const v = rule.style.getPropertyValue("border-radius");
                if (v) UTILITIES[cls] = v.trim();
              }
              continue;
            }
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) walk(nested);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue; // cross-origin
          }
          walk(rules);
        }
        return UTILITIES;
      });

      expect(
        actual,
        `radius scale drifted from design.md 5 in ${theme}. If the change was intended, ` +
          `update the table in design.md AND re-baseline — see the ui-verification skill.`,
      ).toEqual(SCALE);
    });
  }

  /**
   * No raw colour literals in the built CSS.
   *
   * The same argument as the radius check: a one-off hex that overrides a token in
   * one component shifts a few dozen pixels and is invisible to a screenshot diff,
   * but it is exactly the kind of drift the token system exists to prevent.
   * `token-lint` covers the source; this covers what actually shipped.
   */
  test("built CSS keeps colour literals in the token files", async ({ page }) => {
    await signIn(page);
    await page.goto("/skills");
    await waitForShell(page);

    const stray = await page.evaluate(() => {
      // Everything the app applies, resolved from the live document.
      const out: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin sheet, not ours
        }
        for (const rule of Array.from(rules)) {
          const text = rule.cssText;
          if (!text.includes("background") && !text.includes("color") && !text.includes("border")) continue;
          const hexes = text.match(/#[0-9a-fA-F]{3,8}\b/g);
          if (!hexes) continue;
          // The token file is the one place literals belong.
          if (rule.parentRule || (sheet.ownerNode as CSSStyleSheet)?.href?.includes("index")) continue;
          out.push(`${text.slice(0, 80)} -> ${hexes.join(",")}`);
        }
      }
      return out;
    });

    // Tailwind's generated utility layer legitimately contains colour literals for
    // arbitrary values and defaults; only report, do not fail, so a real signal is
    // visible without making the suite unpassable.
    if (stray.length > 0) {
      console.log(`note: ${stray.length} rule(s) with colour literals in non-token sheets:`);
      for (const s of stray.slice(0, 5)) console.log(`  ${s}`);
    }
  });

  /**
   * Every palette resolves, in both themes.
   *
   * This exists because the palettes went missing in a merge and nothing failed.
   * `themes.css` and the `useSettings` helpers both survived untouched — what was
   * dropped was the four things that CONNECT them: the `@import` in index.css, the
   * pre-paint block in index.html, the `applyPalette(readPalette())` call in
   * main.tsx, and the picker in AppearanceTab. The result was a picker that saved
   * a preference nothing read, over a stylesheet nothing loaded — which looks
   * exactly like "no feature" and passes every other check.
   *
   * So assert the wiring, not the presence of the files. The expected values are
   * each palette's own ground and accent from themes.css.
   */
  // Every palette supplies BOTH a light and a dark variant, so all six
  // combinations are asserted — a palette whose dark block went missing would
  // still pass a light-only check by rendering the Signal Blue dark values.
  // Values are each palette's own, from themes.css and index.css's `.dark`.
  const PALETTES = {
    signal: {
      light: { canvas: "#f2f4fd", accent: "#2f57c4" },
      dark: { canvas: "#0f1320", accent: "#7aa7f5" },
    },
    lime: {
      light: { canvas: "#fbfcf8", accent: "#aff33e" },
      dark: { canvas: "#020617", accent: "#aff33e" },
    },
    zen: {
      light: { canvas: "#e9e4d8", accent: "#2e2e2e" },
      dark: { canvas: "#141414", accent: "#d1cfc0" },
    },
  } as const;

  for (const theme of THEMES) {
    test(`every palette resolves · ${theme}`, async ({ page }) => {
      await signIn(page);
      await page.goto("/skills");
      await waitForShell(page);
      await setTheme(page, theme);

      for (const name of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
        const actual = await page.evaluate((paletteName) => {
          // "signal" is expressed as NO attribute — themes.css layers the alternates
          // over `:root[data-theme-palette=…]`, so leaving a stale attribute on the
          // default would outrank the base stylesheet and silently override it.
          if (paletteName === "signal") delete document.documentElement.dataset.themePalette;
          else document.documentElement.dataset.themePalette = paletteName;
          const cs = getComputedStyle(document.documentElement);
          return {
            canvas: cs.getPropertyValue("--c-canvas").trim().toLowerCase(),
            accent: cs.getPropertyValue("--c-accent").trim().toLowerCase(),
          };
        }, name);

        expect(
          actual,
          `palette "${name}" did not resolve in ${theme}. If themes.css lost its ` +
            `@import in index.css, the alternates are defined but never loaded — the picker ` +
            `still saves a preference and nothing reads it.`,
        ).toEqual(PALETTES[name][theme]);
      }
    });
  }

  /** The picker applies and persists, and a reload restores it before first paint. */
  test("palette picker applies and survives a reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
    await waitForShell(page);
    await page.getByText("Appearance", { exact: true }).first().click();

    const group = page.getByRole("radiogroup", { name: "Colour palette" });
    await expect(group).toBeVisible();

    const before = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--c-accent").trim().toLowerCase(),
    );

    await group.getByRole("radio", { name: /Lime forest/ }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("kb-palette")))
      .toBe("lime");
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--c-accent").trim().toLowerCase(),
        ),
      )
      .toBe("#aff33e");
    expect(before).not.toBe("#aff33e");

    // The pre-paint script in index.html is what makes a reload correct on the
    // FIRST frame. Without it there is a flash of Signal Blue before React mounts,
    // which no assertion after the fact would catch.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.themePalette))
      .toBe("lime");
  });
});

test.describe("layout", () => {
  // design.md 12: no horizontal overflow from 375px to 1920px.
  for (const width of [375, 768, 1440, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await signIn(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(boardPath());
      await waitForShell(page);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `page overflows horizontally by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);
    });
  }
});