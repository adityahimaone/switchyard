import { Dotm3x3_21 } from "@/components/ui/dotm-3x3-21"
import { cn } from "@/lib/utils"

/**
 * The board's one loader, wrapping the Dot Matrix 3×3 glyph so every running
 * surface animates identically and the registry component is never dropped.
 *
 * `animated` is the dynamic switch: a running card spins, a paused one holds
 * the last frame (so the loader reads as "stopped here", not "disappeared").
 * The dot colour comes from the app's accent token, so the loader follows the
 * theme instead of the registry's hard-coded defaults.
 */
export function BoardLoader({
  running = true, size = 14, className, label,
}: {
  running?: boolean
  size?: number
  className?: string
  label?: string
}) {
  return (
    <Dotm3x3_21
      animated={running}
      size={size}
      dotSize={size <= 12 ? 2 : 3}
      color="var(--c-accent)"
      pattern="full"
      dotShape="circle"
      bloom={running}
      className={cn("shrink-0", className)}
      ariaLabel={label ?? (running ? "Loading" : "Paused")}
    />
  )
}
