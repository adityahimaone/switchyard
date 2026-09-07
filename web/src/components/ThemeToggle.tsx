import { useEffect, useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"

export type ThemeMode = "light" | "dark"

export const THEME_STORAGE_KEY = "boardui:theme"
const THEME_CHANGE_EVENT = "boardui:theme-change"

function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return
    applyTheme(event.newValue === "dark" ? "dark" : "light", false)
  }
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onStorage)
  }
}

function applyTheme(theme: ThemeMode, persist = true) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme)
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark")
  const dark = theme === "dark"

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === "light" || saved === "dark") applyTheme(saved, false)
  }, [])

  if (collapsed) {
    const Icon = dark ? Sun : Moon
    return (
      <button
        type="button"
        aria-label={dark ? "Use light mode" : "Use dark mode"}
        title={dark ? "Light mode" : "Dark mode"}
        onClick={() => applyTheme(dark ? "light" : "dark")}
        className="flex size-9 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-background-tertiary hover:text-text-primary"
      >
        <Icon className="size-4" />
      </button>
    )
  }

  return (
    <div role="group" aria-label="Theme" className="relative flex items-center gap-1 rounded-full bg-background-tertiary p-1">
      <span aria-hidden className={`pointer-events-none absolute top-1 size-7 rounded-full bg-background-primary shadow-sm transition-transform duration-200 ${dark ? "translate-x-8" : "translate-x-0"}`} />
      <button type="button" aria-label="Use light mode" aria-pressed={!dark} onClick={() => applyTheme("light")} className={`relative z-10 flex size-7 items-center justify-center rounded-full ${!dark ? "text-text-primary" : "text-text-tertiary"}`}>
        <Sun className="size-3.5" />
      </button>
      <button type="button" aria-label="Use dark mode" aria-pressed={dark} onClick={() => applyTheme("dark")} className={`relative z-10 flex size-7 items-center justify-center rounded-full ${dark ? "text-text-primary" : "text-text-tertiary"}`}>
        <Moon className="size-3.5" />
      </button>
    </div>
  )
}
