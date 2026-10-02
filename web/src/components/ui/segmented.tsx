import { cn } from "@/lib/utils"

/**
 * Small segmented control for choosing between two or three options.
 *
 * It lives in components/ui rather than in the settings feature because it is
 * not a settings concern: the Create Task dialog uses it for Manual | Now, and a
 * cross-feature import for a 39-line primitive would be backwards.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      /* The track is a recessed well, so it takes an inset shadow rather than
         the outward one a raised surface gets. That direction is what tells
         you the active pill inside it is standing *proud* of the track. */
      className={cn(
        "glass-flat inline-flex rounded-control p-0.5",
        "shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.14)]",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 rounded-control px-2.5 text-xs font-medium outline-none",
            "transition-[color,background-color,box-shadow] duration-150",
            "focus-visible:ring-[3px] focus-visible:ring-focus/40",
            /* The active pill is the one forward-ish action in a 3-button row,
               so it gets a real elevation plus a faint accent bloom underneath.
               Both are non-colour cues: the lift says "this one is selected" and
               works when the hue does not separate. */
            o.value === value
              ? "glass-flat-strong text-ink shadow-[0_1px_2px_rgb(0_0_0_/_0.2),0_0_12px_-4px_color-mix(in_srgb,var(--c-accent)_55%,transparent)]"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
