import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  /* Tinted glass rather than a solid fill. The tint is the status hue at 14%
     and the border at 30%: enough to read as "this is a success/review/error
     badge" at a glance, not enough to become the loudest thing on a card. A
     solid fill put a saturated block of colour next to every title, which
     competed with the title itself.

     The border is NOT transparent-by-default any more. A tinted fill with no
     edge dissolves into whatever it sits on, which on a glass card is exactly
     the surface behind it. */
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-accent/30 bg-accent/14 text-accent-text",
        secondary: "border-line bg-raised/70 text-ink-2",
        destructive: "border-danger/30 bg-danger/14 text-danger-text",
        success: "border-success/30 bg-success/14 text-success-text",
        review: "border-review/30 bg-review/14 text-review-text",
        outline:
          "border-line bg-transparent text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "border-transparent bg-transparent [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "border-transparent bg-transparent text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
