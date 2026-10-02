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
        /* `glass-flat` replaces `glass-control`, which the stylesheet lists as
         * removed — it had no remaining definition, so the trigger was drawing
         * nothing of its own while the panel below it was genuinely frosted.
         * That inconsistency is why a closed select read as a flat box.
         *
         * The panel keeps `glass-strong` because it floats over the page; the
         * trigger only needs the tint and the lift to read as a surface, and a
         * blur here would be paid on every select on the page rather than only
         * while one is open. */
        "glass-flat flex w-fit items-center justify-between gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none",
        "transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "data-[placeholder]:text-muted-foreground",
        "data-[size=default]:h-9 data-[size=sm]:h-8",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
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
          /* `glass-strong`, not `glass-strong` on every row. The panel is the
           * only surface that needs to blur what is behind it: it floats over
           * the page. The rows inside sit on that panel, so blurring each of
           * them is pure cost — a backdrop-filter per row, none of which can be
           * batched. `contain` stops the browser from re-rasterising the whole
           * subtree as the list scrolls, which is the other half of the stutter
           * on a long list. */
          "glass-strong relative z-50 max-h-[min(420px,calc(100dvh-4rem))] max-w-[calc(100vw-1rem)] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-control text-popover-foreground",
          "contain-[paint]",
          /* A single short transform on open. The per-row stagger in a motion
           * select is what made a long list feel slow: every item animated in
           * sequence, so the last one arrived hundreds of milliseconds after the
           * panel. The panel moving is enough to say where it came from. */
          "transition-[transform,opacity] duration-150 ease-[var(--ease-out-expo)]",
          "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
          "data-[side=bottom]:data-[state=closed]:translate-y-[-4px] data-[side=bottom]:data-[state=open]:translate-y-0",
          "data-[side=top]:data-[state=closed]:translate-y-[4px] data-[side=top]:data-[state=open]:translate-y-0",
          "data-[side=left]:data-[state=closed]:translate-x-[-4px] data-[side=left]:data-[state=open]:translate-x-0",
          "data-[side=right]:data-[state=closed]:translate-x-[4px] data-[side=right]:data-[state=open]:translate-x-0",
          "data-[state=closed]:scale-[0.97] data-[state=open]:scale-100",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            /* `--radix-select-content-available-height` is the space Radix has
             * actually computed for this panel given the side it picked, so the
             * list shrinks to whatever fits rather than running off an edge. The
             * 420px matches the panel cap above; the two must agree, or the
             * inner floor becomes the real limit and the outer one is dead.
             *
             * `overscroll-contain` stops the scroll chaining to the board
             * behind an open select, which on a long list is the difference
             * between scrolling the options and scrolling the page out from
             * under them. */
            "min-h-0 max-h-[min(420px,var(--radix-select-content-available-height))] overflow-y-auto overscroll-contain p-1",
            position === "popper" &&
              "w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
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
        /* `glass-flat`, not `glass`. A backdrop-filter makes every element its own
         * compositing layer and the browser cannot batch them, so a long list
         * carrying one per row collapses the scroll. `glass-flat` keeps the tint
         * and the lift — the two cues that make a surface legible — and drops
         * only the blur. The surrounding panel already blurs the content behind
         * it, so the rows do not need to each blur their neighbours. This is the
         * same reasoning the stylesheet applies to dense list rows.
         *
         * The highlight is `focus`/`data-[highlighted]` rather than a hover
         * transition: a transition on every row means a compositor layer per row,
         * which is the cost this change is removing. */
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
        "glass-flat",
        "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        "*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
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
