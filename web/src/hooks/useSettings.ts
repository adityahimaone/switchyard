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
  const light = preference === "light" || (preference === "system" && window.matchMedia("(prefers-color-scheme: light)").matches)
  document.documentElement.classList.toggle("light", light)
  document.documentElement.classList.toggle("dark", !light)
  document.documentElement.dataset.theme = preference
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

