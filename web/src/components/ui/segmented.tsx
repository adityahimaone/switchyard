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
      className={cn("inline-flex rounded-control border border-line bg-well p-0.5", className)}
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
            "transition-colors duration-100",
            "focus-visible:ring-[3px] focus-visible:ring-focus/40",
            o.value === value
              ? "bg-raised text-ink shadow-xs"
              : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
