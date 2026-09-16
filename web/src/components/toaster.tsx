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

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; tone?: Toast["tone"] }>).detail
      const item = { id: Date.now(), message: detail.message, tone: detail.tone ?? "info" }
      setItems((x) => [...x, item])
      // Play outcome sound if enabled
      const masterOn = readBool(SOUND_KEY, true)
      const outcomeOn = readBool(SOUND_OUTCOME_KEY, true)
      if (masterOn && outcomeOn) {
        play(TONE_CUE[item.tone] as "success" | "error" | "chime")
      }
      window.setTimeout(() => setItems((x) => x.filter((t) => t.id !== item.id)), 4500)
    }
    window.addEventListener("kb-toast", onToast)
    return () => window.removeEventListener("kb-toast", onToast)
  }, [])
  return <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
    {items.map((t) => <div key={t.id} role="status" className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-[var(--color-surface-raised)] p-3 text-xs shadow-lg ${t.tone === "error" ? "border-red-500/40 text-red-200" : t.tone === "success" ? "border-emerald-500/40 text-emerald-200" : "border-[var(--color-line)] text-neutral-200"}`}>
      <span className="min-w-0 flex-1">{t.message}</span><button aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X className="size-3.5" /></button>
    </div>)}
  </div>
}
