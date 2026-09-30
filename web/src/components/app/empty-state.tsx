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
    <div
      className={cn(
        "flex flex-col items-start gap-1 rounded-panel px-6 py-10",
        // Decorative texture is allowed here because an empty state holds no
        // data to read against it.
        "smoke-wash dot-grid",
        className,
      )}
    >
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="max-w-[44ch] text-xs text-ink-3">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
