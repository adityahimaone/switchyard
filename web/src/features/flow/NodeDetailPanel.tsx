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
const NODE_DESCRIPTIONS: Record<string, { summary: string; responsibilities: string[] }> = {
  "pen.dev Canvas": {
    summary: "Visual UI component sandbox with hot DialKit parameter tuning in isolated git worktrees.",
    responsibilities: [
      "Brainstorms & iterates components before task creation",
      "Live React sandbox with double-click element picking",
      "Direct handoff to Kanban task creation dialog",
    ],
  },
  "Kanban State": {
    summary: "Durable SQLite state machine managing task cards through their complete lifecycle.",
    responsibilities: [
      "Enforces validated transitions: todo → ready → running → review → done",
      "Maintains harness bindings, turn cursors, and run ownership fences",
      "Emits SSE state change events across the workspace network",
    ],
  },
  "Orchestrator": {
    summary: "High-level intent planning and context synthesis engine.",
    responsibilities: [
      "Extracts user intent into structured board tasks and dependencies",
      "Injects workspace CodeGraph and memory prerequisites",
      "Coordinates complex cross-service workflows",
    ],
  },
  "Task Dispatcher": {
    summary: "Task scheduler routing ready workloads to target hosts and executors.",
    responsibilities: [
      "Claims ready cards atomically with conflict resolution",
      "Resolves target worker hosts and continuity bindings",
      "Monitors worker health and triggers automated retries on timeouts",
    ],
  },
  "Memory + Prequest": {
    summary: "Context fact store and prequest knowledge cache.",
    responsibilities: [
      "Stores verified project facts, workspace rules, and user preferences",
      "Injects high-signal context into executor prompt buffers",
      "Prevents repeated mistake patterns across turns",
    ],
  },
  "Node-agent Server": {
    summary: "Central hub managing capability-based worker connections and authentication.",
    responsibilities: [
      "Maintains secure WebSocket/HTTPS tunnels with remote workers",
      "Dispatches bounded execution plans to worker agents",
      "Streams live terminal progress and diff provenance back to the board",
    ],
  },
  "Tailscale Transport": {
    summary: "Encrypted mesh network connecting host server to distributed worker machines.",
    responsibilities: [
      "Zero-config secure networking across cloud, Mac, and Windows nodes",
      "Direct peer-to-peer latency optimization for live streaming",
      "Isolated node access controls and capability isolation",
    ],
  },
  "Mac Worker": {
    summary: "macOS execution worker host running launchd-managed node-agent.",
    responsibilities: [
      "Executes tasks requiring macOS tooling, Xcode, or Apple Silicon",
      "Runs Hermes, Codex, DeepSeek, Claude Code, or Command Code",
      "Reports real-time memory and process heartbeat telemetry",
    ],
  },
  "Windows Worker": {
    summary: "Windows execution worker host running scheduled task daemon.",
    responsibilities: [
      "Executes tasks requiring Windows environment, PowerShell, or MSVC",
      "Supports native cmdc and omp.exe binaries",
      "Reports host capability matrix and workspace sync status",
    ],
  },
  "Review Gate": {
    summary: "Safety and verification checkpoint before changes are committed.",
    responsibilities: [
      "Displays git diffs and CodeGraph provenance without direct SSH",
      "Guards commit and commit_push behind approval gates",
      "Routes review feedback into continuation prompts for iterative refinement",
    ],
  },
}

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
  const desc = NODE_DESCRIPTIONS[label]

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

      <div className="space-y-4 px-4 py-4">
        {desc && (
          <div className="rounded-card border border-line bg-well/40 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-3">Architecture Role</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{desc.summary}</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-3">
              {desc.responsibilities.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="font-mono text-accent-text select-none">›</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
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
      </div>
    </aside>
  )
}
