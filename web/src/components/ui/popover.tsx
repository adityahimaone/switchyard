import * as React from "react"
import { cn } from "@/lib/utils"
import { Popover as PopoverPrimitive } from "radix-ui"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        /* Viewport-relative max-height rather than a fixed one. The Radix portal
           escapes every `overflow: hidden` ancestor — measured, there is no
           clipping ancestor in this app — so content past the viewport edge is
           genuinely unreachable here: `html, body, #root` are `height: 100%`
           with `overflow: visible`, so the page cannot scroll to reveal it.
           Letting the panel shrink is what keeps it on screen; callers can
           still override via className. */
        className={cn(
          /* `shadow-xl` came off: `glass-strong` carries `--glass-lift-strong`
             now, and the two were fighting — the float shadow won, which is how
             the popover ended up with a harsher, closer shadow than the dialog
             it floats above. */
          "z-overlay max-h-[calc(100dvh-2rem)] w-72 origin-(--radix-popover-content-transform-origin) rounded-control p-1 text-ink outline-none",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          /* The sheen, not the dialog bloom: a popover sits beside its trigger
             and has no "top" to be lit from, so the gradient rim reads as an
             edge catching light while the bloom would read as a halo. */
          "glass-strong glass-sheen",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
