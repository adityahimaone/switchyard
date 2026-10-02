import type { CSSProperties, ComponentType, PointerEvent } from "react"
import { cn } from "@/lib/utils"
import { capturePointer, releasePointer } from "@/lib/touch"

/**
 * One node on the flow map.
 *
 * Opaque on purpose. This was `glass-card` over a flat `bg-canvas` dotted ground,
 * where `backdrop-filter` has nothing behind it to diffuse — the compositing cost
 * with none of the benefit, and in dark mode `--glass-tint` is only 40% opaque, so
 * every node washed out against the canvas. It also painted an 18px glow in its own
 * colour, which layered the transparency twice. `design-surfaces.md` §12 specifies
 * these nodes as `surface` with a 1px `line`, which is what this is.
 */
export function FlowNodeCard({
  label,
  sub,
  icon: Icon,
  color,
  count,
  meta,
  selected = false,
  idle = false,
  onSelect,
  onDragStart,
  onDragMove,
  onDragCancel,
  style,
  className,
}: {
  label: string
  /** Shown when the node has no task routed through it. */
  sub: string
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  /** Token name or CSS colour for the tick, icon and meta. */
  color: string
  /** Tasks currently routed through this node. Omit or 0 to hide the pill. */
  count?: number
  /** Replaces `sub` when the node has a live task, e.g. `task_142`. */
  meta?: string
  selected?: boolean
  /** No tasks anywhere on the map — the graph is parked. */
  idle?: boolean
  onSelect: () => void
  onDragStart: (e: PointerEvent<HTMLButtonElement>) => void
  onDragMove: (e: PointerEvent<HTMLButtonElement>) => void
  /** The gesture was taken over by the browser or the system — drop it. */
  onDragCancel: () => void
  /** Position within the transformed graph layer. */
  style?: CSSProperties
  className?: string
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        capturePointer(e.currentTarget, e.pointerId)
        onDragStart(e)
      }}
      onPointerMove={onDragMove}
      onPointerUp={(e) => {
        releasePointer(e.currentTarget, e.pointerId)
        onSelect()
      }}
      onPointerCancel={onDragCancel}
      aria-pressed={selected}
      title={meta ?? sub}
      className={cn(
        "absolute flex h-[52px] w-[200px] cursor-grab items-center gap-2.5 rounded-card border bg-surface px-3 text-left",
        "transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong hover:shadow-lift",
        "active:cursor-grabbing focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40",
        // Selection is a border, not a ring: a ring floats outside the 1px edge and
        // made the node read as two objects. Idle nodes drop to a quieter edge so a
        // parked graph does not shout nine identical cards at you.
        selected ? "border-accent" : idle ? "border-line" : "border-line-strong",
        className,
      )}
      style={style}
    >
      {/* Coupler tick — the node's connection to the rail, in its own status
          colour. Same idea as the tick on a task card. */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{ background: color }}
      />
      <Icon className="ml-1 size-3.5 shrink-0" style={{ color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{label}</span>
        <span
          className={cn(
            "block truncate text-xs text-ink-3",
            meta && "font-mono text-2xs",
          )}
        >
          {meta ?? sub}
        </span>
      </span>
      {count ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-well font-mono text-2xs text-ink-2">
          {count}
        </span>
      ) : null}
    </button>
  )
}
