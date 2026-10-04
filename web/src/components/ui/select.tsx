import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"
import { useSpotlight } from "@/components/app/use-spotlight"

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
        /* A raised glass surface, not a flat tinted box.
         *
         * `glass-flat` gave the trigger a tint and a shadow but no edge, so a
         * closed select read as a rectangle painted on the page rather than
         * something you press. `glass-card` supplies the 1px hairline and the
         * radius alongside the elevation — and deliberately carries **no
         * backdrop-filter**, because a trigger sits on a panel that is already
         * glass and there is nothing behind it left to diffuse. The cost would
         * be one compositing layer per select on the page, paid all the time,
         * rather than only while one is open. */
        "glass-card flex w-fit items-center justify-between gap-2 rounded-control px-3 py-2 text-sm whitespace-nowrap outline-none",
        "transition-[color,border-color,box-shadow]",
        /* Focus is the accent ring, matching Input — the ring is the
           accessibility-relevant half, and the border change carries the state
           without relying on colour alone. */
        "focus-visible:border-accent focus-visible:shadow-[var(--glass-lift-card),0_0_0_3px_rgb(from_var(--c-focus)_r_g_b_/_0.18)]",
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
  /* The spotlight writes `--mx`/`--my` on the panel, so it needs the handler
   * rather than the CSS-only class. One panel, one handler: the rows inside
   * inherit the gradient without knowing about it. */
  const move = useSpotlight<HTMLDivElement>()

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        onPointerMove={move}
        className={cn(
          /* The panel is the only frosted surface in a select: it floats over the
           * page, so it is the one with something to diffuse. `glass-sheen` for
           * the gradient rim, `glass-spotlight` for the pointer highlight that
           * ties it to the trigger it came from.
           *
           * The rows inside it carry no elevation — see `SelectItem`. */
          "glass-strong glass-sheen glass-spotlight relative z-overlay max-h-[min(420px,calc(100dvh-4rem))] max-w-[calc(100vw-1rem)] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-control text-popover-foreground",
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
        /* No `glass-flat` on the row. That utility carries a `box-shadow`, and
         * putting it on every item means one shadow per row — on a long profile
         * or workspace list that is dozens of boxes each casting their own
         * shadow onto the panel above them, which is what made the list look
         * striped rather than frosted.
         *
         * A row inside an already-frosted panel needs no elevation of its own.
         * It needs a hover/focus state and nothing else, and that is what the
         * accent fill provides. The panel is the surface; the rows are content.
         *
         * `data-[highlighted]` rather than a hover transition, because a
         * transition on every row is a compositor layer per row. */
        "relative flex w-full cursor-default items-center gap-2 rounded-control py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
        "transition-colors duration-100",
        "data-[highlighted]:bg-accent/14 data-[highlighted]:text-ink",
        "data-[state=checked]:font-medium",
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
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-line", className)}
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
