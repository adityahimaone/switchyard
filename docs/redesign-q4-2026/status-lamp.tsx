import type { CSSProperties } from "react"
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
