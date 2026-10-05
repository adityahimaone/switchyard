import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import {
  DesignSizeMismatch,
  compareScreenshots,
  loadSurfaces,
  type DesignSurface,
} from "./design-compare";

/**
 * Design-reference compare — the design loop's other half.
 *
 * When a surface has a committed pen.dev export (design/manifest.json),
 * render it and assert the pixels are CLOSE to the mock. This is
 * deliberately a reference, not a pixel lock: the export is an
 * AI-generated mock and the implementation is real, so the budget
 * is an order of magnitude looser than the visual suite's 0.1%.
 * What it catches is "the implementation drifted from the design
 * the card asked for", not "one radius changed by 5px".
 *
 * A surface with no export never runs pen and never runs here —
 * a card without design_source pays nothing.
 */

/** design/ lives at the repo root, two levels above this spec. */
const DESIGN_DIR = fileURLToPath(new URL("../../design", import.meta.url));

/** Must match use.baseURL in playwright.config.ts. */
const BASE_URL = process.env.SWITCHYARD_URL ?? "http://127.0.0.1:8790";

/** The drift budget. A reference check, not a lock. */
const MAX_DIFF_RATIO = 0.1;

function loadManifestSurfaces(): DesignSurface[] {
  const manifest = path.join(DESIGN_DIR, "manifest.json");
  if (!existsSync(manifest)) return [];
  return loadSurfaces(readFileSync(manifest, "utf8"));
}

const surfaces = loadManifestSurfaces();

// Same contract as visual.spec.ts: an unauthenticated page is the
// sign-in form, and a compare against it would be a picture of the
// wrong surface that still passes a loose threshold.
async function signIn(page: Page) {
  const session = process.env.SWITCHYARD_SESSION;
  if (session) {
    await page.context().addCookies([{ name: "kanban_session", value: session, url: BASE_URL }]);
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

// Same readiness signal as visual.spec.ts: the shell mounted, skeletons
// resolved, fonts loaded. A compare taken mid-skeleton diffs every run.
async function waitForShell(page: Page) {
  await page.locator("main").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 20_000 });
  await page
    .locator('[data-volatile="skeleton"], .skeleton')
    .first()
    .waitFor({ state: "detached", timeout: 20_000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts?.ready.then(() => undefined)).catch(() => {});
  await page.waitForTimeout(250);
}

test.describe("design reference", () => {
  test.skip(surfaces.length === 0, "design/manifest.json has no surfaces — no committed design exports yet");

  for (const surface of surfaces) {
    test(`surface ${surface.name} is close to its design export`, async ({ page }) => {
      const exportPath = path.join(DESIGN_DIR, surface.export);
      test.skip(!existsSync(exportPath), `no export committed for ${surface.name}: ${surface.export}`);

      const viewport = surface.viewport ?? { width: 1600, height: 1000 };
      await page.setViewportSize(viewport);
      await signIn(page);
      await page.goto(surface.route);
      await waitForShell(page);

      // Dark is a class on <html>, and the app persists its own choice.
      const theme = surface.theme ?? "light";
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
        localStorage.setItem("kb-theme", t);
      }, theme);
      await page.waitForTimeout(150);

      // Live counters and clocks would diff every run for no signal.
      const actual = await page.screenshot({
        animations: "disabled",
        mask: [page.locator("[data-volatile]")],
      });
      const expected = readFileSync(exportPath);

      let result;
      try {
        result = compareScreenshots(actual, expected);
      } catch (err) {
        if (err instanceof DesignSizeMismatch) {
          throw new Error(`${surface.name}: ${err.message}`);
        }
        throw err;
      }

      if (result.ratio > MAX_DIFF_RATIO) {
        // The diff image is the fastest way to see WHERE the
        // implementation drifted from the mock.
        const artifact = path.join(test.info().outputDir, `${surface.name}.diff.png`);
        mkdirSync(path.dirname(artifact), { recursive: true });
        writeFileSync(artifact, result.diffImage);
      }

      expect(
        result.ratio,
        `${surface.name} drifted from its design export: ${result.diffPixels} of ` +
          `${result.totalPixels} pixels (${(result.ratio * 100).toFixed(2)}%, budget ` +
          `${(MAX_DIFF_RATIO * 100).toFixed(0)}%). Diff image: ` +
          `${path.join(test.info().outputDir, `${surface.name}.diff.png`)}. A drift this large ` +
          `is either a real regression or an outdated mock — if the design changed, ` +
          `re-export and commit the new PNG.`,
      ).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    });
  }
});
