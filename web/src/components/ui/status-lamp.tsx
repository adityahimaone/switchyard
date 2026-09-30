import type { CSSProperties, ReactNode } from "react"
import type { Status } from "@/api"
import { cn } from "@/lib/utils"

export const STATUS_LABEL: Record<Status, string> = {
  triage: "Triage",
  todo: "Todo",
  scheduled: "Scheduled",
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  archived: "Archived",
}

/** Filled lamps mean "has a state"; hollow lamps mean "waiting or parked". */
const HOLLOW = new Set<Status>(["triage", "todo", "scheduled", "archived"])

export const statusColor = (status: Status) => `var(--c-st-${status})`

/**
 * The only way to show task status. Lamp plus text label, so state never
 * depends on color alone. `running` pulses (disabled under reduced motion).
 */
export function StatusLamp({
  status,
  label,
  showLabel = true,
  size = "md",
  className,
}: {
  status: Status
  label?: string
  showLabel?: boolean
  size?: "sm" | "md"
  className?: string
}) {
  const hollow = HOLLOW.has(status)
  const text = label ?? STATUS_LABEL[status]
  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-ink-2", className)}
      style={{ "--lamp": statusColor(status) } as CSSProperties}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block shrink-0 rounded-full",
          size === "sm" ? "size-1.5" : "size-2",
          hollow ? "border border-[var(--lamp)]" : "bg-[var(--lamp)]",
          status === "scheduled" && "border-dashed",
        )}
      >
        {status === "running" && (
          <span className="absolute inset-0 animate-lamp rounded-full bg-[var(--lamp)]" />
        )}
      </span>
      {showLabel ? <span>{text}</span> : <span className="sr-only">{text}</span>}
    </span>
  )
}

/**
 * Health lamp, for things that are up or down rather than moving through the
 * track: workspaces, providers, executors.
 *
 * Separate from `StatusLamp` on purpose. A workspace being "connected" is not a
 * task state, and colouring it from the task ramp would imply it is somewhere
 * on the board. It gets its own two-value vocabulary — `live` pulses,
 * `idle` is hollow — and a caller-supplied tone so the page decides what
 * healthy means.
 */
export function HealthLamp({
  tone,
  label,
  live = false,
  size = "md",
  className,
}: {
  tone: string
  label: ReactNode
  /** Pulses the lamp, for something that is actively reporting. */
  live?: boolean
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", tone, className)}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block shrink-0 rounded-full",
          size === "sm" ? "size-1.5" : "size-2",
          live ? "bg-current" : "border border-current",
        )}
      >
        {live && <span className="absolute inset-0 animate-lamp rounded-full bg-current" />}
      </span>
      {label}
    </span>
  )
}
