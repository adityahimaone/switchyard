import { ThinkingOrb, type OrbSize, type OrbState } from "thinking-orbs"
import { cn } from "@/lib/utils"

/* The app's own lifecycle vocabulary, which is what callers have on hand. */
export type AgentOrbState = "idle" | "loading" | "running" | "searching" | "done" | "error" | "cancelled"

/* Run lifecycle → orb animation. The orb ships nine hand-tuned states, so the
   animation can say what the agent is doing instead of just that something is
   happening. `breathing` is the resting face (nothing running yet), which is
   what makes an idle chat still feel alive rather than dead. */
const STATE_ORB: Record<AgentOrbState, OrbState> = {
  idle: "breathing",
  loading: "connecting",
  running: "working",
  searching: "searching",
  done: "shaping",
  error: "solving",
  cancelled: "breathing",
}

/* A phase label from the run's event stream is more specific than the run
   state, so it wins when present: "reading files" should look like searching,
   not like the generic working orbit. Ordered — first match wins, so the
   narrow verbs sit above the broad `work|edit|run` catch-all. */
const PHASE_RULES: [RegExp, OrbState][] = [
  [/search|scan|codegraph|index|inspect|check|reading|explor/i, "searching"],
  [/plan|reason|think|solv|analy|decid/i, "solving"],
  [/listen|await|wait|approv|input/i, "listening"],
  [/connect|prepar|resolv|boot|attach|starting|loading/i, "connecting"],
  [/compos|summar|draft|answer|respond/i, "composing"],
  [/weav|merge|integrat|combin/i, "weaving"],
  [/shap|format|structur|final|cleanup/i, "shaping"],
  [/work|edit|apply|patch|file|execut|tool|run/i, "working"],
]

export function orbStateForPhase(phase?: string): OrbState | undefined {
  if (!phase) return undefined
  for (const [pattern, state] of PHASE_RULES) if (pattern.test(phase)) return state
  return undefined
}

/**
 * One thinking orb for every "the agent is busy" surface in the app.
 *
 * `phase` (the human label already shown next to the orb) refines the
 * animation while running; without it the run state picks the animation. A
 * finished run freezes on `shaping` — a settled dotted outline reads as done
 * in a way a spinner that simply vanished never did.
 */
export function AgentOrb({
  state = "idle", phase, size = 32, speed = 1, paused, className, label,
}: {
  state?: AgentOrbState
  phase?: string
  size?: OrbSize
  speed?: number
  paused?: boolean
  className?: string
  label?: string
}) {
  const resolved = (state === "running" ? orbStateForPhase(phase) : undefined) ?? STATE_ORB[state]
  return (
    <ThinkingOrb
      state={resolved}
      size={size}
      speed={speed}
      paused={paused ?? state === "done"}
      className={cn("shrink-0", className)}
      aria-label={label ?? `Agent ${state}`}
    />
  )
}
