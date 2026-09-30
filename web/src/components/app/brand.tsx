import type { SVGProps } from "react"
import { cn } from "@/lib/utils"

/**
 * Switchyard brand mark: the mascot octopus, reduced so it still reads as an
 * octopus at 24px (the sidebar size). Drawn with a filled head and punched-out
 * eyes, plus four stroked tentacles with curled tips.
 *
 * On a 24x24 grid so it aligns with the 16px nav icons. It is not legible below
 * 20px, so it is never rendered smaller than that.
 */
export const LogoMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
    <path
      d="M12 3.2c-4 0-7.2 2.8-7.2 6.3 0 .9.7 1.6 1.6 1.6h11.2c.9 0 1.6-.7 1.6-1.6 0-3.5-3.2-6.3-7.2-6.3Z"
      fill="currentColor"
    />
    {/* Eyes are punched out with a mask rather than a hard-coded colour, so the
        mark stays correct on the canvas, on a card, and on the sign-in surface. */}
    <mask id="sy-eyes">
      <rect width="24" height="24" fill="black" />
      <circle cx="9.2" cy="8.6" r="1.6" fill="white" />
      <circle cx="14.8" cy="8.6" r="1.6" fill="white" />
    </mask>
    <rect width="24" height="11.1" fill="currentColor" mask="url(#sy-eyes)" />
    <path
      d="M6.4 11.2c-.5 1.4-.4 2.6-.9 3.6-.5 1-.1 1.9.9 2.1.8.2 1.5-.3 1.6-1M17.6 11.2c.5 1.4.4 2.6.9 3.6.5 1 .1 1.9-.9 2.1-.8.2-1.5-.3-1.6-1M9.4 11.2c-.2 1.7-.2 3.2-.5 4.2-.3 1 .3 1.8 1.3 1.8.7 0 1.3-.5 1.4-1.1M14.6 11.2c.2 1.7.2 3.2.5 4.2.3 1-.3 1.8-1.3 1.8-.7 0-1.3-.5-1.4-1.1"
      stroke="currentColor"
      strokeWidth="1.9"
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
