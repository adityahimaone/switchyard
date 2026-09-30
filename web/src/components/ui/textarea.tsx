import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content max-h-52 min-h-16 w-full rounded-control border border-line-strong bg-well px-3 py-2 text-sm outline-none",
        "transition-[border-color,background-color] duration-100 ease-[var(--ease-out-quint)]",
        "placeholder:text-ink-3",
        "focus-visible:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-danger aria-invalid:outline-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
