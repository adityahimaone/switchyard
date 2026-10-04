import { forwardRef } from "react"
import { cn } from "@/lib/utils"
import { useSpotlight } from "./use-spotlight"

/**
 * The one primitive every glass surface composes from.
 *
 * The point of it is that the *tier* is a single decision made in one place,
 * rather than each component reaching for whichever glass class it remembers.
 * That matters because the tiers are not decorative: `panel` blurs, `card`
 * deliberately does not, and `overlay` blurs hardest. Getting that wrong is
 * what produced 463 compositing layers on a single page.
 *
 *   panel    L2  sidebar, topbar, kanban column, chart panel   — blurs
 *   card     L3  cards, tiles, chat bubbles                    — no blur
 *   overlay  L4  dialogs, sheets, popovers, palette, toast      — blurs hard
 *
 * `glow` is information, never ornament. A glow on a static element is
 * decoration pretending to be a signal, so it is not something a surface
 * enables for itself — the caller passes it because the component *has* a
 * state worth showing. See the state mapping in `index.css`.
 */

type Tier = "panel" | "card" | "overlay"
type Glow = "none" | "focus" | "running" | "success" | "danger" | "review"

const TIER_CLASS: Record<Tier, string> = {
  panel: "glass",
  card: "glass-card",
  overlay: "glass-strong glass-sheen",
}

export interface SurfaceProps extends React.ComponentProps<"div"> {
  tier?: Tier
  glow?: Glow
  /**
   * Track the pointer with a radial highlight. Costs one `onPointerMove` per
   * instance, so use it on a handful of surfaces — or, on the board, use
   * `useDelegatedSpotlight` on the root instead and drop this.
   */
  spotlight?: boolean
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { tier = "panel", glow = "none", spotlight = false, className, onPointerMove, ...rest },
  ref,
) {
  const move = useSpotlight<HTMLDivElement>()

  return (
    <div
      ref={ref}
      data-slot="surface"
      data-tier={tier}
      className={cn(
        TIER_CLASS[tier],
        glow !== "none" && `glow-${glow}`,
        spotlight && "glass-spotlight",
        className,
      )}
      onPointerMove={
        spotlight
          ? (e) => {
              move(e)
              onPointerMove?.(e)
            }
          : onPointerMove
      }
      {...rest}
    />
  )
})
