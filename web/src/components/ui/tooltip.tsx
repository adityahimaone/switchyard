import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // Origin-aware: scales from the trigger, not from centre. Closed state
          // leaves at 97% so nothing appears from nothing.
          /* The one surface that was deliberately *not* glass: `bg-raised` with
             no filter. Now it takes the smallest blur tier instead of none —
             a tooltip is always over something, so there is always something to
             diffuse, and 12px is cheap because at most one is on screen. The
             opaque `bg-raised` is what made it read as a floating label rather
             than as part of the page. */
          "z-overlay w-fit origin-(--radix-tooltip-content-transform-origin) glass-strong rounded-sm px-2 py-1 text-xs text-ink",
          "transition-[transform,opacity] duration-150 ease-[var(--ease-out-quint)]",
          "data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0",
          "data-[state=delayed-open]:scale-100 data-[state=delayed-open]:opacity-100",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
