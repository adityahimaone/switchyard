// Report design-token drift in web/src.
//
// Run: node scripts/token-lint.mjs   (from web/, or `node ../scripts/token-lint.mjs`)
//
// This exists because `tsc -b`, `vitest` and the Vite build are all blind to it.
// None of them resolve a CSS custom property, compare a colour against a ratio, or
// notice that a radius sits off the scale. The only gate that sees these is a
// rendered page, which is why the checks below exist — and why they are cheap,
// deterministic and model-free.
//
// Scope note: every rule here is written against design.md Revision 4. That file
// is authoritative. redesign.md is superseded and disagrees with it on the default
// theme, blur radius and corner radius; if you are reading rules from that file
// instead of this one, that is the bug.
//
// Exit code 0 means clean. Warnings (rule 4) print but do not fail the gate,
// because the legacy --color-* aliases are still load-bearing until phase 5.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = new URL("../web/src/", import.meta.url).pathname;

/* ---------------------------------------------------------------------------
 * Allow-lists.
 *
 * Every entry is a colour or radius that is deliberately NOT a token, with the
 * reason it is legitimate. This table is the difference between a gate that
 * reports drift and a gate that is red on day one and gets ignored. If you need
 * to add an entry, the reason is the part that matters — a bare allowance with
 * no reason is how a gate decays into noise.
 * ------------------------------------------------------------------------- */

// Rule 1. Data-visualisation palettes are categorical, not semantic: they encode
// "which pipeline stage", not "what does this mean". They cannot come from the
// surface ramp without becoming unreadable.
const CHART_PALETTE_FILES = [
  "features/flow/layout.ts", // per-node hue for the flow map
  "features/flow/TravelingDot.tsx", // travelling dot glint over that map
  "components/charts/notch-gauge-shared.ts",
  "components/charts/heatmap/heatmap-colors.ts",
  "components/charts/pattern-preset.tsx",
  "components/charts/funnel-chart.tsx",
];

// A hex used as the JS-side fallback of a token read. `useTokenColor("--c-accent",
// "#2f57c4")` — the hex here IS the token's value, restated for the case where
// CSS variables are unavailable. Flagging it would push authors toward removing the
// fallback, which makes the offline/canvas path worse.
const TOKEN_FALLBACK = /useTokenColor\(\s*['"]--[a-z0-9-]+['"]\s*,\s*['"]#[0-9a-fA-F]{3,8}['"]/;

// Canvas and WebGL drawing APIs take colour strings, not CSS. They never touch
// the DOM, so a token is not available to them.
const CANVAS_DRAWING_FILES = [
  "components/visuals/micro-slats.tsx", // WebGL slats + canvas fillStyle
  "components/feedback/ht-loader.tsx", // SVG stroke on an animated loader
];

// A light source, not a surface. `mix-blend-screen` gradients are simulated
// specular highlights: their value is relative to whatever they screen over, so
// binding one to a semantic token (which means "this is the accent") would be
// both wrong and unmaintainable. See components/motion/button/metallic.tsx.
const BLEND_HIGHLIGHT_FILES = ["components/motion/button/metallic.tsx"];

// The appearance tab previews each palette by showing its literal swatch colours.
// These mirror themes.css by definition; showing the resolved token would defeat
// the point of a swatch.
const PALETTE_PREVIEW_FILES = ["features/settings/tabs/AppearanceTab.tsx"];

// A shadow is not a palette choice, and index.css writes its own shadows the same
// way — `--shadow-float: 0 2.8px 2.2px rgb(0 0 0 / 0.034)`. A literal shadow colour
// in JS is therefore consistent with the token file, not divergent from it. What a
// shadow must not do is pick a *hue*; that is what the rule below catches.
const SHADOW_LITERAL = /\brgba?\(\s*0\s+0\s+0\s*\//;

// Rule 3. design.md:253 sanctions the base 0.5rem ladder *alongside* the named
// scale — "Reference the 0.5rem base radius and its rounded / rounded-md /
// rounded-lg ladder, but keep three distinct steps rather than one global value."
// So both vocabularies are legal. These are the steps themselves.
const RADIUS_SCALE = new Set([
  // named scale — the four tokens in index.css
  "rounded-control", //  8px  buttons, inputs, chips, menu items
  "rounded-card", //    12px  task cards, list rows, popovers
  "rounded-panel", //   16px  column wells, dialogs, sheets
  "rounded-full", //  9999px  lamps, avatars, count pills
  // base ladder — the rem scale, per design.md:253
  "rounded",
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  // structural / directional, not a size choice
  "rounded-none",
  "rounded-square",
]);

// Off-scale radii below the smallest step. These are detail geometry, not
// surfaces: a 1px status dot, a 2px chart legend swatch, a switch track. There is
// no token for "as round as the control it sits inside" and there should not be.
const RADIUS_DETAIL = new Set([
  "rounded-[1px]", // AgentStatus dot
  "rounded-[2px]", // chart.tsx legend swatch
  "rounded-[5px]", // settings-parts switch track
  "rounded-[6px]", // theme-switch thumb
  "rounded-[10px]", // streaming-text citation block
  "rounded-[14px]", // auth-page LogoMark, 56px square
  "rounded-[inherit]", // follows an explicitly-set parent radius
  "rounded-[calc(var(--radius)-5px)]", // derives from the base radius token
]);

// Rule 2. The sibling-layer pattern: a backdrop-filter on a *scrim* — a full-bleed
// overlay behind a dialog, sheet or palette — is the documented exception. It dims
// and blurs what it covers; it is not a glass panel competing for elevation.
const SCRIM_BLUR = /backdrop-blur-\[2px\]/;

// A transient floating overlay — a chart tooltip — carries its own blur legitimately:
// exactly one is on screen at a time and it floats above content rather than sitting
// among peers. This is the scrim family, not the competing-panels problem. Panels
// *inside* another glass panel are NOT exempt, and that is the expensive case.
const TRANSIENT_OVERLAY_BLUR = /backdrop-blur-(?:sm|md|lg|xl)\b/;

const TRANSIENT_OVERLAY_FILES = ["components/charts/tooltip/tooltip-box.tsx"];

/* -------------------------------------------------------------------------- */

const findings = { error: [], warn: [] };

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const sources = walk(ROOT).filter((p) => [".ts", ".tsx", ".css"].includes(extname(p)));

// Strip comments so that a colour or word named in prose — "the lantern-era
// cleanup", "WebKit bug #23113" — is not read as a use. This mirrors what
// check-undefined-css-vars.py already does, for the same reason.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const TOKEN_FILES = ["index.css", "themes.css"];

// ---------------------------------------------------------------------------
// Rule 1 — no raw colour literals outside the token files.
// ---------------------------------------------------------------------------

function checkRawColours(rel, text) {
  if (TOKEN_FILES.includes(rel)) return;
  const allowed = [
    ...CHART_PALETTE_FILES,
    ...CANVAS_DRAWING_FILES,
    ...PALETTE_PREVIEW_FILES,
    ...BLEND_HIGHLIGHT_FILES,
  ].includes(rel);

  for (const [i, line] of stripComments(text).split("\n").entries()) {
    if (allowed) continue;
    if (TOKEN_FALLBACK.test(line)) continue;
    if (SHADOW_LITERAL.test(line)) continue; // neutral black shadow, see above
    // A hex inside a CSS attribute selector is a *selector*, not a use:
    // `[&_.recharts-grid_line[stroke='#ccc']]:stroke-border` matches a library's
    // own hardcoded stroke. Matching it is not what this rule is about.
    const scannable = line.replace(/\[\s*[a-z-]+=['"][^'"]*['"]\s*\]/g, (sel) => " ".repeat(sel.length));

    // `#id` in a string is a colour; `## Heading` or a markdown heading is not.
    const hex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/.exec(scannable);
    const fn = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/.exec(scannable);
    if (!hex && !fn) continue;

    const col = hex ? hex.index : fn.index;
    findings.error.push({
      rule: "raw-colour",
      file: rel,
      line: i + 1,
      text: line.trim().slice(0, 110),
      detail: hex ? `literal ${hex[0]} outside index.css` : `literal ${fn[0]} outside index.css`,
      col,
    });
  }
}

// ---------------------------------------------------------------------------
// Rule 2 — backdrop-filter only in the glass utilities and on scrims.
// ---------------------------------------------------------------------------

function checkBackdropFilter(rel, text) {
  if (TOKEN_FILES.includes(rel)) return; // glass-* utilities live in index.css
  const transient = TRANSIENT_OVERLAY_FILES.includes(rel);
  for (const [i, line] of stripComments(text).split("\n").entries()) {
    const m = /backdrop-(?:filter|blur[-\w]*)/.exec(line);
    if (!m) continue;
    if (SCRIM_BLUR.test(line)) continue;
    if (transient && TRANSIENT_OVERLAY_BLUR.test(line)) continue;
    findings.error.push({
      rule: "backdrop-filter",
      file: rel,
      line: i + 1,
      text: line.trim().slice(0, 110),
      detail: `${m[0]} outside the glass utilities — glass is defined by elevation (design.md 5.2), not spread`,
    });
  }
}

// ---------------------------------------------------------------------------
// Rule 3 — corner radius from the scale.
// ---------------------------------------------------------------------------

// A rounded-* class is `rounded` + an optional side + an optional step. The parse
// has to resolve the overlap between side letters and step names: `rounded-lg` is
// the `lg` step (not the `l` side plus a `g` step), `rounded-t-md` is the `md` step
// on the top edge, and `rounded-xl` is `xl` (not the `x` side plus `l`).
//
// So: try the WHOLE step against the scale first. Only if that fails, strip a
// leading side segment and try again. A name that is neither whole-step nor
// side+step (`2xl`, an invented token) is reported as-is.
const KNOWN = new Set([...RADIUS_SCALE, ...RADIUS_DETAIL]);
const SIDE_PREFIX = /^(?:[trblexy]|[sse]{1,2})-/; // t/r/b/l/e/x/y, start/end, inline-start

function radiusStep(token) {
  const rest = token.replace(/^rounded-?/, "");
  if (rest === "") return null; // bare `rounded`, or a bare side such as `rounded-r`
  if (KNOWN.has(`rounded-${rest}`)) return rest; // the whole thing is a known step
  const stripped = rest.replace(SIDE_PREFIX, "");
  if (stripped !== rest && KNOWN.has(`rounded-${stripped}`)) return stripped; // side + step
  return rest; // genuinely off-scale — report the whole thing so the message is honest
}

function checkRadius(rel, text) {
  if (TOKEN_FILES.includes(rel)) return;
  for (const [i, line] of stripComments(text).split("\n").entries()) {
    // Whole class tokens only, so `rounded-lg` is never re-split mid-name.
    for (const m of line.matchAll(/\brounded(?:-[a-z0-9()[\],.%_+\-*/]+)?/g)) {
      const step = radiusStep(m[0]);
      if (step === null || KNOWN.has(`rounded-${step}`)) continue;
      findings.warn.push({
        rule: "radius",
        file: rel,
        line: i + 1,
        text: line.trim().slice(0, 110),
        detail: `${m[0]} is off the radius scale (design.md 5: control 8 / card 12 / panel 16)`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 4 — legacy --color-* aliases. Warn only; they must still resolve until
// phase 5 removes them, so this is a countdown, not a gate.
// ---------------------------------------------------------------------------

function checkLegacyAliases(files) {
  let count = 0;
  const seen = new Map();
  for (const { rel, text } of files) {
    for (const m of stripComments(text).matchAll(/var\(--color-[a-z0-9-]+/g)) {
      count += 1;
      seen.set(m[0], (seen.get(m[0]) ?? 0) + 1);
    }
  }
  if (count > 0) {
    findings.warn.push({
      rule: "legacy-alias",
      file: "web/src (aggregate)",
      line: 0,
      text: `${count} use(s) across ${seen.size} distinct alias(es)`,
      detail: `migrate toward --c-*: ${[...seen.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Rule 7 — the lantern-era surface names are gone. design.md 12 lists this as an
// acceptance criterion; it is one grep, and it costs nothing to keep true.
// ---------------------------------------------------------------------------

function checkLantern(files) {
  for (const { rel, text } of files) {
    for (const [i, line] of stripComments(text).split("\n").entries()) {
      if (!/lantern/.test(line)) continue;
      findings.error.push({
        rule: "lantern",
        file: rel,
        line: i + 1,
        text: line.trim().slice(0, 110),
        detail: "lantern-era naming must be gone from source (design.md 12)",
      });
    }
  }
}

/* -------------------------------------------------------------------------- */

const files = sources.map((p) => {
  const rel = relative(ROOT, p);
  return { rel, text: readFileSync(p, "utf8") };
});

for (const { rel, text } of files) {
  checkRawColours(rel, text);
  checkBackdropFilter(rel, text);
  checkRadius(rel, text);
}
checkLegacyAliases(files);
checkLantern(files);

const order = { error: 0, warn: 1 };
const all = [...findings.error, ...findings.warn].sort(
  (a, b) => order[a.rule === "raw-colour" || a.rule === "backdrop-filter" || a.rule === "lantern" ? "error" : "warn"] -
           order[b.rule === "raw-colour" || b.rule === "backdrop-filter" || b.rule === "lantern" ? "error" : "warn"],
);

if (all.length === 0) {
  console.log("OK: token-lint found no design-token drift in web/src");
  console.log("    raw colours, backdrop-filter and radius all conform to design.md Rev 4");
  process.exit(0);
}

let current = null;
for (const f of all) {
  const severity =
    f.rule === "raw-colour" || f.rule === "backdrop-filter" || f.rule === "lantern"
      ? "error"
      : "warn";
  const heading = `${severity === "error" ? "FAIL" : "warn"}  ${f.rule}`;
  if (heading !== current) {
    current = heading;
    console.log(`\n${heading}`);
  }
  const where = f.line ? `${f.file}:${f.line}` : f.file;
  console.log(`  ${where.padEnd(52)} ${f.detail}`);
  console.log(`  ${" ".repeat(52)} | ${f.text}`);
}

const errors = findings.error.length;
const warnings = all.length - errors;
console.log(
  `\n${errors} error(s), ${warnings} warning(s).` +
    (errors ? "\nErrors are gate failures. Warnings are informational until phase 5." : ""),
);
process.exit(errors ? 1 : 0);