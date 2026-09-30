import { cn } from "@/lib/utils"

/**
 * Switchyard brand mark: the "S" app icon, used as supplied.
 *
 * This is the real artwork from `public/brand/`, not a redraw. An earlier pass
 * hand-wrote an SVG approximation when the supplied logo was already sitting in
 * the repo, which produced something close but not the actual mark — the two
 * differ in stroke weight and in the curl of the terminals.
 *
 * The icon is a rounded-square tile: blue field, white S. That shape means it
 * carries its own background, so it is dropped in as an image rather than an
 * inline SVG tinted with `currentColor`. It reads correctly on any surface,
 * which is why the same file serves the sidebar, sign-in and the favicon.
 */
export const LogoMark = ({ className }: { className?: string }) => (
  <img
    src="/brand/switchyard-favicon-blue-512.png"
    alt=""
    width={512}
    height={512}
    className={cn("size-6", className)}
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
