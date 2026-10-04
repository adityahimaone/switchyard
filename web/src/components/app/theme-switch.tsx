import { Moon, Sun } from "lucide-react"
import { useTheme, type ThemePreference } from "@/hooks/useSettings"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Two states, light and dark.
 *
 * The store still understands "system", and that preference is honoured on load
 * — the pre-paint script in index.html reads it before React mounts, so nothing
 * flashes. What is dropped is the *choice* from the header: a three-way control
 * spends a third of its width on an option most people set once and never
 * touch, and it made the header control look like a settings group rather than a
 * switch.
 *
 * A control that already sits in the right size shows a check for what is
 * actually in effect, so the button is a report and not just a toggle.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  // Report what is true on screen, which is "system" resolved, not what was
  // stored. Otherwise the button claims light while the OS is showing dark.
  const resolved: "light" | "dark" =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme

  const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        /* Was `border-line bg-well` with an active pill of `bg-surface` — the
           one control on the frosted header that still used opaque fills, so it
           read as a dark slab pasted onto a glass bar. Both ends now take the
           material: the track is a recessed well (`glass-flat` plus an inset
           shadow) and the active pill stands proud of it (`glass-flat-strong`
           plus an outward lift), which is the same pairing Segmented uses. */
        "glass-flat flex h-7 shrink-0 items-center gap-0.5 rounded-control p-0.5",
        "shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.14)]",
        className,
      )}
    >
      {options.map(({ value, label, Icon }) => {
        const active = resolved === value
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-[6px] outline-none transition-[color,background-color,box-shadow] duration-150",
                  "focus-visible:ring-[3px] focus-visible:ring-focus/40",
                  /* The active pill is raised, not filled — same as the active
                     segment in `Segmented`, so the two controls in the header
                     read as one system. The accent bloom under it is a
                     non-colour cue that the choice is registered. */
                  active
                    ? "glass-flat-strong text-ink shadow-[0_1px_2px_rgb(0_0_0_/_0.2),0_0_12px_-4px_color-mix(in_srgb,var(--c-accent)_55%,transparent)]"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}