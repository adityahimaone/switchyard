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
    "active:scale-[0.97]",
    "focus-visible:ring-[3px] focus-visible:ring-focus/40",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /** White control with a hairline. The page-level default. */
        default:
          "rounded-lg border-[0.8px] border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-raised hover:shadow-lift data-[state=open]:bg-raised",
        /** The one forward action per screen. */
        signal:
          "rounded-lg border border-accent bg-accent text-accent-ink hover:brightness-95",
        secondary:
          "rounded-lg border-[0.8px] border-line-strong bg-raised text-ink hover:border-line-strong",
        outline:
          "rounded-lg border-[0.8px] border-line-strong bg-transparent text-ink hover:bg-raised",
        ghost: "rounded-md text-ink-2 hover:bg-raised hover:text-ink",
        destructive: "rounded-lg border-[0.8px] border-danger/30 bg-danger-tint text-danger-text hover:bg-danger/20",
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
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-cuelume-press=""
      data-cuelume-release=""
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
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
