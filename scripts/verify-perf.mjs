// Lighthouse budgets against the production build (web/dist).
//
// Run: pnpm verify:perf   (from web/) — the script builds first,
// then asserts. Deliberately NOT part of verify:fast or verify:ui:
// a Lighthouse run takes a minute and needs a Chrome binary, which
// the fast gates must not depend on.
//
// Two steps, both required: `lhci collect` measures, `lhci assert`
// checks the budgets. Assert alone is a false green — with no
// collected results it reports "0 URL(s), 0 total run(s)" and
// passes. That exact failure mode is why collect runs here.
//
// The budgets in web/lighthouserc.json are the measured 2026-10-05
// ceilings, not targets — the gate fails on REGRESSION from today's
// numbers (a slow VPS is the reference machine, so the ceilings carry
// headroom for run-to-run variance). Tightening a budget is
// deliberate work: measure first, then lower the number with the
// change that bought the improvement.
//
// Lighthouse needs a Chrome binary. Without a system Chrome it falls
// back to the Playwright chromium the visual suite already downloads,
// so the two suites share one browser install.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const WEB = new URL("../web/", import.meta.url).pathname;
const lhci = join(WEB, "node_modules", ".bin", "lhci");

function findPlaywrightChrome() {
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  const versions = readdirSync(cache)
    .filter((d) => d.startsWith("chromium-") && !d.includes("headless_shell"))
    .sort()
    .reverse();
  for (const v of versions) {
    // Playwright moved from chrome-linux/ to chrome-linux64/.
    for (const dir of ["chrome-linux64", "chrome-linux"]) {
      const chrome = join(cache, v, dir, "chrome");
      if (existsSync(chrome)) return chrome;
    }
  }
  return null;
}

const chrome = process.env.CHROME_PATH || findPlaywrightChrome();
if (!chrome) {
  console.error(
    "verify:perf: no Chrome binary found. Set CHROME_PATH, or install the one the visual suite uses:",
    "\n    pnpm exec playwright install chromium"
  );
  process.exit(1);
}
process.env.CHROME_PATH = chrome;

for (const step of ["collect", "assert"]) {
  try {
    execFileSync(lhci, [step, "--config=lighthouserc.json"], { cwd: WEB, stdio: "inherit" });
  } catch {
    console.error(`verify:perf: lhci ${step} failed (see the report above)`);
    process.exit(1);
  }
}
console.log("verify:perf: all Lighthouse budgets hold");
