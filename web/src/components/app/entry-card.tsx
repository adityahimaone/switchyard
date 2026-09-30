import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * One card anatomy, three densities. Same system, different information
 * hierarchy — the rule the original card spec set out.
 */
const entryCard = cva(
  [
    "relative flex min-w-0 flex-col text-left rounded-card",
    "transition-[border-color,box-shadow] duration-150 ease-out",
    // Hover lifts the card off its neighbours. Only the shadow moves — there is
    // no rim any more, so this is the entire hover affordance and it has to read.
    "hover:-translate-y-px",
    "motion-reduce:transform-none motion-reduce:transition-shadow",
  ],
  {
    variants: {
      // `registry` is the dense case: a profile can have hundreds of skills, and
      // every `backdrop-filter` is its own compositing layer that the browser
      // cannot batch. At that count the blur costs more than it shows. The
      // registry keeps the tint and the elevation and drops only the blur.
      material: {
        glass: "glass-card hover:shadow-lift",
        flat: "glass-flat hover:shadow-lift",
      },
      density: {
        // Identity and infrastructure carry the same information volume, so they
        // are the same shape. `registry` is denser because it lists rather than
        // describes.
        identity: "gap-2.5 p-3.5",
        infrastructure: "gap-2.5 p-3.5",
        registry: "gap-1 p-2.5",
      },
      selected: {
        true: "ring-[1.5px] ring-accent",
        false: "",
      },
    },
    defaultVariants: { material: "glass", density: "identity", selected: false },
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
  material,
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
      className={cn(entryCard({ material, density, selected }), className)}
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
