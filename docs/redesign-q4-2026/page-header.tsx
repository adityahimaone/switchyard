import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Page-level title group. One h1 per page. Titles are nouns, actions are verbs.
 * `children` is the toolbar slot (filters, tabs) that sits under the title row.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-3 border-b border-line px-4 pt-5 pb-4 md:px-6", className)}>
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="text-xs text-ink-3">
          {breadcrumb}
        </nav>
      )}
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-[64ch] text-sm text-ink-3">{description}</p>}
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
