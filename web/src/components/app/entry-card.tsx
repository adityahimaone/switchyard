import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * One card anatomy, three densities. Same system, different information
 * hierarchy — the rule the original card spec set out.
 */
const entryCard = cva(
  [
    "relative flex min-w-0 flex-col rounded-card border border-line bg-surface text-left",
    "transition-[border-color,box-shadow] duration-150",
    "hover:border-line-strong",
  ],
  {
    variants: {
      density: {
        identity: "gap-3 p-4",
        infrastructure: "gap-3 p-4",
        registry: "gap-1.5 p-3",
      },
      selected: {
        true: "border-accent shadow-active",
        false: "",
      },
    },
    defaultVariants: { density: "identity", selected: false },
  },
)

type EntryCardProps = VariantProps<typeof entryCard> & {
  /** Leading icon, avatar or lamp. */
  lead?: ReactNode
  /** Name. Truncates safely. */
  title: string
  /** One state on the right: a StatusLamp or a short text. */
  state?: ReactNode
  /** One secondary line. Pass `mono` for identifiers and URLs. */
  subtitle?: string
  mono?: boolean
  /** Labelled metrics row, e.g. "261 skills". */
  metrics?: ReactNode
  /** Footer: one primary action on the left, overflow menu on the right. */
  primary?: ReactNode
  overflow?: ReactNode
  /** Extra rows, e.g. an expanded model roster. */
  children?: ReactNode
  className?: string
}

export function EntryCard({
  density,
  selected,
  lead,
  title,
  state,
  subtitle,
  mono,
  metrics,
  primary,
  overflow,
  children,
  className,
}: EntryCardProps) {
  return (
    <article
      data-selected={selected || undefined}
      className={cn(entryCard({ density, selected }), className)}
    >
      <header className="flex min-w-0 items-center gap-2.5">
        {lead && <div className="shrink-0">{lead}</div>}
        {/* h2, not h3: the card title sits directly under the page h1, so
            jumping a level breaks the document outline. */}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={title}>
          {title}
        </h2>
        {state && <div className="shrink-0">{state}</div>}
      </header>

      {subtitle && (
        <p
          title={subtitle}
          className={cn("truncate text-xs text-ink-3", mono && "font-mono text-2xs")}
        >
          {subtitle}
        </p>
      )}

      {metrics && <div className="flex min-w-0 items-center gap-3 text-xs text-ink-2">{metrics}</div>}

      {children}

      {(primary || overflow) && (
        <footer className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">{primary}</div>
          <div className="flex items-center">{overflow}</div>
        </footer>
      )}
    </article>
  )
}

/** Small labelled metric: <Metric value={261} label="skills" /> */
export function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-display text-base font-semibold text-ink tabular">{value}</span>
      <span className="text-xs text-ink-3">{label}</span>
    </span>
  )
}
