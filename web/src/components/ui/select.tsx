import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      data-cuelume-toggle=""
      className={cn(
        /* `glass-control` was here and had been deleted from `index.css` during
           the lantern-era cleanup, so every select trigger was rendering with no
           background and no border at all — only `shadow-xs`. It now uses the
           same material as `Input`, which is what the rest of the app's fields
           resolve to, so a select and an input sitting side by side in the same
           toolbar match. `glass-flat` rather than `glass`: selects appear inside
           toolbars and cards, and a trigger is a control, not a floating panel. */
        "glass-flat flex w-fit items-center justify-between gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          // Viewport-relative max-height rather than a flat 300px. A select is
          // usually opened near the bottom of a window, where a 300px panel plus
          // the trigger runs past the viewport edge — and since the app root is
          // `height: 100%` with `overflow: visible` there is nothing to scroll
          // to recover it. Radix shrinks the panel to fit, but only if it is
          // allowed to shrink below this floor.
          //
          // Origin-aware: scales from the trigger. The exit mirrors the entry per
          // side, so the menu leaves toward the control that opened it instead
          // of fading in place.
          //
          // 200ms on --ease-out-expo. A select opens dozens of times a day, so
          // this is deliberately near-imperceptible — enough to say where it came
          // from, not enough to be waited on.
          "glass-strong relative z-50 max-h-[min(300px,calc(100dvh-4rem))] max-w-[calc(100vw-1rem)] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-control text-popover-foreground",
          "transition-[transform,opacity] duration-200 ease-[var(--ease-out-expo)]",
          "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
          "data-[side=bottom]:data-[state=closed]:translate-y-[-4px] data-[side=bottom]:data-[state=open]:translate-y-0",
          "data-[side=top]:data-[state=closed]:translate-y-[4px] data-[side=top]:data-[state=open]:translate-y-0",
          "data-[side=left]:data-[state=closed]:translate-x-[-4px] data-[side=left]:data-[state=open]:translate-x-0",
          "data-[side=right]:data-[state=closed]:translate-x-[4px] data-[side=right]:data-[state=open]:translate-x-0",
          "data-[state=closed]:scale-[0.97] data-[state=open]:scale-100",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            /* The inner viewport had its own flat `max-h-[300px]` floor,
               independent of the Content cap above. That floor is what actually
               bound the list, and it is why `position="popper"` panels still
               overflowed: Radix positions that variant against the trigger, so a
               320px panel on a 300px-tall window runs off the top edge and the
               Content's own `100dvh` cap could not rescue it — Radix will not
               push a popper past the trigger.

               `--radix-select-content-available-height` is the space Radix has
               actually computed for this panel given the side it picked. Deriving
               the floor from that lets the panel shrink to whatever fits on
               whichever side it opened, with the `min()` tail preserving the
               original 300px whenever there is room. */
            "min-h-0 max-h-[min(300px,var(--radix-select-content-available-height))] overflow-y-auto p-1",
            position === "popper" &&
              "w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
