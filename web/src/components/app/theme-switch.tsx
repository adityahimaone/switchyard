import { Moon, Sun } from "lucide-react"
import { useTheme, type ThemePreference } from "@/hooks/useSettings"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

/**
 * Theme switch for the header.
 *
 * A segmented control rather than a toggle button, because the app has three
 * states, not two: light, dark, and follow the OS. A toggle would have to lie
 * about one of them, and "system" is a real choice people make once and keep.
 *
 * 28px tall to sit in the header row without making the bar taller than the
 * controls either side of it.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "flex h-7 shrink-0 items-center gap-0.5 rounded-control border border-line bg-well p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.value === "dark" ? Moon : Sun
        const active = theme === option.value
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={option.label}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-[6px] outline-none transition-colors duration-150",
                  "focus-visible:ring-[3px] focus-visible:ring-focus/40",
                  active
                    ? "bg-surface text-ink shadow-lift"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{option.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}