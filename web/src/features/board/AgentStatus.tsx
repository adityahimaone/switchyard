import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Check, ChevronDown, RotateCw, X } from "lucide-react"
import type { Task, TaskEvent } from "../../api"

const CHEVRON = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3)
  const column = index % 3
  return (column + Math.abs(row - 1)) * 90
})

const EVENT_LABELS: Record<string, string> = {
  created: "Task created",
  updated: "Task updated",
  assigned: "Agent assigned",
  unassigned: "Agent unassigned",
  promoted: "Moved to ready",
  demoted: "Moved to todo",
  scheduled: "Scheduled",
  claimed: "Worker claimed task",
  spawned: "Worker started",
  heartbeat: "Heartbeat",
  reclaimed: "Worker reclaimed",
  completed: "Completed",
  failed: "Failed",
  spawn_failed: "Spawn failed",
  blocked: "Blocked",
  gave_up: "Stopped",
  protocol_violation: "Protocol violation",
  status_changed: "Status changed",
}

const FAILURE_EVENTS = new Set(["failed", "spawn_failed", "blocked", "gave_up", "protocol_violation"])
const END_EVENTS = new Set(["completed", ...FAILURE_EVENTS])

export function useElapsed(startedAt?: number | null, endAt?: number | null, active = true) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active || endAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [active, endAt])

  const baseMs = startedAt ? startedAt * 1000 : null
  if (baseMs == null) return "0.0s"
  const seconds = Math.max(0, ((endAt ? endAt * 1000 : now) - baseMs) / 1000)
  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

function LoaderGrid() {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {CHEVRON.map((delay, index) => (
        <span
          key={index}
          className="size-1 rounded-[1px] bg-[var(--c-accent)]"
          style={{ opacity: 0.18, animation: `pixel-on 650ms ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  )
}

/* Synchronized circular progress ring: arc sweeps the circumference once per
   `period` so consecutive steps advance on the same beat. */
function ProgressRing({ step, total, period = 1100 }: { step: number; total: number; period?: number }) {
  const size = 24
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const share = Math.max(0.12, 1 / Math.max(1, total))

  return (
    <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={12} cy={12} r={radius} fill="none" stroke="var(--c-line-strong)" strokeWidth={stroke} />
        <circle
          cx={12}
          cy={12}
          r={radius}
          fill="none"
          stroke="var(--c-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * share} ${circumference * (1 - share)}`}
          style={{ animation: `ring-sweep ${period}ms linear infinite`, transformOrigin: "12px 12px", transform: `rotate(${(step - 1) * 137.5}deg)` }}
        />
      </svg>
      <span className="relative text-2xs font-semibold tabular-nums text-ink">{step}</span>
    </span>
  )
}

function ToneBadge({ tone, children }: { tone: "danger" | "success"; children: ReactNode }) {
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
        tone === "danger" ? "bg-danger text-white" : "bg-success text-white"
      }`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  )
}

const CheckIcon = <Check className="size-3" strokeWidth={3} />
const XIcon = <X className="size-3" strokeWidth={3} />
const RetryIcon = <RotateCw className="size-3" strokeWidth={2.5} />

function eventLabel(event: TaskEvent) {
  return EVENT_LABELS[event.kind] ?? event.kind.replaceAll("_", " ")
}

function eventData(event: TaskEvent) {
  if (!event.payload) return [] as [string, string][]
  try {
    return Object.entries(JSON.parse(event.payload) as Record<string, unknown>)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => {
        let display = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)
        if (typeof value === "string" && (value.trim().startsWith("{") || value.trim().startsWith("["))) {
          try { display = JSON.stringify(JSON.parse(value), null, 2) } catch { /* plain text */ }
        }
        return [key.replaceAll("_", " "), display] as [string, string]
      })
  } catch {
    return [["payload", event.payload]] as [string, string][]
  }
}

function eventTone(kind: string) {
  if (FAILURE_EVENTS.has(kind)) return "red"
  if (kind === "completed") return "green"
  if (kind === "claimed" || kind === "spawned" || kind === "heartbeat") return "running"
  return "pending"
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function RunningIndicator({ startedAt, endAt, compact = false }: { startedAt?: number | null; endAt?: number | null; compact?: boolean }) {
  const elapsed = useElapsed(startedAt, endAt, !endAt)
  return (
    <span role="status" aria-label={`Running for ${elapsed}`} className={`inline-flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
      <LoaderGrid />
      <span className="font-mono text-meta tabular-nums text-ink-3">{elapsed}</span>
    </span>
  )
}

export function splitAgentResult(result: string) {
  const markers = [...result.matchAll(/╭─\s*C:\\>\s*HERMES\s*─+/g)]
  if (markers.length < 2) return { working: result.trim(), final: "" }
  const finalStart = markers[markers.length - 1].index ?? 0
  return { working: result.slice(0, finalStart).trim(), final: result.slice(finalStart).trim() }
}

/* Agent Progress — collapsible multi-step block over real task events.
   Steps stagger in, the active step carries the synchronized ring, and the
   block can minimize while keeping its progress state mounted. */
export function AgentTaskStatus({ task, events }: { task: Task; events: TaskEvent[] }) {
  const [minimized, setMinimized] = useState(false)
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({})
  const [expanded, setExpanded] = useState(false)
  const rows = useMemo(() => [...events].sort((a, b) => a.created_at - b.created_at), [events])
  const startedEvent = rows.find((event) => event.kind === "claimed" || event.kind === "spawned")
  const finishedEvent = [...rows].reverse().find((event) => END_EVENTS.has(event.kind))
  const startedAt = task.started_at ?? startedEvent?.created_at
  const completedAt = task.completed_at ?? finishedEvent?.created_at
  const live = task.status === "running" && !completedAt
  const elapsed = useElapsed(startedAt, completedAt, live)
  const visibleRows = expanded ? rows : rows.slice(-6)
  const activeIndex = live ? visibleRows.length - 1 : -1
  const activeEvent = live ? visibleRows[activeIndex] : null
  const remote = /^\/Users\//.test(task.workspace_path) || /^[A-Za-z]:[\\/]/.test(task.workspace_path)
  const settled = completedAt && startedAt
  const totalSeconds = settled ? Math.max(0, (completedAt - startedAt)) : null

  return (
    <section className="glass-inset-card min-w-0 rounded-lg p-2.5" aria-label="Agent progress">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {live ? <LoaderGrid /> : <span className={`size-2 shrink-0 rounded-full ${task.status === "done" || task.status === "review" ? "bg-success" : "bg-ink-4"}`} aria-hidden />}
          <h2 className="truncate text-2xs font-semibold tracking-[0.14em] text-ink-3 uppercase">Agent progress</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-mono text-meta tabular-nums text-ink-3">
            {totalSeconds != null && !live
              ? `done in ${totalSeconds < 60 ? `${totalSeconds}s` : `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`}`
              : elapsed}
          </span>
          <button
            type="button"
            aria-expanded={!minimized}
            aria-label={minimized ? "Expand agent progress" : "Minimize agent progress"}
            onClick={() => setMinimized((value) => !value)}
            className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-[var(--c-line)]/50 hover:text-ink"
          >
            <ChevronDown className="size-3.5 transition-transform duration-200" style={{ transform: minimized ? undefined : "rotate(180deg)" }} />
          </button>
        </div>
      </div>

      {/* minimized keeps the active step visible so progress is preserved */}
      {minimized ? (
        <p className="mt-1.5 flex items-center gap-2 text-meta text-ink-2">
          {activeEvent ? (
            <>
              <ProgressRing step={rows.findIndex((row) => row.id === activeEvent.id) + 1} total={rows.length} />
              <span className="truncate">{eventLabel(activeEvent)}</span>
            </>
          ) : (
            <span className="truncate">{rows.length ? `${rows.length} steps recorded` : "Waiting for worker events…"}</span>
          )}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
            <span className="rounded border border-[var(--c-line)] bg-[var(--c-canvas)] px-1.5 py-0.5">{task.status}</span>
            {task.assignee && <span>agent: {task.assignee}</span>}
            {remote && <span>node: remote workspace</span>}
          </div>

          {rows.length > 0 ? (
            <div className="mt-2 max-h-48 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5">
                {visibleRows.map((event) => {
                  const tone = eventTone(event.kind)
                  const details = eventData(event)
                  const absoluteIndex = rows.findIndex((row) => row.id === event.id)
                  const isActive = event.id === activeEvent?.id
                  const open = openRows[event.id] ?? isActive
                  return (
                    <div key={event.id} className="overflow-hidden rounded-md border border-[var(--c-line)] bg-[var(--c-surface)]/50">
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-[var(--c-line)]/40"
                        aria-expanded={open}
                        onClick={() => setOpenRows((current) => ({ ...current, [event.id]: !open }))}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center">
                          {tone === "running" && isActive
                            ? <ProgressRing step={absoluteIndex + 1} total={rows.length} />
                            : tone === "green"
                              ? <ToneBadge tone="success">{CheckIcon}</ToneBadge>
                              : tone === "red"
                                ? <ToneBadge tone="danger">{XIcon}</ToneBadge>
                                : <ProgressRing step={absoluteIndex + 1} total={rows.length} period={0} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{eventLabel(event)}</span>
                        {tone === "red" && (
                          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-danger/10 px-2 text-2xs font-medium text-danger-text">
                            Failed
                            <span className="flex" style={{ animation: "spin 1.2s linear infinite" }} aria-hidden>{RetryIcon}</span>
                          </span>
                        )}
                        {tone === "green" && (
                          <span className="inline-flex h-5 items-center rounded-full bg-success-tint px-2 text-2xs font-medium text-success-text">Completed</span>
                        )}
                        <span className="shrink-0 font-mono text-2xs tabular-nums text-ink-3">{formatTime(event.created_at)}</span>
                        <ChevronDown className="size-3.5 shrink-0 text-ink-3 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : undefined }} aria-hidden />
                      </button>
                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-200"
                        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
                      >
                        <div className="overflow-hidden">
                          <div className="mb-2 grid grid-cols-[16px_1fr] gap-2.5 px-2.5">
                            <span aria-hidden className="mx-auto h-full w-px bg-[var(--c-line)]" />
                            <dl className="flex flex-col gap-1">
                              {details.length > 0 ? details.map(([key, value]) => (
                                <div key={`${key}-${value}`} className="flex items-baseline justify-between gap-3">
                                  <dt className="truncate text-meta text-ink-3">{key}</dt>
                                  <dd className="max-w-[62%] whitespace-pre-wrap break-words text-right font-mono text-meta tabular-nums text-ink-2">{value}</dd>
                                </div>
                              )) : <p className="text-meta text-ink-3">No event details</p>}
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : <p className="mt-2 text-meta text-ink-3">Waiting for worker events…</p>}

          {rows.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="-mx-1 mt-2 inline-flex h-7 items-center rounded px-1 text-2xs text-[var(--color-info)] hover:bg-[var(--c-line)]/50"
            >
              {expanded ? "Show latest 6" : `Show full timeline (${rows.length})`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
