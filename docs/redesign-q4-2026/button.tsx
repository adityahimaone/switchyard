import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Variant names match the existing shadcn button (default, destructive, outline,
 * secondary, ghost, link) so call sites keep working. `signal` is new: the single
 * lantern-yellow "move work forward" action. Use at most one per screen.
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-control font-medium outline-none",
    "transition-[background-color,border-color,color,transform] duration-100 ease-out",
    "active:translate-y-px",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas hover:bg-ink/85",
        signal: "bg-lantern text-lantern-ink hover:brightness-95",
        secondary: "border border-line bg-raised text-ink hover:border-line-strong",
        outline: "border border-line-strong bg-transparent text-ink hover:bg-raised",
        ghost: "text-ink-2 hover:bg-raised hover:text-ink",
        destructive:
          "border border-danger/30 bg-danger-tint text-danger-text hover:bg-danger/20",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2.5 text-sm",
        default: "h-8 px-3 text-sm",
        lg: "h-10 px-4 text-base",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        icon: "size-8",
        "icon-lg": "size-10",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
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
