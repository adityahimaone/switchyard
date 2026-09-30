import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Page-level title group. One h1 per page. Titles are nouns, actions are verbs.
 * `children` is the toolbar slot (filters, tabs) that sits under the title row.
 *
 * **Compact by default.** Title and description share one line and the
 * description truncates, because on a work console the title is the identifier
 * and the description is a nicety. That keeps the header at 52px instead of
 * costing 24px extra on every page for a sentence that is rarely read. The
 * description is still in the DOM, still readable to a screen reader, and
 * carries its full text as a `title` so hovering reveals it.
 *
 * `description` still takes the full second line when it is short enough to earn
 * it, which is most of them. `compact` forces the single-line form for pages
 * where the sentence is not worth the space regardless.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  children,
  compact,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  /** Force the single-line form even when the viewport is wide. */
  compact?: boolean
  className?: string
}) {
  const inline = compact || (typeof description === "string" && description.length <= 64)
  const full = typeof description === "string" ? description : undefined

  return (
    <header className={cn("flex flex-col gap-3 border-b border-line px-4 pt-4 pb-3 md:px-6", className)}>
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="text-xs text-ink-3">
          {breadcrumb}
        </nav>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
          {description &&
            (inline ? (
              <p
                title={full}
                className="hidden min-w-0 truncate text-sm text-ink-3 sm:block"
              >
                {description}
              </p>
            ) : (
              <p className="mt-1 max-w-[64ch] text-sm text-ink-3">{description}</p>
            ))}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** In-page group title. Use instead of card-in-card headings. */
export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 max-w-[64ch] text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
