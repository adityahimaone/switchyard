"""Contrast check for the Revision 5 glass tokens.

Composites each glass fill over its worst-case backdrop -- an orb directly
behind the panel, not the flat canvas -- and runs WCAG relative luminance.

The method is deliberately the same one design.md used for the palette work:
gamma-encode, composite in sRGB, then linearise. Compositing in linear light
gives different (and wrong) numbers, which is the trap the first palette pass
fell into.

Run: python3 contrast-glass.py
"""

import math

def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def over(fg, alpha, bg):
    """Composite fg at alpha over bg, in sRGB 0-255."""
    return tuple(alpha * f + (1 - alpha) * b for f, b in zip(fg, bg))

def lum(rgb255):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

# ── palette (index.css) ───────────────────────────────────────────────────────
CANVAS_L   = hex_rgb("#f2f4fd")
CANVAS_D   = hex_rgb("#0f1320")

# Ink ramp, light / dark
INK = {
    "ink":   ("#0f172a", "#e8edf5"),
    "ink-2": ("#4d4c63", "#c2c9d6"),
    "ink-3": ("#5c5f70", "#9aa0ae"),
}
ACCENT_TEXT = ("#2f57c4", "#8fb6f8")
SUCCESS_TEXT = ("#217a4e", "#7cf0ac")
DANGER_TEXT  = ("#c43f3f", "#ff9e9e")
REVIEW_TEXT  = ("#7440c4", "#c7aaf7")

# ── orb worst case ────────────────────────────────────────────────────────────
# The orbs sit behind the sidebar and the kanban columns. Accent is 26% in light,
# 40% in dark, blurred at 90px over the canvas. Blurring spreads the peak, so a
# fully-saturated disc is the conservative assumption; this composites the orb
# peak over the canvas rather than a mid-blur approximation.
ORB = {"light": (26 / 100, "#2f57c4"), "dark": (32 / 100, "#5a7fd6")}

# ── glass fills (index.css, Revision 5) ───────────────────────────────────────
TINT        = {"light": (0.74, (255, 255, 255)), "dark": (0.42, (46, 56, 78))}
TINT_STRONG = {"light": (0.84, (255, 255, 255)), "dark": (0.78, (30, 38, 55))}
CANVAS = {"light": CANVAS_L, "dark": CANVAS_D}


def worst_case(theme, tint):
    """Panel fill over (canvas + orb directly behind it)."""
    a, hue = ORB[theme]
    ground = over(hex_rgb(hue), a, CANVAS[theme])
    alpha, rgb = tint[theme]
    return over(rgb, alpha, ground)


def report(title, tint):
    print(f"\n{title}")
    print(f"{'':22}{'light':>8}{'dark':>8}")
    print("-" * 38)
    rows = [(k, v) for k, v in INK.items()]
    rows += [("accent-text", ACCENT_TEXT), ("success-text", SUCCESS_TEXT),
             ("danger-text", DANGER_TEXT), ("review-text", REVIEW_TEXT)]
    worst = (99, "")
    for name, (lt, dk) in rows:
        rl = ratio(hex_rgb(lt), worst_case("light", tint))
        rd = ratio(hex_rgb(dk), worst_case("dark", tint))
        flag = "  <-- FAILS 4.5" if min(rl, rd) < 4.5 else ""
        if min(rl, rd) < worst[0]:
            worst = (min(rl, rd), name)
        print(f"{name:22}{rl:8.2f}{rd:8.2f}{flag}")
    print(f"\n  tightest: {worst[1]} at {worst[0]:.2f}:1  (bar is 4.5:1)")
    return worst


print("Glass contrast — worst case is an orb directly behind the panel,")
print("not the flat canvas. Composite in sRGB, then linearise.\n")

report("L2/L3 panel + card  (glass / glass-card)", TINT)
report("L4/L5 overlay      (glass-strong)", TINT_STRONG)

# ── type on a filled accent surface ────────────────────────────────────────────
# The button gradient is `accent/85 -> accent`, so the lightest background its
# label can sit on is the top stop. White has to clear the bar there.
# `--c-accent-ink` measured ~2.6:1 against this blue in dark, which is why the
# primary button's label was unreadable.
print("\nType on the filled accent surface (primary button gradient)")
print(f"{'':22}{'light':>8}{'dark':>8}")
print("-" * 38)
ACCENT_FILL = {"light": hex_rgb("#2f57c4"), "dark": hex_rgb("#7aa7f5")}
# The label is theme-dependent on purpose. In light the accent is a dark blue
# and white clears 6.40:1; in dark the accent is a LIGHT blue and white would
# land at 2.42:1, so the label goes near-black at 7.98:1. Forcing white in both
# themes is the bug this table exists to catch.
ON_ACCENT = {"light": hex_rgb("#ffffff"), "dark": hex_rgb("#0b0e14")}
ALT = {"light": hex_rgb("#0b0e14"), "dark": hex_rgb("#ffffff")}
for name, pair in [("on-accent (used)", ON_ACCENT), ("the other way", ALT)]:
    vals = {t: ratio(pair[t], ACCENT_FILL[t]) for t in ("light", "dark")}
    flag = "  <-- FAILS 4.5" if min(vals.values()) < 4.5 else ""
    print(f"{name:22}{vals['light']:8.2f}{vals['dark']:8.2f}{flag}")
print("\n  The label colour is theme-dependent BY MEASUREMENT, not by taste.")
print("  White is correct in light; near-black is correct in dark.")
print("  Never hard-code either one at a call site — use the token.")

print("\nBar is 4.5:1 for body text, 3:1 for large text and UI boundaries.")
