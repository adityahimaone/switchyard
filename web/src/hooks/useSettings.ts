import { useEffect, useState } from "react"

// ponytail: localStorage-only settings hook. Add backend API + user table when multi-device sync needed.
const REFRESH_KEY = "kb-refresh-interval"
const COMPACT_KEY = "kb-compact-cards"
const PING_KEY = "kb-ping-interval"
export const THEME_KEY = "kb-theme"
export type ThemePreference = "system" | "light" | "dark"

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch { return "system" }
}

export function applyTheme(preference: ThemePreference) {
  // Light is the default in Signal Blue, so the `dark` class is the one that
  // gets added. Both classes are kept in sync because `dark:` variants and the
  // `.dark` token block still key off `dark`.
  const dark = preference === "dark" || (preference === "system" && !window.matchMedia("(prefers-color-scheme: light)").matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.dataset.theme = preference
}

/** Colour palettes. Signal Blue is the default and has no attribute value. */
export const PALETTE_KEY = "kb-palette"
export type ThemePalette = "signal" | "lime" | "zen"
export const PALETTES: readonly ThemePalette[] = ["signal", "lime", "zen"]

export function readPalette(): ThemePalette {
  try {
    const value = localStorage.getItem(PALETTE_KEY)
    return PALETTES.includes(value as ThemePalette) ? (value as ThemePalette) : "signal"
  } catch { return "signal" }
}

export function applyPalette(palette: ThemePalette) {
  const root = document.documentElement
  // `signal` is the base stylesheet, so it is expressed as *no attribute* rather
  // than as `data-theme-palette="signal"`. That matters for specificity: the base
  // tokens live on `:root`, and an attribute selector would outrank them, so
  // leaving the attribute on for the default palette would let a stale value
  // from a previous selection keep winning.
  if (palette === "signal") delete root.dataset.themePalette
  else root.dataset.themePalette = palette
}

export function savePalette(palette: ThemePalette) {
  try { localStorage.setItem(PALETTE_KEY, palette) } catch {}
  applyPalette(palette)
  // `saveTheme` dispatches this so any other subscriber re-reads; the palette
  // needs the same signal for its own cross-tab sync.
  window.dispatchEvent(new StorageEvent("storage", { key: PALETTE_KEY, newValue: palette }))
}

export function usePalette() {
  const [palette, setPalette] = useState<ThemePalette>(() => readPalette())
  useEffect(() => {
    const sync = () => setPalette(readPalette())
    const onStorage = (event: StorageEvent) => { if (event.key === PALETTE_KEY) sync() }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  return { palette, setPalette: (value: ThemePalette) => { savePalette(value); setPalette(value) } }
}

export type Density = "comfortable" | "compact"
export const DENSITY_KEY = "kb-density"

/** Migrates the old `kb-compact-cards` boolean so existing installs keep their density. */
export function readDensity(): Density {
  try {
    if (localStorage.getItem(DENSITY_KEY) === null) {
      const legacy = localStorage.getItem("kb-compact-cards")
      if (legacy !== null) {
        const density: Density = JSON.parse(legacy) === true ? "compact" : "comfortable"
        localStorage.setItem(DENSITY_KEY, density)
        return density
      }
    }
    const value = localStorage.getItem(DENSITY_KEY)
    return value === "compact" ? "compact" : "comfortable"
  } catch { return "comfortable" }
}

export function applyDensity(density: Density) {
  document.documentElement.dataset.density = density
}

export type MotionPreference = "system" | "reduce"
export const MOTION_KEY = "kb-motion"

export function readMotion(): MotionPreference {
  try {
    return localStorage.getItem(MOTION_KEY) === "reduce" ? "reduce" : "system"
  } catch { return "system" }
}

export function applyMotion(preference: MotionPreference) {
  document.documentElement.dataset.motion = preference
}

/** True when motion should be suppressed, honouring both the OS and the manual setting. */
export function prefersReducedMotion(): boolean {
  if (document.documentElement.dataset.motion === "reduce") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function saveTheme(preference: ThemePreference) {
  try { localStorage.setItem(THEME_KEY, preference) } catch {}
  applyTheme(preference)
  window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY, newValue: preference }))
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(() => readTheme())
  useEffect(() => {
    const sync = () => setTheme(readTheme())
    const media = window.matchMedia("(prefers-color-scheme: light)")
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY) sync() }
    const onMedia = () => { if (readTheme() === "system") applyTheme("system") }
    window.addEventListener("storage", onStorage)
    media.addEventListener("change", onMedia)
    return () => { window.removeEventListener("storage", onStorage); media.removeEventListener("change", onMedia) }
  }, [])
  return { theme, setTheme: (value: ThemePreference) => { saveTheme(value); setTheme(value) } }
}

export function readNum(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? Number(raw) : fallback
  } catch {
    return fallback
  }
}

export function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export const SOUND_KEY = "kb-sound-enabled"
export const VOLUME_KEY = "kb-sound-volume"
export const SOUND_HOVER_KEY = "kb-sound-hover"
export const SOUND_CLICK_KEY = "kb-sound-click"
export const SOUND_OUTCOME_KEY = "kb-sound-outcome"

export function useSettings() {
  const [refreshMs, setRefreshMs] = useState(() => readNum(REFRESH_KEY, 15000))
  const [compact, setCompact] = useState(() => readBool(COMPACT_KEY, false))
  const [pingMs, setPingMs] = useState(() => readNum(PING_KEY, 30000))

  // Listen for cross-tab / same-tab storage changes so settings page updates propagate live
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === REFRESH_KEY) setRefreshMs(readNum(REFRESH_KEY, 15000))
      if (e.key === COMPACT_KEY) setCompact(readBool(COMPACT_KEY, false))
      if (e.key === PING_KEY) setPingMs(readNum(PING_KEY, 30000))
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  return { refreshMs, compact, pingMs }
}

export function useSoundSettings() {
  const [enabled, setEnabled] = useState(() => readBool(SOUND_KEY, true))
  const [volume, setVolume] = useState(() => readNum(VOLUME_KEY, 0.6))
  const [hover, setHover] = useState(() => readBool(SOUND_HOVER_KEY, true))
  const [click, setClick] = useState(() => readBool(SOUND_CLICK_KEY, true))
  const [outcome, setOutcome] = useState(() => readBool(SOUND_OUTCOME_KEY, true))

  const write = (key: string, value: boolean | number) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }

  return {
    enabled, volume, hover, click, outcome,
    setEnabled: (v: boolean) => { setEnabled(v); write(SOUND_KEY, v) },
    setVolume: (v: number) => { setVolume(v); write(VOLUME_KEY, v) },
    setHover: (v: boolean) => { setHover(v); write(SOUND_HOVER_KEY, v) },
    setClick: (v: boolean) => { setClick(v); write(SOUND_CLICK_KEY, v) },
    setOutcome: (v: boolean) => { setOutcome(v); write(SOUND_OUTCOME_KEY, v) },
  }
}

