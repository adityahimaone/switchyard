"""Report CSS variables that are referenced in source but never defined.

Run: python scripts/check-undefined-css-vars.py

This exists because the ring charts were drawing their inactive arcs in black:
`ringCssVars.ringBackground` was `var(--border)`, and `--border` was defined
nowhere. An undefined custom property resolves to nothing, and an SVG `fill`
with no value falls back to black — so three of the four rings read as data.

The important part is what this class of bug does *not* trigger. TypeScript is
clean. `tsc -b` is clean. The Vite production build is clean. All 39 tests pass.
None of them look at CSS variable resolution, so nothing in the usual gate
catches it — it is only visible by rendering the page.

Tailwind and shadcn emit their own variables at runtime from the `@theme` block,
so those prefixed names are not expected to appear in index.css.
"""

import re
import pathlib
import collections

ROOT = pathlib.Path(__file__).resolve().parent.parent / "web" / "src"
CSS = ROOT / "index.css"

defined = set(re.findall(r"(--[a-zA-Z0-9-]+)\s*:", CSS.read_text(encoding="utf-8")))

used = collections.defaultdict(set)
for path in ROOT.rglob("*.tsx"):
    text = path.read_text(encoding="utf-8")
    # Strip comments: a variable named in an explanatory comment is not a use,
    # and would otherwise keep this check permanently red.
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    for m in re.finditer(r"var\((--[a-zA-Z0-9-]+)", text):
        used[m.group(1)].add(path.name)

# Scoped to a library prefix, or set from JS at runtime (e.g. --lamp,
# --available-width, --transform-origin) rather than declared in CSS.
NOT_A_TOKEN = re.compile(r"^--(?:tw-|chakra-|radix)")
RUNTIME_OWNED = {
    "--lamp",
    "--radius",
    "--color",
    "--available-width",
    "--popup-height",
    "--popup-width",
    "--positioner-height",
    "--positioner-width",
    "--transform-origin",
    "--fluid-tooltip-surface",
    "--shimmering-color",
    "--popup-radius",
}

missing = {
    var: sorted(files)
    for var, files in used.items()
    if var not in defined
    and not NOT_A_TOKEN.match(var)
    and var not in RUNTIME_OWNED
    # `var(--c-st-` is a template literal in statusColor(), not a real variable.
    and var != "--c-st-"
}

if not missing:
    print("OK: every CSS variable referenced in source is defined in index.css")
else:
    print(f"{len(missing)} undefined CSS variable(s):\n")
    for var, files in sorted(missing.items()):
        print(f"  {var:36s} <- {', '.join(files)}")
    raise SystemExit(1)
