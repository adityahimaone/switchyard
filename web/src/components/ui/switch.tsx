import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-cuelume-toggle=""
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-line-strong bg-well",
        "transition-colors duration-100 ease-[var(--ease-out-quint)] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "data-[size=default]:h-[1.15rem] data-[size=default]:w-8",
        "data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-ink ring-0",
          "transition-transform duration-100 ease-[var(--ease-out-quint)]",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          /* The thumb turns white when checked, not `--c-accent-ink`. That token
             is near-black in dark, which is correct for accent text on the
             canvas but wrong on top of a filled accent track — a dark thumb on
             a mid-blue track reads as a hole rather than a switch. */
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-on-accent",
          "data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
