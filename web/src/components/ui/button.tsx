import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Ported from the reference's button, with its palette swapped for Signal Blue.
 * `outline` is the page-level control (white, hairline), `surface` is the
 * in-card control, and `default`/`signal` are the one forward action per screen.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium leading-none outline-none",
    "transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-out",
    "focus-visible:ring-[3px] focus-visible:ring-focus/40",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /** Frosted surface control. The page-level default.
         *
         * Flat rather than blurred, deliberately, and this is now a tier rule
         * rather than a per-component preference: a control sits on top of a
         * card that is already glass, so there is nothing behind it left to
         * diffuse. Measured on /skills before the glow field existed: 231 of
         * these were each carrying a `backdrop-filter`, which is 231
         * compositing layers the browser cannot batch. */
        default:
          "glass-flat rounded-control text-ink-2 hover:shadow-lift data-[state=open]:shadow-lift",
        /** The one forward action per screen.
         *
         * A gradient rather than a flat fill, because a solid accent rectangle
         * is the one shape in this UI that does not read as lit. Light comes
         * from the top-left everywhere else in the system, so the gradient runs
         * light-to-dark on the same axis and the top inner highlight sells it as
         * a raised surface.
         *
         * `from-accent/85 to-accent` rather than a `to-accent-lo`: there is no
         * `--color-accent-lo` in this palette, so that class silently generated
         * nothing and the button rendered **flat** — the one variant that is
         * supposed to look lit was the only one with no gradient. Both stops
         * are `accent` at two opacities now, which is the same ramp without a
         * token that does not exist.
         *
         * `text-on-accent`, not `text-accent-ink`. `--c-accent-ink` is near-black
         * in dark, which is right for accent text *on the canvas* but wrong on a
         * filled button: black type on this blue measures about 2.6:1 and is
         * unreadable. `--c-on-accent` is the token for type on a filled accent
         * surface, and it is white in both themes.
         *
         * Hover grows a bloom instead of brightening. That is the accent's own
         * colour, not a focus glow: this is a pointer affordance on the primary
         * action, and `--glow-ring` is reserved for keyboard focus, which is a
         * different thing and must not be inferred from hover. */
        signal:
          "rounded-control border border-accent/50 bg-linear-to-b from-accent/85 to-accent text-on-accent",
        secondary:
          "glass-flat rounded-control text-ink",
        outline:
          "rounded-control border-[0.8px] border-line-strong bg-transparent text-ink hover:bg-raised",
        ghost: "rounded-control text-ink-2 hover:bg-raised hover:text-ink",
        destructive:
          "rounded-control border border-danger/30 bg-danger-tint text-danger-text hover:bg-danger/20",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 text-xs",
        default: "h-8 gap-1.5 px-2.5 text-[13px]",
        lg: "h-10 gap-2 px-4 text-sm",
        "icon-xs": "size-6 p-1 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-6 p-1",
        icon: "size-8 p-2",
        "icon-lg": "size-10 p-2",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner, disables the button, and keeps its width. */
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  const primary = variant === "signal"
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-cuelume-press=""
      data-cuelume-release=""
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant, size }),
        /* The two states that need a shadow rather than a colour change.
           They live here rather than in the variant string because Tailwind
           cannot put a multi-stop `box-shadow` in a cva string and still have
           it merge — `twMerge` drops the second shadow, so a hover bloom added
           in the variant would have been silently discarded. */
        primary && [
          "shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.35),0_6px_16px_-6px_color-mix(in_srgb,var(--c-accent)_60%,transparent)]",
          "hover:shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.4),0_0_28px_-4px_color-mix(in_srgb,var(--c-accent)_65%,transparent)]",
          "active:translate-y-px",
        ],
        className
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button }
