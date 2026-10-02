import { X } from "lucide-react"
import type { FlowTask } from "./useFlowTasks"

/**
 * The node inspector, docked beside the map rather than floating over it.
 *
 * This was an `absolute right-0 shadow-2xl` aside that covered the right third of
 * the canvas, so reading a node meant losing the routing you were reading it
 * against. As a flex sibling it takes its own column, `border-l` carries the
 * separation (a docked surface is not floating over anything, so it should not
 * cast a float shadow), and the canvas beside it stays pannable.
 */
export function NodeDetailPanel({
  label,
  group,
  sub,
  color,
  task,
  stageColor,
  onClose,
}: {
  label: string
  /** Section eyebrow, e.g. `CONTROL PLANE`. */
  group: string
  sub: string
  color: string
  /** The task routed through this node, if any. */
  task?: FlowTask
  stageColor?: string
  onClose: () => void
}) {
  return (
    <aside
      aria-label={`${label} detail`}
      className="flex w-full shrink-0 flex-col overflow-y-auto border-l border-line bg-surface max-w-[320px]"
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p
            className="font-mono text-2xs uppercase tracking-[.16em]"
            style={{ color }}
          >
            {group}
          </p>
          <h2 className="mt-1 truncate text-base font-semibold tracking-tight text-ink">
            {label}
          </h2>
          <p className="mt-0.5 truncate font-mono text-2xs text-ink-3">{sub}</p>
        </div>
        <button
          type="button"
          aria-label="Close detail"
          title="Close detail"
          onClick={onClose}
          className="shrink-0 rounded-control p-1 text-ink-3 transition-colors hover:bg-well hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="px-4 py-4">
        <p className="text-2xs uppercase tracking-wider text-ink-3">Route activity</p>
        {task ? (
          <div className="mt-2 rounded-card border border-line bg-canvas p-3">
            <p className="text-sm font-medium text-ink">{task.title}</p>
            <dl className="mt-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-ink-3">Stage</dt>
                <dd
                  className="font-mono text-2xs"
                  style={{ color: stageColor }}
                >
                  {task.stage}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-ink-3">Task</dt>
                <dd className="truncate font-mono text-2xs text-ink-2">
                  {task.task_id}
                </dd>
              </div>
              {task.executor && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-ink-3">Executor</dt>
                  <dd className="truncate font-mono text-2xs text-ink-2">
                    {task.executor}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-xs text-ink-3">Updated</dt>
                <dd className="truncate font-mono text-2xs text-ink-2">
                  {new Date(task.updated_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-3">
            No matching task currently routed through this service.
          </p>
        )}
      </div>
    </aside>
  )
}
