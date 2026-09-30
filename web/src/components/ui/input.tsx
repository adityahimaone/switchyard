import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-control border border-line-strong bg-well px-3 py-1 text-sm outline-none",
        "transition-[border-color,background-color] duration-100 ease-[var(--ease-out-quint)]",
        "placeholder:text-ink-3 selection:bg-accent selection:text-accent-ink",
        "focus-visible:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-danger aria-invalid:outline-danger",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
