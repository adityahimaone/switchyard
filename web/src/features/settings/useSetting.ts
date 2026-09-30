import { useState } from "react"

/** A settings value backed by localStorage, written on every change. */
export function useSetting<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  })
  const update = (v: T) => {
    setValue(v)
    try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
  }
  return [value, update] as const
}
