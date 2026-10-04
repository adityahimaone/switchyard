import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // 4px blur on the scrim is the only blur the system allows.
        "scrim fixed inset-0 z-overlay",
        "transition-opacity duration-200",
        "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          // 240ms on --ease-out-expo, in and out. Nothing here exceeds 300ms.
          /* No `shadow-float` any more: `glass-strong` already carries
             `--glass-lift-strong`, and listing both meant the float's six-stop
             shadow silently replaced the glass elevation — which is how the
             dialog ended up with a softer shadow than the sheet. */
          "fixed z-overlay flex flex-col glass-strong outline-none",
          "transition-transform duration-240 ease-[var(--ease-out-expo)]",
          "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
          /* The side border comes off the sliding edges: `glass-strong` draws
             a full 1px hairline now, and a second border on the same edge read
             as a doubled rule at this width. */
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 sm:max-w-[480px]",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 sm:max-w-[480px]",
          side === "top" &&
            "inset-x-0 top-0 h-auto data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto data-[state=closed]:translate-y-full data-[state=open]:translate-y-0",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            className={cn(
              "absolute top-4 right-4 rounded-md p-1 text-ink-3 outline-none",
              "transition-colors duration-150 hover:bg-raised hover:text-ink",
              "focus-visible:ring-[3px] focus-visible:ring-focus/40"
            )}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 p-4", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-lg font-semibold text-ink", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-ink-3", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
