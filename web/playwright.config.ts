import { defineConfig, devices } from "@playwright/test";

/**
 * Visual + accessibility gate for the Switchyard web app.
 *
 * Two rules that are not negotiable, both learned the hard way:
 *
 * 1. `baseURL` points at the GO SERVER (:8790), not `vite preview` or a static
 *    serve of `dist/`. The app is behind a password gate and every page fetches
 *    `/api/*`. Served statically, those calls are answered with `index.html`,
 *    the shell never mounts, and the screenshot is a blank page — which reads
 *    exactly like a passing test. See `.commandcode/taste/tooling/taste.md`.
 *
 * 2. Pin the platform. Fonts and anti-aliasing differ per OS, so baselines
 *    captured on macOS will not match on Windows. Run this on the Mac node only
 *    and never on Windows; `deviceScaleFactor` and the project name are part of
 *    the baseline path for the same reason.
 *
 * Dark mode is a CLASS (`@custom-variant dark (&:is(.dark *))` in index.css),
 * not `prefers-color-scheme`, so the theme is toggled in the spec rather than
 * through `colorScheme`.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  snapshotDir: "./e2e/__screenshots__",
  // `*.test.ts` under e2e/ is vitest-only helper coverage
  // (the design-compare pixel math); Playwright's default
  // discovery matches it too and fails on the vitest import.
  testIgnore: /\.test\.ts$/,
  fullyParallel: false,
  workers: 1,
  // 30s is Playwright's default and it is not enough here: each visual test
  // signs in, navigates, waits for live data, then runs a full-page screenshot
  // AND a full axe scan. On a cold start that legitimately runs long, and hitting
  // the budget produced a "Test timeout" that looked like a pixel failure but had
  // no diff at all.
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["json", { outputFile: "e2e/.artifacts/report.json" }]] : [["line"]],

  // `animations: "disabled"` is set per screenshot; this covers CSS transitions
  // that would otherwise still be mid-flight when the shot is taken.
  // `animations: "disabled"` also covers CSS transitions that would otherwise be
  // mid-flight when the shot is taken. JS-driven animation is handled separately by
  // `reducedMotion` below, which `expect`'s flag does not reach.
  use: {
    baseURL: process.env.SWITCHYARD_URL ?? "http://127.0.0.1:8790",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Seeding and the password gate both need a real navigation to settle.
    actionTimeout: 15_000,

    // Reduced motion, set here so no test can forget it and no test can forget it
    // too late. It has to be in place before the first paint.
    //
    // `animations: "disabled"` in `expect` only covers CSS animations and
    // transitions. It does not reach animation driven from JS, and Overview's
    // heatmap is drawn by `HeatmapChart animate`, which runs a staged reveal over
    // several hundred milliseconds — captured mid-reveal, cells land in different
    // places every run and the baseline is worthless. `heatmap-chart.tsx` already
    // honours `prefers-reduced-motion` (`animateCells = animate && !reducedMotion`),
    // so this takes the app's own supported path to a stable frame.
    reducedMotion: "reduce",

    // Send the session cookie on EVERY request, not just page navigations.
    //
    // `page.request` and the `beforeAll` request context both go through here, and
    // every /api/* route is behind authHandler. Setting a cookie on the context is
    // not enough for those — they use this header set instead. Without it the
    // fixture's seed POSTs come back 401 and the board silently renders empty,
    // which looks like a passing capture of nothing.
    ...(process.env.SWITCHYARD_SESSION
      ? { extraHTTPHeaders: { Cookie: `kanban_session=${process.env.SWITCHYARD_SESSION}` } }
      : {}),
  },

  projects: [
    {
      name: "mac-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
        // 1, not 2, and this is load-bearing. The committed baselines are
        // 1600x1000 — the same size as docs/screenshots/ — so a factor of 2
        // produced 3200x2000 captures that Playwright RESIZED to 1600x1000 before
        // comparing. That halves the effective resolution of every comparison
        // without saying so, and it is how a 12px→17px --radius-card change went
        // undetected for several runs.
        //
        // If you want retina-fidelity baselines, raise this to 2 AND regenerate
        // every baseline, so capture size and baseline size agree.
        deviceScaleFactor: 1,
      },
    },
  ],
});