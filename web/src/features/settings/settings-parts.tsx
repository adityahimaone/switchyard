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

// Segmented moved to components/ui: the Create Task dialog needs it too, and
// importing a UI primitive across features is the wrong direction. Re-exported
// here so the existing settings callers keep their import path.
export { Segmented } from "@/components/ui/segmented"
