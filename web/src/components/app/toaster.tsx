import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { play } from "cuelume"
import { readBool, SOUND_KEY, SOUND_OUTCOME_KEY } from "@/hooks/useSettings"

type Toast = { id: number; message: string; tone: "success" | "error" | "info" }

const TONE_CUE: Record<Toast["tone"], string> = {
  success: "success",
  error: "error",
  info: "chime",
}

/** Tone styles. These used to be `border-red-500/40` and `border-emerald-500/40`,
 * which are dark-theme values sitting on a light-default app — roughly 2:1 and
 * effectively invisible. They are the semantic tokens now. */
const TONE_CLASS: Record<Toast["tone"], string> = {
  error: "text-danger-text",
  success: "text-success-text",
  info: "text-ink",
}

export function Toaster() {
  const [items, setItems] = useState<(Toast & { leaving?: boolean })[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; tone?: Toast["tone"] }>).detail
      const item = { id: Date.now(), message: detail.message, tone: detail.tone ?? "info" }
      setItems((x) => [...x, item])
      const masterOn = readBool(SOUND_KEY, true)
      const outcomeOn = readBool(SOUND_OUTCOME_KEY, true)
      if (masterOn && outcomeOn) {
        play(TONE_CUE[item.tone] as "success" | "error" | "chime")
      }
      // Mark leaving first, then unmount once the exit has played. Without the
      // two-step the toast would vanish the instant the timer fired.
      window.setTimeout(() => {
        setItems((x) => x.map((t) => (t.id === item.id ? { ...t, leaving: true } : t)))
        window.setTimeout(
          () => setItems((x) => x.filter((t) => t.id !== item.id)),
          240,
        )
      }, 4500)
    }
    window.addEventListener("kb-toast", onToast)
    return () => window.removeEventListener("kb-toast", onToast)
  }, [])

  const dismiss = (id: number) => {
    setItems((x) => x.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    window.setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 240)
  }

  /* Tone drives the left status bar, not the text colour alone — the bar is the
     non-colour cue that makes a toast readable for someone who cannot separate
     the red from the green. The matching entry glow lives in CSS keyed off
     `data-tone`, so it cannot drift from this map. */
  const BAR: Record<string, string> = {
    success: "bg-success",
    error: "bg-danger",
    info: "bg-accent",
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-toast flex w-80 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          data-leaving={t.leaving || undefined}
          data-tone={t.tone}
          className={`glass-strong toast-item pointer-events-auto flex items-start gap-2 rounded-card p-3 pl-4 text-xs ${TONE_CLASS[t.tone]}`}
        >
          <span
            aria-hidden
            className={`absolute inset-y-2 left-1.5 w-0.5 rounded-full ${BAR[t.tone] ?? "bg-line-strong"}`}
          />
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded-control p-0.5 text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}