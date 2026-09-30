import type { SVGProps } from "react"
import { cn } from "@/lib/utils"

/**
 * Switchyard brand mark: a rounded "S" built as one continuous stroke, reading
 * as both the initial and a track switch between two curves.
 *
 * Drawn as a stroked path rather than a filled outline so the terminals stay
 * perfectly round and the weight stays even at any size. On a 64-unit grid with
 * a 14.5 stroke, so it fills the box the way the reference mark does.
 *
 * Legible down to 16px, so it is used in the sidebar, on favicon and in empty
 * states. `currentColor`, so one component serves every surface.
 */
export const LogoMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
    <path
      d="M48 18c-3.4-3.4-8.6-5-14.4-5-9.2 0-16.2 5-16.2 11.6 0 5.6 4.4 8.2 13 11 7.6 2.5 11.8 5 11.8 10.2 0 4.8-4.8 8-11.8 8-6 0-11-2-14.2-5.6"
      stroke="currentColor"
      strokeWidth="14.5"
      strokeLinecap="round"
    />
  </svg>
)

/**
 * The full-colour mascot. Blue-on-blue reads well on the canvas, and this is
 * the one place the original artwork belongs: sign-in and empty states, where
 * there is room for it to carry its detail.
 */
export const LogoMascot = ({ className, alt = "" }: { className?: string; alt?: string }) => (
  <img
    src="/brand/mascot-switchyard.png"
    alt={alt}
    width={320}
    height={320}
    className={className}
    draggable={false}
  />
)

/**
 * The wordmark. Set as text in the UI font rather than as an SVG path: a
 * hand-written path renders as nonsense letterforms, and the reference sets its
 * own name as text too. It inherits `currentColor` and the same `opsz` axis as
 * the body, so it matches the surrounding UI exactly.
 */
export const LogoWordmark = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "text-[17px] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-ink",
      className,
    )}
  >
    Switchyard
  </span>
)
