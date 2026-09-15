import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { ThinkingOrb, type OrbState } from "thinking-orbs"

export function ThinkingShimmer({ children = "Thinking…", className }: { children?: React.ReactNode; className?: string }) {
  return <span className={cn("thinking-shimmer", className)}>{children}</span>
}

export function ReasoningText({ phrases = ["Thinking", "Reading context", "Connecting details", "Preparing answer"], className }: { phrases?: string[]; className?: string }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (phrases.length < 2) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % phrases.length), 1800)
    return () => window.clearInterval(timer)
  }, [phrases])
  return <span className={cn("reasoning-text", className)} role="status"><span className="reasoning-text__dot" aria-hidden /> <ThinkingShimmer>{phrases[index] ?? "Thinking"}</ThinkingShimmer></span>
}


const SCRAMBLE_CHARS = "▓▒░<>/\\|{}[]*+-"

function ScrambleText({ text }: { text: string }) {
  const [visible, setVisible] = useState(text)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    let frame = 0
    const total = Math.max(8, text.length * 2)
    const timer = window.setInterval(() => {
      frame += 1
      const settled = Math.floor((frame / total) * text.length)
      setVisible(Array.from(text, (char, index) => {
        if (char === " " || index < settled) return char
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
      }).join(""))
      if (frame >= total) {
        window.clearInterval(timer)
        setVisible(text)
      }
    }, 24)
    return () => window.clearInterval(timer)
  }, [text])
  return <span aria-live="polite">{visible}</span>
}

function formatElapsed(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = (safe % 60).toFixed(1)
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export function AgentProgress({ label = "Churning", elapsedSeconds, initialSeconds = 0, running = true, orbState = "working", className }: { label?: string; elapsedSeconds?: number; initialSeconds?: number; running?: boolean; orbState?: OrbState; className?: string }) {
  const [internalSeconds, setInternalSeconds] = useState(initialSeconds)
  useEffect(() => {
    if (elapsedSeconds !== undefined || !running) return
    const startedAt = performance.now() - initialSeconds * 1000
    const timer = window.setInterval(() => setInternalSeconds((performance.now() - startedAt) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [elapsedSeconds, initialSeconds, running])
  const elapsed = elapsedSeconds ?? internalSeconds
  return <span role="status" aria-label={`${label}, in progress`} className={cn("inline-flex items-center gap-3 font-mono text-sm text-muted-foreground", className)}>
    <ThinkingOrb state={orbState} size={64} theme="auto" aria-hidden style={{ width: 45, height: 45, flexShrink: 0 }} />
    <span className="font-sans font-medium"><ScrambleText text={label} /></span>
    <span aria-hidden className="tabular-nums text-muted-foreground/70">{formatElapsed(elapsed)}</span>
  </span>
}
