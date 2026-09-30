import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Says what is true and what to do. Left-aligned, no centering, no decorative
 * icon. Pass an action only when a real one exists.
 */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-start gap-1 px-2 py-8", className)}>
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="max-w-[44ch] text-xs text-ink-3">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
