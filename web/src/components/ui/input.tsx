import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Input shell: icon + native input + optional trailing addon. Ported from the
 * reference, which styles the whole group as one bordered control rather than
 * wrapping a bare input.
 */
function InputGroup({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="input-group"
      className={cn(
        "group/input flex h-8 cursor-text items-center gap-2 overflow-clip rounded-control border-[0.8px] border-line bg-surface py-2 pr-2 pl-2.5",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-line-strong",
        "focus-within:border-line-strong focus-within:shadow-[0_0_0_3px_rgb(from_var(--c-focus)_r_g_b_/_0.18)]",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "min-w-0 flex-1 bg-transparent text-[13px] leading-none text-ink outline-none placeholder:text-ink-3",
        "[&::-webkit-search-cancel-button]:hidden",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="input-group-addon" className={cn("flex shrink-0 items-center", className)} {...props} />
}

/** Plain input, for forms that are not icon-and-addon groups. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        /* `glass-flat` rather than `bg-well`: an input is a raised surface, so
           it carries the glass tint and elevation rather than a flat well
           colour. Deliberately NO `backdrop-filter` — an input is small, always
           sits on a panel that is already glass, and blurring it would diffuse
           nothing while adding a compositing layer per field. The inset shadow
           is what makes it read as a well you type *into*, which is the whole
           reason a filled surface beats an outline at this size. */
        "glass-flat h-8 w-full min-w-0 rounded-control px-3 py-1 text-sm outline-none",
        "shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.18)]",
        "transition-[border-color,background-color] duration-100",
        /* `selection:text-on-accent`: selected text sits on a filled accent
           background, so it takes the on-accent token rather than
           `--c-accent-ink` — which is near-black in dark and would put dark
           type on a mid-blue selection. */
        "placeholder:text-ink-3 selection:bg-accent selection:text-on-accent",
        /* Focus is a real border change plus the ring, not the ring alone: a
           glow on its own is a colour cue, and the spec's own rule is that
           state is never carried by colour alone. */
        "focus-visible:border-accent focus-visible:shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.18),0_0_0_3px_rgb(from_var(--c-focus)_r_g_b_/_0.18)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-danger",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input, InputGroup, InputGroupInput, InputGroupAddon }
