import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** One topic: a heading, one-line description, then its rows. */
export function SettingsSection({
  title,
  description,
  danger,
  footer,
  children,
  className,
}: {
  title: string
  description?: string
  /** Danger sections get a red left border instead of a tinted card. */
  danger?: boolean
  /** Explicit save bar, for sections with server-side effects. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex max-w-[640px] flex-col",
        // A danger section gets a red left border instead of a tinted card, so it
        // reads as a boundary rather than as another group of settings.
        danger && "border-l-2 border-danger pl-4",
        className,
      )}
      aria-label={title}
    >
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-[56ch] text-sm text-ink-3">{description}</p>}
      {/* Rows are divided by hairlines, not wrapped in individual cards. */}
      <div className="mt-4 divide-y divide-line border-y border-line">{children}</div>
      {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
    </section>
  )
}

/** Label and help at the left, control at the right. */
export function SettingRow({
  label,
  help,
  htmlFor,
  children,
  className,
}: {
  label: string
  help?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-3", className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
        {help && <p className="mt-0.5 max-w-[56ch] text-xs text-ink-3">{help}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Small segmented control for Theme, Density and Reduce motion. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-control border border-line bg-well p-0.5"
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

/**
 * Palette picker. A segmented control would be wrong here: the choice is about
 * colour, and the only way to judge a colour palette is to see it. Each option
 * carries three real swatches — ground, surface, accent — so the choice is made
 * by looking rather than by reading a name.
 *
 * Laid out as its own stacked block rather than through `SettingRow`, which puts
 * the control on the right; three labelled swatches do not fit in that rail.
 */
export function PalettePicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; hint: string; swatch: [string, string, string] }[]
}) {
  return (
    <div role="radiogroup" aria-label="Colour palette" className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-2.5 rounded-card border p-1.5 pr-3 text-left outline-none",
              "transition-colors duration-100",
              "focus-visible:ring-[3px] focus-visible:ring-focus/40",
              selected
                ? "border-accent bg-accent-tint"
                : "border-line hover:border-line-strong",
            )}
          >
            {/* The three-band swatch: canvas, surface, then the accent. Sized in
                `em` so it tracks the control's font rather than a fixed pixel
                value, which is what keeps it aligned at any density. */}
            <span
              aria-hidden
              className="flex h-7 w-11 shrink-0 overflow-hidden rounded-[5px] border border-line"
            >
              {o.swatch.map((c, i) => (
                <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">{o.label}</span>
              <span className="block text-2xs text-ink-3">{o.hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
