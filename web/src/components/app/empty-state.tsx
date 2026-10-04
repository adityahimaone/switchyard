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
        /* Glass, because an empty state *is* a content panel — it sits in the
           content area on the glow field, and frosting it keeps the material
           consistent with every other surface that appears there. It is also the
           one place the effect costs nothing: there is no data to obscure, which
           is why the dot grid and the wash are still allowed underneath. */
        "glass flex flex-col items-start gap-1 rounded-panel px-6 py-10",
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
