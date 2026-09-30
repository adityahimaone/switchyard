import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Content width for a Collection page.
 *
 * A single centred column at a fixed cap is right up to about 1600px and wrong
 * past it: at 1920px the cap wasted 235px per side, at 2560px it wasted 555px,
 * and a single card floating in that space read as broken rather than sparse.
 *
 * So the cap exists to keep a *single* column from stretching to an unreadable
 * line length, and the grid adds columns as width arrives. Prose inside stays
 * capped separately at 64ch, which is the constraint that actually matters for
 * reading.
 */
export const COLLECTION_MAX = "1680px"

/** Page body: gutters, the shared cap, and a scroll area. */
export function CollectionPage({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {children}
    </div>
  )
}

/**
 * The centred, capped column. `wide` is for page chrome that should not be
 * narrower than the grid it sits above (toolbars, footers).
 */
export function CollectionBody({
  children,
  className,
  wide,
}: {
  children: ReactNode
  className?: string
  /** Opt out of the cap, for a full-bleed scroll area such as the board. */
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 md:px-6",
        !wide && "max-w-[1680px]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Responsive card grid. Two columns by default, one on narrow, then three and
 * four as the viewport grows so cards fill the row instead of leaving a gap.
 */
export function CollectionGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  )
}
